# Nexus beta-readiness audit — 2026-07-21

**Question:** is the general-use Nexus ready for outside people to test?
**Answer: No — not yet.** Three parallel audits (backend, frontend, packaging) against the release
gate in the MVP plan. A stranger installing today's build would get an unsigned app Gatekeeper
rejects, carrying personal data in plaintext, that boots into a wall of Goose/SFS vocabulary — and
if they got past it, the flagship Council feature isn't in the product overlay at all, and a
tool-execution endpoint would be live on their Mac with no auth.

**This is not a verdict on the work.** The core is good: the council relay's per-model failure
transparency is better than most competitors, the loopback bind + CORS + path-traversal guards are
thoughtful, key hygiene is clean (no secrets ever committed, keys never echoed or logged), and the
ChatHome experience (unit strip, cost meter, council inspector) was rated close to ship-quality.
The gap is the productization boundary: personal residue, first-run for someone who isn't Goose,
and a security posture safe for one trusted user but not for strangers. Estimate to a
stranger-testable DMG: **~1–2 focused weeks**, blockers first.

Full per-area detail in the three research-agent reports (session artifacts). Consolidated below.

---

## BLOCKERS — must fix before any external download link

### Security (backend)

- **B-SEC-1 · Arbitrary command execution ON by default, no auth.** `server.mjs:2879-2923`
  (`executeTool`: `run_bash` via `execSync`, `read_file`/`write_file` any path, `open_app`),
  reachable from `POST /api/sandbox` (no auth, `tools=true` by default, `:1848-1853`) and
  `/api/voice-relay`. The `sandboxEnabled()` gate (`:36`) returns **true when `config.sandbox` is
  absent** — and the shipped config has no `sandbox` key, so tool execution is live day one. A
  hallucinating local model could `rm -rf` a tester's Mac. *Fix: ship `sandbox.enabled:false`,
  flip the default to fail-closed, add a per-install random token on `/api/sandbox`.*
- **B-SEC-2 · No Host-header check → DNS-rebinding bypasses CORS.** `server.mjs:90-96`. CORS only
  withholds responses; a rebinding page reaches the loopback server with no cross-origin markers
  and gets full read + POST — i.e. remote `run_bash`, key overwrite, file read — from any website
  a tester visits while Nexus sits in the tray. *Fix: reject requests whose Host isn't
  localhost/127.0.0.1 (~5-line middleware).*
- **B-SEC-3 · Default voice PIN `1234` guards a tool-executing endpoint.** `server.mjs:2356` +
  `goose.config.json:11`, no rate-limit. Sole gate on `/api/voice-relay` (full agent loop) and
  `/api/voice-memory` (writes "secrets shared" to a plaintext file). *Fix: no default PIN —
  generate per-install; rate-limit attempts.*

### Personal-data leak (packaging + config)

- **B-LEAK-1 · Personal config ships inside the DMG, twice, in plaintext.** `package.json:55,59-64`
  bundle `goose.config.json`, which contains a **real Telegram chat ID (`8737054190`)**, `voicePin
  1234`, `/Users/goose` vault paths, `boundMember "david"`, Umbruh persona docs, telegram+gate
  `enabled:true`. `asar:false` makes it all right-click-readable. *Fix: product build generates a
  clean template config at package time; never bundle the personal file.*
- **B-LEAK-2 · Local thread/chat history bundled into the app.** `package.json:56` globs
  `threads/**/*` into the build from the build machine. *Fix: delete that line; runtime threads
  already live in userData.*

### Distribution (packaging)

- **B-DIST-1 · No code signing / notarization.** No `identity`/`hardenedRuntime`/`notarize`
  anywhere in the build block. Gatekeeper rejects an unsigned DMG on a stranger's Mac ("damaged,
  can't be opened"). *Fix: Developer ID cert (the Apple enrollment clock from punch-list step 2) +
  entitlements + notarize config.*
- **B-DIST-2 · App writes config into its own bundle.** `server.mjs:602,668` write to
  `Contents/Resources/goose.config.json`. Works unsigned; the first config save **invalidates the
  signature** the moment we sign, and fails on read-only installs. *Fix: seed-copy config to
  `userData` on first run; read/write only there. (Prerequisite for signing.)*

### First-run (frontend + backend)

