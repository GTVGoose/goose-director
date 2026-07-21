> **UPDATE 2026-07-21 — blockers 1–3 fixed.** Implemented and verified in
> `gtvgoose/nexus`, PR #2 (`claude/beta-readiness-fixes`):
> - **Security chain closed** — Host-header allowlist middleware (kills the
>   DNS-rebind RCE/file-read class), `/api/config` refuses `/`/home/system vault
>   paths, voice PIN fails closed on the default + constant-time + rate-limited,
>   `open_app` now needs approval, `app.listen` handles `EADDRINUSE`. Verified
>   live (curl): attacker Host → 403, `repoPath:"/"` → 400, default PIN → locked.
> - **First-run wall removed** — vault-less mode: Setup leads with "Start using
>   Nexus →", app lands on chat/council, vault-only views hidden, chat-first +
>   Council label default-on. Verified in Chromium end-to-end.
> - **Cost meter wired** — persistent top-bar meter polling `/api/usage` on every
>   view; "restart to apply" copy corrected; `res.ok` checks + Knowledge catch;
>   stream parsers now packet-boundary-correct so the meter can't under-count.
>   Verified in Chromium (meter renders on a fresh session).
> - Also: `threads/**` removed from the DMG bundle; `BETA-TESTING.md` added.
>
> **Still open before a wider/anonymous release:** code signing + notarization
> (needs the Apple Developer cert — collaborators use right-click→Open until
> then), app icon, in-app update channel, budget persistence + per-call timeouts.
> The app is now ready for a trusted-collaborator beta (e.g. Alex Happy).

# Nexus PRODUCT (B lineage) beta-readiness audit — 2026-07-21

**Repo audited:** `gtvgoose/nexus` (the product build testers actually get), cloned and audited with
the same three-pass method used on the C repo, framed as: *does B fix the C blockers, and what's
still open?*

**Verdict: closer than C, but still not ready for outside testers.** B has had a real
productization pass — the worst personal-data leaks are genuinely fixed and the flagship Council now
ships in the product overlay. But a stranger still can't get past the first screen, and the audit
found a **new remote code-execution chain** that's more dangerous than anything in C. Realistic
distance: **~1 week**, with the security chain and first-run wall being the load-bearing work
(vs. ~1–2 weeks for C).

> Note: this session cannot reach the `smileyfacestudio/sfs-vault` repo (cross-owner add blocked),
> so "B" here is the standalone `gtvgoose/nexus` product app, which is the extracted DMG build.

---

## What B genuinely FIXED vs C (real progress — credit where due)

| C blocker | Status in B | Evidence |
|---|---|---|
| Personal config in the DMG (real Telegram chat ID, vault paths) | **FIXED** | `goose.config.json` ships blank: `repoPath:""`, `directorChatId:""`, telegram/membrane/gate `enabled:false`, no `/Users/goose` anywhere |
| App writes config into its own bundle (breaks signature) | **FIXED** | Config now reads/writes `NEXUS_USER_DATA` (userData), bundle is never mutated — signing-safe |
| First screen shows Goose's private agent roster | **FIXED** | First-run serves a neutral sample fleet (Orchestrator/Archivist/Optimizer), no personal names |
| Sandbox tool-exec gate fails OPEN when config key absent | **FIXED** | `sandboxEnabled()` now fails CLOSED; config ships `sandbox.enabled:false`; run_bash/write_file require approval |
| **Flagship Council missing from product overlay** | **FIXED** | `personal-extensions.jsx` is now populated — "Sandbox — Many models, one council" is in the nav and mounts for all users |
| No committed secrets / clean repo hygiene | **CONFIRMED** | No secrets in history; `.env` gitignored; examples/onboarding content is clean synthetic data |

The productization boundary is real work and most of it landed. The remaining issues are three
kinds: a security regression, the unchanged first-run wall, and UX/polish that undermines the pitch.

---

## BLOCKERS still open

### Security (the new worst-case)

- **SEC-1 · NEW: unauthenticated `POST /api/config` + missing Host-header check = remote RCE /
  arbitrary file read.** `/api/config` has no auth and accepts `repoPath:"/"` and
  `sandbox:{enabled:true, autoApprove:true}`. There's still no Host-header validation, so a
  DNS-rebinding webpage a tester visits (while Nexus sits in the tray) can: (1) POST that config to
  flip the sandbox on with auto-approve, (2) POST `/api/sandbox` to reach `run_bash` → `execSync` =
  arbitrary commands, **or** just `GET /api/file?p=etc/passwd` to read any file now that repoPath is
  `/`. The "sandbox ships disabled" defense is undone by the config endpoint being remotely
  flippable. This is *worse* than C, where the exposure at least required the sandbox to already be
  on. *Fix: (a) global Host-header allowlist middleware (localhost/127.0.0.1) — the single change
  that kills the whole DNS-rebind class; (b) a first-run-generated local token on all
  state-changing / tool / file endpoints; (c) don't let `/api/config` widen repoPath or enable the
  sandbox without explicit local confirmation.*
- **SEC-2 · Default voice PIN `1234`, no rate-limit, non-constant-time compare.** Still gates
  `/api/voice-relay` (the tool loop when sandbox is on). Trivially brute-forceable by any local
  process. *Fix: first-run random PIN, attempt lockout, constant-time compare.*
- **SEC-3 · `open_app` tool runs with no approval; approved `run_bash` is unconfined.** `open_app`
  isn't in the approval set; approved `run_bash` can read `~/.ssh/id_rsa` (documented "T4 gap").
  Acceptable only while the sandbox ships off — must close before sandbox is ever default-on.

