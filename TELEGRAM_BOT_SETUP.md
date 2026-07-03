# Goose / SFS Telegram Bot — Setup & Use

A Telegram bot wired into the Nexus server (`server.mjs`, port 3001) so you can:

- **Watch your running loops & cascade prompts from your phone.** Any loop or script can post a status line; you get everything, Boris (Smiley Face Studios) gets only the curated milestones.
- **Give Umbruh tasks while you're away.** Send a text or a voice note; it runs through Umbruh's agentic tool loop on the Mac and reports back.

Built on the existing stack — Umbruh, Ollama, Piper TTS, Tailscale — so the bot lives in the same process as the voice portal. No new npm dependencies.

---

## One-time setup

### 1. Run the installer

Double-click `install-telegram.command` (in the System Development folder). It will:

- install `ffmpeg` + `whisper-cpp` via Homebrew (for transcribing voice notes),
- download the whisper `base.en` model,
- generate a `NOTIFY_SECRET`,
- write whisper paths into `~/Library/Application Support/Nexus/.env`,
- prompt you to paste your bot token.

### 2. Create the bot (if you skipped it in the installer)

In Telegram, message **@BotFather** → `/newbot` → follow the prompts. Copy the token (looks like `123456:ABC-DEF…`) into `.env`:

```
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
```

### 3. Get chat IDs

With `telegram.enabled` set to `true` and Nexus running, message your bot and send `/whoami`. It replies with your chat ID. Put it in `goose-director/goose.config.json`:

```json
"telegram": {
  "enabled": true,
  "directorChatId": "<your id>",
  "borisChatId": "<Boris's id>"
}
```

Have Boris message the bot and send `/whoami` too, then add his ID as `borisChatId`. (He must message the bot first — Telegram bots can't initiate contact.)

### 4. Deploy

Run `deploy-voice.command` to copy config + restart Nexus. On boot the log shows `[Telegram] bot online as @yourbot`.

---

## Daily use

### From your phone → the Mac

- **Text:** "check disk space and tell me what's eating it" → Umbruh runs the tools, replies.
- **Voice note:** hold the mic, speak the task. It's transcribed, echoed back as `🎙 "…"`, then executed. You get a text reply plus a spoken Umbruh reply when possible.
- Multi-turn: the bot keeps short-term memory per chat. `/reset` clears it.
- Irreversible actions (deletes, git push, overwriting key docs) are confirmed before running.

Commands: `/status` (latest loop status), `/whoami`, `/reset`, `/help`.

### From a loop / cascade → your phone

Any running process posts a status line by calling the helper:

```bash
./goose-notify.command "SFS↔Goose merge: archive intake pass done"
./goose-notify.command "v0.2 cut shipped" all milestone
```

- `audience` (2nd arg): `director` (default, you only) or `all` (you + Boris).
- `tag` (3rd arg): if it's in `telegram.borisTags` (`milestone`, `release`, `proposal`, `merge`), Boris receives it even when audience is `director`.

Or POST directly (for cascade prompts that can run curl):

```bash
curl -s -X POST http://localhost:3001/api/notify \
  -H "Content-Type: application/json" \
  -H "x-notify-secret: $NOTIFY_SECRET" \
  -d '{"text":"step 3 complete","audience":"director"}'
```

### Automatic loop posts (no wiring needed)

The bot watches `DIRECTOR_STATUS.md` and the Incubation Chamber `LOOP_LOG.md`. When a new `**Built:**` entry appears, it posts the event to you and the milestone to Boris — automatically. To watch the **SFS Vault** loop logs once that repo is mounted, add their paths to `telegram.watchPaths` in the config (absolute, or relative to `repoPath`).

---

## Curation model (you vs. Boris)

| Source | You (Director) | Boris (SFS) |
|--------|----------------|-------------|
| `notify` audience `director` | ✅ | — |
| `notify` audience `all` | ✅ | ✅ |
| `notify` tag in `borisTags` | ✅ | ✅ |
| Auto loop-log `**Built:**` event | ✅ (full event) | ✅ (milestone line) |
| Inbound task replies | ✅ (your chat only) | — |

You see everything. Boris sees only what's explicitly marked `all` or tagged as a milestone.

---

## Security notes

- Only `directorChatId` and `borisChatId` can issue tasks. Any other chat gets a "not authorized" reply (but can still use `/whoami` to discover its ID for you to add).
- `/api/notify` requires the `x-notify-secret` header. This matters because Nexus is reachable over Tailscale Funnel — without the secret, anyone who found the URL could spam the feed.
- Secrets (`TELEGRAM_BOT_TOKEN`, `NOTIFY_SECRET`, whisper paths) live in `~/Library/Application Support/Nexus/.env`, never in `goose.config.json` or git.
- Inbound tasks run with full tool access (`run_bash`, etc.) under your delegated authority. Treat the bot like a logged-in terminal: only `directorChatId`/`borisChatId` should be people you trust with that.

---

## Troubleshooting

- **`[Telegram] disabled`** in logs → set `telegram.enabled=true` and ensure `TELEGRAM_BOT_TOKEN` is in `.env`.
- **Voice notes say "couldn't transcribe"** → re-run `install-telegram.command`; confirm `WHISPER_CPP_BIN`/`WHISPER_CPP_MODEL` in `.env` and that `ffmpeg` is on PATH.
- **No voice reply, only text** → `ffmpeg` needs `libopus`; the text reply always works regardless.
- **Bot silent** → check Nexus is running and `getMe` succeeded in the logs; only one process may long-poll a token at a time.

---

## Fix log — 2026-07-03: two-way channel restored + Claude escalation

**Symptom:** voice notes (and texts) to the bot only echoed the transcript back; no answer ever came.
**Root cause:** `runAgentLoop` (server.mjs) and three other call sites hardcoded `model: 'umbruh'` — a model name that ceased to exist when the 32B host was scratched (2026-07-01) and the local build became `umbruh-lite`. Every Ollama call 404'd; the poll loop swallowed the exception; the channel went silent after the 🎙 transcript echo.
**Fixes (applied to dev tree AND /Applications/Nexus.app/Contents/Resources/app, Director-approved):**
1. Model resolution: `UMBRUH_MODEL = env UMBRUH_MODEL || config.umbruhLocalModel || 'umbruh-lite'`, used at all four call sites (+ voice-context lookup accepts `umbruh-lite`).
2. `goose.config.json` `repoPath` corrected from the legacy pre-migration System Development tree (now archived) to `/Users/goose/Documents/goose-agent-system` (both configs) — Umbruh's Modelfile/persona/memory reads were pointing at the pre-migration copy.
3. **Two-brain routing (telegram.mjs):** light tasks → local umbruh-lite agent loop; messages prefixed `deep`/`claude`, any local-loop failure, empty reply, or step-limit → escalate to the Claude CLI headless (`-p … --output-format json --dangerously-skip-permissions`, cwd = goose-agent-system, 5-min timeout, async execFile so the poll loop never blocks). Claude-relayed replies are marked 🧠. If both paths fail the bot sends an honest error — the channel never goes silent by design.
**Verified:** umbruh-lite answers on Ollama; Nexus relaunched with patches; getUpdates probe returns 409 (Nexus holds the long-poll); /api/notify secret-gate live. Live two-way test: Director replies to the 2026-07-03 morning brief.
**Note:** rebuilding the app via install-nexus.command keeps the fixes (dev tree is patched identically).
