# Proposal — Mini Nexus v2: pocket chat + domain layer on Android

**Repo:** `GTVGoose/goose-director` (PERSONAL / lineage C — Goose's own Nexus)
**Author:** Claude (Director-commissioned), 2026-07-11 · **Method:** repo/architecture inspection + 3-agent
research swarm (Telegram embeddability · Android app-shell/Tailscale · Adversary/Angel design review)
**Status:** proposed — awaiting Director decisions on the 3 open questions at the bottom.
**Relation to prior work:** extends `2026-07-03-mini-nexus-android-reader.md`. That plan solved the
*read-only* pocket Nexus (its Phase 0 is proven; Phases 1–2 stand). This proposal upgrades the concept
to what the Director actually asked for on 2026-07-11: **two-way chat in a Nexus-branded surface
(instead of opening Telegram) + a domain layer he can chat with and post domain updates to — all
routed to the Mac.**

---

## The ask

> "A little mini Nexus on my phone… a UI app with a similar looking interface, less capabilities…
> everything runs local on my computer… rather than opening Telegram — like embedding a YouTube video,
> couldn't we embed the Telegram chat into the app, or route it into the app? …a basic domain layer
> I can chat with and give domain updates… all routed to the local machine."

Two questions inside that ask:

1. **Can the Telegram chat be embedded?** (the YouTube-embed analogy)
2. **What's the right way to get one pocket surface** for chat + domain updates, backed by the Mac?

---

## Part 1 — The embed question, answered definitively

**No. Embedding a private 1:1 Telegram chat in your own app is impossible by design — not "hard,"
impossible in the YouTube-embed sense.** Verified against Telegram's widget catalog and API surface
as of mid-2026:

- **Telegram's embed widgets are public-content only.** The Post widget embeds messages from *public
  channels*; the Discussion widget embeds *public* comment threads. There is no widget, iframe, or URL
  that renders a private chat. A DM has no web-viewable address at all (`t.me/<bot>` is a deep link
  that opens the Telegram app — it renders nothing in-page).
- **The Bot API cannot read chat history.** History methods are MTProto-only; a bot sees messages
  only as they arrive, and Telegram retains undelivered updates ~24h. So no third-party app can fetch
  and render "the Telegram conversation" via the bot token.
- **The only real path is TDLib** — building an actual Telegram client (api_id/api_hash, MTProto
  login *as the Director's personal account*, auth state machine, local message DB). Effort: **15–30
  dev-days** for something polished, ongoing maintenance, ToS obligations, and a documented nonzero
  risk of Telegram's anti-spam banning accounts that log in via third-party clients. The asset at
  risk is the personal account. All of that to view one bot chat.
- **The tell:** every commercial product that advertises "embed Telegram chat on your site"
  (Intergram, Elfsight, etc.) secretly does the opposite — it renders *its own* chat UI and **relays**
  messages through a bot. The market already concluded embed is a dead end.

**The "route it into the app" instinct is exactly right, and it's cheap (3–8 dev-days).** The brain
is not in Telegram — it's `runTask()` on the Mac (umbruh-lite agent loop → Claude Max escalation).
Telegram is just one transport talking to it. The Telegram thread contains nothing the server didn't
produce or receive itself. So: give the mini Nexus its own chat UI that talks to the same brain
directly over Tailscale, and demote Telegram to what it's structurally best at (see Part 3).

---

## Part 2 — The app shell: installable PWA over Tailscale (not a native APK)

**Vehicle: a PWA served from the Mac, installed on Android via Chrome (WebAPK).** This confirms and
carries forward the 2026-07-03 plan's Phase-2 direction, now research-verified for the two-way case:

- **`tailscale serve --bg 3001`** → `https://<mac>.<tailnet>.ts.net/` reverse-proxies to the Express
  server, **tailnet-only** (no public exposure; Funnel not used). Tailscale auto-provisions and
  auto-renews a real Let's Encrypt cert — Android trusts it with zero device config, which satisfies
  the PWA secure-context requirement. Express serves the built Vite frontend + API from **one
  origin** → no CORS, clean service-worker scope.
- **WebAPK install works for tailnet-only sites** (Chrome ships the manifest/icons to Google's
  minting service; the site doesn't need to be publicly reachable). One-time caveat: the phone needs
  internet at install time. Result: real launcher icon, standalone dark-console window, themed
  status bar — *feels* native.
- **`vite-plugin-pwa`** (generateSW): precache the app shell (instant open, even offline);
  `NetworkFirst` (~3s timeout) for doc/domain API GETs so stale data shows when the Mac is away;
  **never** cache the chat/SSE routes. Known gotcha to avoid: no SVG-`sizes:"any"` icons (WebAPK
  mint-breaking bug).
- **Native APK rejected (still).** The 2026 developer-verification regime makes sideloading a
  moving target (enforcement began Sept 30 2026 in four pilot countries, global certified-device
  rollout 2027). A PWA sidesteps the entire regime. Escape hatches if a Capacitor wrap is ever truly
  needed: ADB installs are explicitly exempt, and the free hobbyist tier covers ~20 devices. Nothing
  in scope needs native APIs.
- **Web Push rejected for v1.** Chrome web push always transits Google's FCM (structurally impossible
  to keep on-tailnet), needs VAPID/subscription plumbing for exactly one recipient, and buys nothing
  over the already-working Telegram push. Future fully-local option, documented for later: self-hosted
  **ntfy** on the Mac over Tailscale.

---

## Part 3 — Architecture: one brain, three transports

The design-review pass (Adversary/Angel) found the naive version of "reuse runTask from a new
endpoint" wrong-shaped in two places. The corrected architecture:

### 3a. Extract `brain.mjs` — the refactor that IS the project

`runTask`, `triageNeedsDirector`, `buildSystem`, `handToDirector`, `runDirector` are currently
closures inside `initTelegram()` (telegram.mjs), coupled to chatId/sendDocument. They must be *moved*,
not called: a shared module with roughly
`brain.runTask(threadId, text, { channel, onDelta, deliverFile }) → job`.

- `telegram.mjs` becomes a thin transport adapter.
- The PWA chat becomes the second transport.
- **`/voice` is retrofitted as the third** — it currently calls `runAgentLoop` directly with *no*
  tiered escalation (an existing fork of the routing logic). The extraction heals that for free.
  End state: one brain, three surfaces — not three slightly-different brains.

### 3b. Chat is a job model, not a request-scoped stream (non-negotiable for mobile)

A Claude escalation runs up to 5 minutes. Android freezes locked/backgrounded tabs within minutes —
a request-scoped SSE stream dies at screen lock, the completed answer is written to nowhere, and the
retry spawns a *second* full-tool Claude run. Instead:

- `POST /api/chat` → returns `{ jobId }` immediately; the brain runs regardless of the socket.
- `GET /api/chat/stream/:jobId` → SSE as a **reconnectable view** onto the job (heartbeat comment
  every ~20s so proxies/radios don't reap it; no compression on this route; resume on
  `visibilitychange`). EventSource auto-reconnect does the heavy lifting.
- `GET /api/chat/job/:jobId` → final result survives any disconnect.
- **Escalated-job completion additionally fires the existing `notify()`** with a deep link
  ("🧠 Done — tap to view" → `https://<mac>.ts.net/m/chat?job=…`). Android PWAs capture in-scope
  links, so Telegram push → tap → opens the right PWA view. Telegram becomes the push layer for the
  PWA's own long tasks. Zero new push infrastructure.
- Screen Wake Lock (all browsers now) keeps the display on during an actively-watched stream;
  auto-released when hidden — resumption logic still mandatory.

### 3c. One canonical thread, persisted, serialized

There is exactly one Director, so there is exactly one conversation. Today's history is an in-memory
Map (lost on every restart — and restarts are routine) with a read-then-write race that drops turns
under concurrency.

- One canonical **"director" thread** on disk (append-only NDJSON), shared by Telegram, PWA, and
  `/voice`, each message tagged with its `channel`. "As I said earlier" works across surfaces —
  the system feels like one agent, not two dumber ones.
- A per-thread promise-chain mutex serializes `runTask` (fixes a latent race that exists in the
  Telegram path *today*).
- `/reset` works from every surface. Per-model queueing lives in the brain too, so Ollama contention
  surfaces as an honest "brain busy, queued" state instead of a mystery stall.

### 3d. Domain layer: read + quick-append (the killer mobile feature)

The Domains layer already exists server-side (`/api/domains` scans `domains/<domain>/` for docs +
`.ndjson` observation streams across the 8 layers). Mobile adds:

- **Read:** domain cards → doc reader → observation-stream tail (reuses existing endpoints).
- **Quick update:** mic (or text) → MediaRecorder captures `audio/webm;codecs=opus` (feature-detect,
  don't hardcode) → existing whisper on the Mac → **umbruh-lite structures it** into
  `{ ts, domain, type, note, source, transcript }` → **preview card → tap-confirm → append** to the
  domain's `.ndjson`. Always preview before append — a misheard health/finance observation written
  silently would erode trust in the whole layer. The raw transcript is stored alongside the
  structured fields so nothing is lost to bad structuring.
- **Offline outbox (observations ONLY):** IndexedDB + Background Sync queue with a **client-generated
  UUID per observation, deduped server-side** (NDJSON appends aren't idempotent; flaky-wake retries
  would double-append within a week otherwise). Chat is deliberately *not* offline-queued — a
  minutes-late answer is worse than an explicit failure, and Telegram already covers store-and-forward.

### 3e. The failure states are the product

From the phone, "Mac asleep" and "Tailscale toggled off" look identical (fetch fails). The precached
shell must always render — never a Chrome error page — and must **disambiguate**: if the internet is
reachable but the ts.net host isn't → "Tailscale looks off — open the Tailscale app"; otherwise →
"Nexus unreachable — Mac may be asleep," with a `tg://` deep link: **"send it via Telegram instead."**
~20 lines of probe code; the single biggest perceived-reliability win in the project. Telegram is
not the fallback — it is the **permanent store-and-forward spine** (messages queue on Telegram's
servers and deliver on Mac wake via the existing hardened poll loop). The PWA is the rich synchronous
window that's open when both ends are awake. Each surface does what it's structurally good at;
parity is explicitly a non-goal.

### 3f. Auth hardening — ships BEFORE the chat route (blocking)

The chat pipeline ends in Claude with `--dangerously-skip-permissions` — the endpoint is remote code
execution on the Mac by construction. Current mobile auth is a PIN that defaults to `1234`,
non-constant-time, unlimited attempts. Before `/api/chat` exists:

1. **Fail closed on default/unset PIN** — mobile routes refuse to serve until a real PIN is set.
2. Rate-limit PIN attempts (~5/min) + `crypto.timingSafeEqual`.
3. Check the **`Tailscale-User-Login`** identity header injected by `tailscale serve` — the
   tailnet-native equivalent of the Telegram chat-id allowlist, costs the Director nothing.
4. Scope `tailscale serve` path-mapping to `/m/*` + mobile API routes only. `/api/relay`, Sandbox,
   file endpoints stay loopback-only — and every endpoint whose comments assume "server is
   loopback-only" gets audited, since serve invalidates that assumption for whatever it exposes.
5. Server keeps its `127.0.0.1` bind (serve proxies to loopback; never `0.0.0.0`).

### 3g. Small enablers

- **Event log behind `notify()`** — today notify() fires and forgets, so a status feed has no data
  source. Wrap it to append `{ts, text, audience, tag}` to a capped NDJSON → `GET /api/events`
  (~30 lines) → the PWA status feed view.
- **Deep links appended to notify() text** so every Telegram push can open the relevant PWA view.
- **File delivery stays Telegram-only in v1.** Escalated jobs that produce PDFs keep using
  `sendDocument`; the PWA reply says "📎 sent to Telegram." One sentence of copy replaces an entire
  download subsystem (outbox dir, guarded file route, TTL cleanup, Android download UX).

---

## What's on the phone (scope cut)

| Mini Nexus (v1) | Stays desktop / Telegram |
|---|---|
| **Chat** — same tiered brain, `deep` prefix still forces cloud | Sandbox council UI (fire-and-forget button at most, in v2) |
| **Domains** — cards, doc reader, stream tail, voice/text quick-append | Multi-model relay picker (the tier router chooses on mobile) |
| **Status feed** — from the new event log | Repo/doc editing, agent management, anything Electron-native |
| Disambiguated offline states + Telegram handoff | Push notifications, file/PDF delivery, Boris channel, store-and-forward |

"Less capabilities for obvious reasons," made concrete: mobile gets the *conversational* and
*capture* surfaces; the *comparative-reading* and *editing* surfaces stay on the Mac.

---

## Build plan

### Phase A — Foundation refactor (~2–3 days, no UI yet; Telegram behavior unchanged)
- [ ] Extract `brain.mjs` (runTask/triage/escalation/system-build) out of `telegram.mjs`; retrofit
      Telegram + `/voice` as transports.
- [ ] Persist the canonical director thread (NDJSON) + per-thread mutex + channel tags.
- [ ] Job model: job store, `POST /api/chat`, SSE view w/ heartbeats, result fetch, notify()-on-completion
      with deep link.
- [ ] Event log behind notify() + `GET /api/events`.
- [ ] Auth hardening (§3f, all five items).
- [ ] `POST /api/domains/observe` (structured append, UUID idempotency) + umbruh-lite structuring step.

### Phase B — Mini Nexus PWA v1 (~3–5 days)
- [ ] `vite-plugin-pwa` + manifest (192/512 maskable icons, standalone, near-black `theme_color`) +
      Workbox strategies; `/m/*` mobile routes in the existing React app (theme.js/app.css reuse for
      the matching look).
- [ ] Chat view (job-model client, reconnect-on-visible, wake lock during active stream, voice input
      via MediaRecorder→whisper).
- [ ] Domains view (cards → docs/streams → quick-append with preview + offline outbox).
- [ ] Status feed view.
- [ ] Unreachable-state screens with Tailscale/asleep disambiguation + Telegram deep-link handoff.
- [ ] `tailscale serve` setup command (scoped paths) + verify WebAPK install on the phone.

### v2 (later, by observed need)
Live token streaming polish · TTS voice replies in the PWA · "convene council" fire-and-forget
button (completion via Telegram push) · browser file downloads if Telegram delivery chafes ·
observation-history visualizations · Ollama queue-state indicator · optional Telegram-side upgrade:
Bot API 9.5 `sendMessageDraft` streaming · optional Telegram Mini App wrapper around the same `/m`
pages (~1 day, gives an in-Telegram twin of the PWA with initData auth) · ntfy for fully-local push.

**Total v1 estimate: ~5–8 dev-days**, consistent with the independent research agent's 3–8-day
estimate for the route-in pattern (vs 15–30 for the rejected TDLib embed).

---

## Open questions for the Director (decide before Phase A)

1. **Thread unification:** one canonical "director" thread across Telegram + PWA + voice
   (recommended), or keep the mobile chat as its own thread?
2. **`/voice` retrofit:** fold the voice portal onto `brain.mjs` in Phase A (recommended — heals the
   existing escalation gap), or leave it untouched until after v1 ships?
3. **Telegram Mini App twin:** skip entirely (recommended for v1 — the PWA already gives the
   home-screen app feel), or add the ~1-day wrapper in v2 so the same UI is also reachable from
   inside Telegram?

## Sources (research swarm, 2026-07-11)

Telegram embeddability — core.telegram.org/widgets (+/post, /discussion), core.telegram.org/tdlib,
api/terms-of-use, bots/webapps, bots/api-changelog (9.3 topics-in-DMs, 9.5 sendMessageDraft),
github.com/idoco/intergram, github.com/tdlib/td issues (409/ban-risk threads).
PWA/Android/Tailscale — web.dev/learn/pwa, developer.chrome.com (install criteria, MediaRecorder,
wake lock), vite-pwa-org.netlify.app, tailscale.com/docs (serve, HTTPS certs, mobile battery),
tailscale#18827 (WS-through-serve instability → SSE choice), chromium-discuss (WebAPK for
non-public origins), developer.android.com/developer-verification + Android Authority/9to5Google
(2026 sideload regime timeline), docs.ntfy.sh.
Design review — grounded line-by-line in `telegram.mjs` and `server.mjs` of this repo.