- **B-RUN-1 · Setup demands a "vault" a stranger doesn't have, and blocks everything until they
  supply one.** `App.jsx:64-66` hard-returns `<Setup/>` whenever `repoFound===false` (guaranteed:
  shipped path is `/Users/goose/...`); Setup only accepts an existing folder, no skip / no
  create / no route to Settings, with copy about "Goose Agent System repo or SFS-style studio
  vault." Tester cannot even paste an API key. *Fix: auto-scaffold a default vault under
  userData on first run and drop into Chat/Settings; rewrite Setup copy without Goose/SFS terms.*
- **B-RUN-2 · The flagship Council isn't in the product build.** Chat renders only when
  `config.ui.chatHome` is truthy (`Sidebar.jsx:139`, `App.jsx:47`), and Council/Sandbox exists
  **only** through `personal-extensions.jsx` (`:21,39`) — the file the product ships *empty*. As
  wired, the product overlay has Overview + Invoke and no Council UI at all. *Fix: move
  Sandbox/Council into the shared build behind a product flag; default `chatHome` ON.*

---

## MAJORS — fix before beta feels credible (not necessarily before first install)

- **M-1 · Streaming parser drops text and under-counts the cost meter on packet boundaries.**
  `server.mjs:1457-1478/1519-1537/1562-1577`: chunks split into lines with no carry-over buffer,
  failed `JSON.parse` swallowed. The final usage event is a single line — if it splits, the
  "honest meter" silently under-counts. (The claude-code path buffers correctly — copy it.)
  *Directly undermines the meter we're positioning the whole product around.*
- **M-2 · No per-call timeout in the council engine.** `callModel`/`/api/relay` fetches have no
  AbortController; a hung provider stalls a sequential council up to undici's ~300s default — 3
  stalls = 15 min of spinner. No client-disconnect abort, so abandoned tabs keep burning tokens.
  *Fix: 60–120s AbortController per call; abort on `req.close`.*
- **M-3 · Streaming calls never check `res.ok`.** `ChatHome.jsx:233,294`, `Sandbox.jsx:140`,
  `Invoke.jsx:78` pipe the reader directly; a non-200 JSON error (bad key, restart) renders as a
  silent empty reply. *Fix: `if(!res.ok){setError(await res.text());return}` before reading.*
- **M-4 · Paste-key → chat needs a hidden full restart.** `Settings.jsx:696` "Restart Nexus to
  apply"; no key validation (SET badge just means a string was saved). Breaks the 10-minute
  onboarding gate. *Fix: hot-reload keys after save; add a "Test key" probe.*
- **M-5 · Backend-down / failed fetches are silent.** `Knowledge.jsx:27` Promise.all no catch →
  "Indexing…" forever; `ChatHome.jsx:100` swallows model/usage errors → empty pickers, Send
  silently disabled; `Invoke.jsx:33`, `Sandbox.jsx:87` no catch. *Fix: visible error/empty-with-
  reason states; treat 0 models as "none available".*
- **M-6 · Personal concepts leak through SHARED files that will ship.** Telegram bridge card
  (`Settings.jsx:98-210,821`), "Umbruh Director"/"Champion vs Challenger" modes + "Umbruh speaks
  through it" (`Sandbox.jsx:26-38,286`), "Director" as the user's name everywhere (ChatHome,
  Dashboard, StatusLayer, Sidebar), Goose/SFS vault labels (`Settings.jsx:441`, `Setup.jsx:4`).
  *Fix: strip Telegram/Umbruh from shared files; rename "Director" → "You".*
- **M-7 · First screen shows Goose's private roster.** With no vault, `/api/agents` serves the
  hardcoded personal map (`server.mjs:199-216,681`): Watcher, Adversary, sigils, "Canon Status."
  A stranger's "fleet" is someone else's mythology. *Fix: empty-state onboarding.*
- **M-8 · "Daily" budget never rolls over + errors bypass metering.** `server.mjs:1728-1735`
  in-memory `usage.since` set once at boot, labeled "USD/day"; after day 1 the breaker wrongly
  throttles everything to local, a restart zeroes spend, budget changes don't persist. Errored
  partial streams record $0 (`:1449,1511`). *Fix: roll at local midnight; persist to userData;
  record usage in `finally`.*