### First-run (unchanged from C — the #1 usability blocker)

- **RUN-1 · The vault wall still traps a stranger.** App hard-returns `<Setup/>` whenever
  `repoFound===false` (guaranteed: config ships `repoPath:""`), and Setup only accepts an *existing*
  vault folder, described in "registry-style agent repo / SFS-style studio vault" vocabulary, with
  no skip, no "create for me", and no route to Settings. The new `onboarding/` package does **not**
  rescue this — it's a terminal script written for "an AI agent that already operates the user's
  personal vault," which a beta tester doesn't have. A stranger cannot even reach the API-key field.
  *Fix: a "continue without a vault" chat-only mode, or a "create a starter vault for me" button
  that scaffolds a folder server-side; gate the wall on "no vault AND user hasn't skipped."*

### Distribution

- **DIST-1 · No code signing / notarization.** Gatekeeper rejects an unsigned DMG ("Nexus is
  damaged"). *Fix: Developer ID cert + hardenedRuntime + entitlements + notarize hook (the Apple
  enrollment from punch-list step 2).*
- **DIST-2 · Missing `electron/icon.icns`.** `package.json` references it but the file doesn't
  exist → build may hard-fail or ship the generic Electron icon. *Fix: add a real 1024² icon.*
- **DIST-3 · `threads/**/*` still in `build.files`.** Latent chat-history leak the moment the build
  machine has run the app once. *Fix: delete the line (one minute).*

---

## MAJORS (fix before a beta feels trustworthy)

- **The cost meter is absent from B's entire UI.** `/api/usage` ships server-side but *no frontend
  file consumes it* — there is no spend display anywhere. The honest-cost-meter we're positioning
  the whole product around is not visible in the product build. For BYOK testers spending their own
  money, this is both a positioning hole and a real risk. *Fix: wire a meter into the top bar /
  ChatHome rail that polls `/api/usage`.*
- **"Restart Nexus to apply" is now false.** The backend applies keys live (clears the probe cache),
  but Settings still tells users to restart — sending testers hunting for a nonexistent step during
  the exact paste-key→chat moment. Still no "test key" validation button. *Fix: correct the copy,
  re-poll `/api/models`, add a per-key test probe.*
- **Chat-first landing is off by default.** `goose.config.json` ships no `ui` block, so `chatHome`
  is undefined → app lands on "Overview" and hides the Chat nav item. The flagship experience is
  behind a flag that's off. *Fix: default `chatHome` on in the product config.*
- **Streaming calls never check `res.ok`** (ChatHome/Sandbox/Invoke) → a server error renders as a
  silent empty reply.
- **Backend-down / failed fetches are silent** — Knowledge spins "Indexing…" forever (no catch),
  Invoke/Sandbox model fetches have no catch → dead Send button with no explanation.
- **Streaming parser under-counts the cost meter** — no carry-over buffer across packets; the final
  usage SSE event silently drops when split (the CLI path buffers correctly — copy it). Doubly bad
  given the meter is the pitch.
- **No per-call timeouts in the council engine** → a hung provider stalls a sequential council for
  minutes; no client-disconnect abort, so abandoned tabs keep burning tokens.
- **"Daily" budget never rolls over, isn't persisted, and errored partial streams bypass metering.**
- **`DELETE /api/threads/:id` path traversal** (unvalidated URL-decoded id → deletes any `.json`).

## MINORS / NOTES

`dotenv` is a dependency but never imported (hand-rolled parser stays); stale repo-local `.env`
overrides userData (precedence inversion); keys can't be cleared from the UI; port-3001 conflict =
uncaught crash / adopts a foreign process; no auto-update mechanism; `asar:false` ships readable
source; TTS shells a config path through `execSync` (injection-fragile); `/api/signal/*` registers
unconditionally though it idles without a vault; stale "David flips the flag at G7/G8" dev comments
in shipped source; `appId` still `com.goose.director`; preload version string out of sync.

---

## Distance to a testable B DMG

**~1 week of focused work**, in priority order:

1. **Security chain (SEC-1/2/3)** — Host-header allowlist + first-run local token + lock down
   `/api/config` + fix voice PIN + gate `open_app`. ~1 day. *Non-negotiable before any external
   link — this is remote RCE on a tester's Mac.*
2. **First-run vault-less/skip path + rewrite Setup copy (RUN-1)** — 2–4 days; product design, the
   real "installs vs usable" line. Also default `chatHome` on.
3. **Wire the cost meter into the UI + fix "restart" copy + res.ok/.catch/silent-failure states.**
   ~1–2 days. Makes the pitch true and the app feel trustworthy.
4. **Packaging: add icon, drop `threads/**`, port-conflict handler, then sign + notarize.** ~1 day
   incl. Apple latency (start enrollment now).
5. **Streaming buffer fix + timeouts + budget persistence.** ~1 day.

Then re-run the release-gate checklist on a clean Mac.

**Bottom line:** B is the right codebase and the productization work is real — the personal-data and
signature-safety problems that made C a 1–2 week job are already solved. What stands between B and
strangers is a genuine security hole (the `/api/config` + Host-header RCE chain), the first-run wall
that still assumes the user is Goose, and the fact that the product's headline feature — the honest
cost meter — isn't actually wired into the UI. None are huge individually; together they're about a
week, and item 1 must land before *any* outside download link exists.
