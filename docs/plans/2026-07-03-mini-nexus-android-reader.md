# Plan — "Mini Nexus": an Android reading surface for source docs, plans & proposals

**Repo:** `GTVGoose/goose-director` (PERSONAL / lineage C — Goose's own Nexus)
**Author:** Goose (David), 2026-07-03 · **Method:** 3-agent research swarm + bridge/Nexus inspection
**Status:** planned — build tomorrow. Test on personal Nexus first; promote to the generalized
product (lineage B) only after robust testing.

## The ask
A pocket "mini Nexus" on Android for reading reference material on the go — source
documents, plans, proposals, forks — the stuff that shouldn't bloat the morning brief.
Telegram is the suspected channel. Also: can we "send packages to set up apps" on the phone?

## TL;DR verdict
- **Don't build a native APK.** For a read-only reader it's all overhead and, as of 2026, a
  rising Google developer-verification tax (see Rejected). Telegram *can* deliver an APK, but
  the package isn't worth shipping.
- **Telegram is the right *channel*, not the right *library*.** Correct for push, launch, and
  quick PDF reads — but raw `.md` sent to the phone renders as a *download*, not a reading
  surface. Telegram carries and launches; something else reads.
- **Two surfaces win, in phases:**
  1. **Obsidian mobile reading a curated, sanitized sub-vault** — ship fast, boundary-airtight, already in Obsidian.
  2. **A Nexus mobile reader as a Telegram Mini App + PWA, served from the Mac over Tailscale** — the actual "mini Nexus," built on the existing goose-director Vite/React code.

## What's already true (no new build required)
- **The bridge already sends files.** `sfs-vault/_system/bin/vault_bridge.py` has `send_document`
  (multipart `sendDocument`) + a `send-file` CLI subcommand (added 2026-07-02 for morning-brief
  PDFs). Delivering a package (PDF/zip/APK ≤ **50 MB**, the Telegram bot cap) to the phone is a
  solved primitive today. Usage: `python3 _system/bin/vault_bridge.py send-file <path> --caption "..."`.
- **Nexus is already a Vite/React web app** (this repo). "Mini Nexus" is a *repackage/serve*
  problem, not a *build-a-native-app* problem.
- **The bridge runs drain-mode on this Mac** because Nexus already long-polls the bot token —
  which sets the one hard constraint below.

---

## Phased plan

### Phase 0 — DONE 2026-07-03 (zero build): push sanitized bundles on demand
Proven live: this plan was rendered to PDF and delivered to the phone via `send-file`. PDFs
**preview inline** in Telegram Android; markdown does not. So Phase 0 = "PDF-ify the curated
set, `send-file` it." Instant, no infra. This is the fallback path forever.

### Phase 1 — Obsidian curated sub-vault  ← recommended workhorse, low effort
- A sanitize/allowlist step writes **approved docs only** into a dedicated folder, e.g.
  `sfs-vault/_exports/phone-reader/` (or a Goose-side equivalent).
- Sync **just that folder** to Android via **Syncthing** (free, P2P Mac⇄Android) or Obsidian
  Sync (paid, selective-folder). Open it on the phone **as its own vault**.
- **Why this is the safety win:** the phone physically only ever holds the curated subset — the
  full vault is never on the device, so no bug/misconfig can leak it. Offline reading is native
  to Obsidian. Android caveat: mobile vaults must live in internal storage / a Download-type
  folder — point the sync target there.

### Phase 2 — the real "mini Nexus" (Telegram Mini App + PWA), built on goose-director
- **Build:** add a mobile, **read-only** view to this repo; make it a PWA with `vite-plugin-pwa`
  (`registerType: 'autoUpdate'`, precache the app shell, **`CacheFirst`** the documents →
  readable fully offline, even with the Mac asleep / phone in airplane mode).
- **Serve privately from the Mac** with **Tailscale** (`tailscale serve --https`): the phone
  joins the tailnet and hits the Mac at its `*.ts.net` MagicDNS name, which gets a real Let's
  Encrypt cert → the HTTPS secure context a PWA requires. No public exposure. (Cloudflare Tunnel
  = public, overkill; ngrok's 2026 free tier is gutted — 2-hr sessions, interstitials.)
  Note: `install-tailscale.command` already exists in `sfs-vault/GitHub/goose-system/System Development/`.
- **Wrap it in Telegram as a Mini App** for the app feel: a full-screen webview launched from the
  bot's menu button or a per-doc deep link (`t.me/<bot>/<app>?startapp=<docid>&mode=fullscreen`).
  Mini Apps 2.0 give it a **home-screen icon**, client-matched theming, and free spoof-proof auth
  by validating `initData` (HMAC of the bot token) → reader locked to Goose, no login to build.
- **Mac-awake caveat:** first load, fetching an un-cached doc, and picking up new content need the
  Mac awake + Tailscale up. Everything already cached reads offline. `CacheFirst` (or precaching
  the whole set) means a doc opened once stays readable forever.

## The one hard constraint (don't skip)
**One bot token = one update consumer.** This token is already long-polled by Nexus/the bridge;
a second poller returns `409 Conflict`. So the Phase-2 reader must **not** poll. Options, best first:
1. **Launch-only webview** — the Mini App is just an HTTPS page with its own backend; it never
   touches Telegram's update loop. (Simplest; recommended.)
2. **Own bot token** for the reader (a second bot).
3. Route reader commands **through the existing bridge process** (single consumer, dispatch
   internally) or move that token to a webhook (webhooks fan out; polling doesn't).

## Is Telegram the correct channel? — explicit answer
Yes, as **transport + launcher + quick-PDF viewer**. No, as the **reading library** if you just
send markdown (it downloads instead of rendering). Division of labor: **Telegram
carries/launches/notifies; Obsidian or the Mini App webview does the reading.**

## Rejected / deprioritized
- **Native APK** (Flutter/RN/Kotlin, or Capacitor/Tauri wrap): delivered via Telegram it works,
  but you inherit signing, update delivery, and 2026's Android developer-verification regime
  (enforcement starts Sept 2026; hobbyist free tier caps ~20 devices; the unverified "advanced
  flow" makes users reboot and wait a day). All overhead, no payoff for read-only markdown.
- **telegra.ph / Instant View:** viable zero-host fallback for static long-form text, but public
  (no auth), no library UX, and a known caching bug on edits.

## Recommended path
**Phase 1 first** (Obsidian curated sub-vault — safest, fastest), **Phase 2 as the product build**
(Nexus Mini App/PWA over Tailscale — the branded mini-Nexus that later promotes to lineage B).
Phase 0 is proven and available for one-off pushes.

## Open questions (decide before building)
1. Curated set: **auto-populate** from a `phone`/`reader` tag, or **hand-pick** per doc?
2. Phase 2 bot: **reuse the existing bot** as a launch-only webview, or a **second reader bot**?
3. Phase 1 sync: **Syncthing** (free, P2P) vs **Obsidian Sync** (paid, selective)?

## Next actions (tomorrow)
- [ ] Answer the 3 open questions.
- [ ] Phase 1: create the curated export folder + wire the sanitize step; set up Syncthing pair.
- [ ] Phase 2 scaffold: add `vite-plugin-pwa`, a `/reader` read-only route, manifest + icons.
- [ ] Stand up `tailscale serve --https`; verify PWA installs on the phone (secure context).
- [ ] Decide the bot approach; if launch-only webview, wire `initData` validation on `server.mjs`.

## Sources
Telegram Mini Apps / Bot API — core.telegram.org/bots/webapps, telegram.org/blog/fullscreen-miniapps-and-more.
PWA/Vite/Tailscale — MDN PWA guides, web.dev/learn/pwa, vite-pwa-org.netlify.app, tailscale.com/kb/1312/serve.
Android sideload/verification 2026 — developer.android.com/developer-verification, android-developers.googleblog.com (2026-03), 9to5google.
Obsidian mobile/sync — obsidian.md/help/sync-notes, forum.obsidian.md.