- **M-9 · `DELETE /api/threads/:id` path traversal.** `server.mjs:2262` joins an un-validated,
  URL-decoded id → arbitrary `*.json` deletion (exploitable via B-SEC-2). *Fix: validate id
  against `/^thread_\d+$/`.*
- **M-10 · Cost meter exists only in ChatHome.** Sandbox/Council and Invoke runs spend real money
  with no spend display; if `chatHome` is off there's no meter anywhere. *Fix: lift the meter into
  the app top bar.*
- **M-11 · Port 3001 conflict = uncaught crash or loading a foreign process.** `server.mjs:3313`
  no `.on('error')`; `main.cjs:47` accepts any HTTP <500 so a squatter answering 404 "succeeds."
  *Fix: handle EADDRINUSE (fall back to free port); require a Nexus-identifying /api/health body.*
- **M-12 · No update mechanism.** No `publish`/electron-updater. Testers can't get fixes without a
  re-emailed DMG. *Fix: electron-updater + GitHub Releases, or minimally an in-app version check.*
- **M-13 · Missing app icon.** `package.json:43` points at `electron/icon.icns` which doesn't
  exist → generic Electron icon in Dock/DMG. *Fix: create + commit the icon.*

## MINORS (representative — full list in area reports)

`.env` parser is hand-rolled and brittle while `dotenv` sits unused (`server.mjs:56`); userData
`.env` is *overridden* by a stale repo-local one (precedence inversion, `:41-53`); keys can't be
cleared from the UI (`:1047`); React rules-of-hooks violation in Settings `field()`
(`Settings.jsx:708`); Sandbox spinner doesn't spin; Enter-to-send fires mid-IME-composition (CJK
testers); Piper TTS hardcodes `/Users/goose/...`; aggregator-absent completes silently; unknown
paid models meter as $0.

## What's already good (keep, and lead the pitch with it)

Council per-model failure reporting is honest — `turn-error` SSE events, `done` always fires,
CouncilInspector renders per-member errors, synthesis-failure promoted to a banner. Loopback-only
bind, CORS lockdown, `/api/file` path-traversal guard, home-dir containment on multi-repo mounts.
Key hygiene: no committed secrets (repo + history clean), keys never returned or logged, Keychain
fallback. ChatHome cost meter (live $ + tokens, per-model breakdown, budget, estimate disclaimer)
is genuinely good — it just needs to be everywhere and packet-boundary-correct. Startup degrades
without crashing (missing repo/`.env`/Ollama all handled). `personal-extensions.jsx` is the right
containment architecture — the leaks are the personal strings that escaped it into shared files.

---

## Recommended sequence to "testable"

1. **Product-config templating + strip personal payload** (B-LEAK-1/2, B-SEC-1/3 defaults, M-6/M-7
   strings) — ~1 day. Kills the data-leak and the default-on exec surface in one pass.
2. **Config → userData migration** (B-DIST-2) — ~½ day; prerequisite for signing.
3. **Host-header middleware + per-install sandbox token + thread-id validation** (B-SEC-2, M-9) —
   ~½ day.
4. **First-run: scaffold-a-vault or vault-less chat mode + rewrite Setup copy** (B-RUN-1) — 2–4
   days; this is product design, the real "installs vs usable" line.
5. **Move Council into shared build, default chatHome on** (B-RUN-2) — ~1 day.
6. **Signing + notarization** (B-DIST-1) — 1–2 days incl. Apple enrollment latency (start now).
7. **Streaming buffer fix + res.ok + timeouts + silent-failure states + key hot-reload**
   (M-1..M-5) — 2–3 days; makes it *feel* trustworthy.
8. **Meter everywhere, budget rollover, port robustness, icon, update check** (M-8,10,11,12,13) —
   2–3 days.

Items 1–3 and 6 are non-negotiable before the first external link (data leak + Gatekeeper +
remote-exec). Items 4–5 are the difference between "it opened" and "I ran a council." The rest is
what turns a demo into a beta people trust. Then re-run the release-gate checklist on a clean Mac.

**Note on lineage:** this audits the personal (C) repo; the product (B) build ships from the
sfs-vault and is what testers actually get. Every fix above needs to land in the product lineage —
which this session can't see. Someone needs to confirm whether B already carries any of these
(e.g. a clean config template) or inherits all of it from the shared core audited here.
