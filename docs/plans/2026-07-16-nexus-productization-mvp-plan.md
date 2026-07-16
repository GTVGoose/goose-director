# Nexus productization — MVP plan & today's punch list

**Date:** 2026-07-16 · **Author:** Claude (Director-commissioned)
**Context:** Studio meeting (Goose + Boris) — phase is *productization*. Goal: define the Nexus MVP,
plan the SFS Studio landing page, and lay out the fastest credible path to market.
**Repo note:** this repo is the PERSONAL Nexus (lineage C). Product hardening happens in the B
lineage (sfs-vault); this doc is the shared plan of record. Nothing personal-only (Membrane,
Sandbox personal extensions, config, .env, Telegram/Signal wiring) ships in the product — per
`NEXUS-lineage-and-sync-map.md`.

---

## 1. Where we actually are (grounded in the repo, 2026-07-16)

Working today, already synced B→C:
- **Chat-first console** — ChatHome + CouncilInspector landing, Council label, compact Overview.
- **6 cloud providers + local** — Claude, GPT-4o, Gemini, DeepSeek, Mistral, Qwen presets via the
  OpenAI-compat engine, plus Ollama local models. Availability dots do a real 1-token probe.
- **Council / multi-model relay** — fixed Brain + parallel cloud worker unit, provider icons,
  full-width polished chain, live processing animations.
- **Honest cost meter** — relay streaming records real usage (T2/T17 landed).
- **Settings key management** — per-provider key fields, stored to local `.env`, never git.
- **Packaging** — electron-builder DMG target exists (`npm run package-dmg`), installer script.

Not yet true:
- **No automated test suite** — the "robust tests" are the manual council A/B protocol in
  `docs/cloud-provider-keys.md`. Fine for now, but there is no written pass/fail release gate.
- **No fresh-machine validation** — nobody has installed the product build on a clean Mac account
  with zero config and watched what first-run looks like.
- **No landing page / waitlist** — nothing on the SFS Studio site yet.
- **No distribution decision** — signing/notarization, pricing, license model all undecided.

---

## 2. The one decision that unlocks "market ASAP": BYOK v1

**Recommendation: v1 is Bring-Your-Own-Keys.** The user pastes their own provider keys into
Settings (the flow already exists and the signup runbook is already written). Why this is the
fast path:

- **Zero billing/proxy infrastructure** — no metering backend, no key vaulting service, no margin
  math on inference. Weeks of work deleted from the critical path.
- **It's honest** — the cost meter shows the user *their own* spend. That's a feature, not a
  compromise: "see exactly what every council run costs you" is a differentiator no bundled-credits
  product can offer as cleanly.
- **The runbook is the onboarding** — `cloud-provider-keys.md` (10-minute signup, free tiers)
  becomes in-app first-run content almost verbatim.
- Bundled credits / managed keys can be v2 once there's revenue signal.

If we agree on BYOK, the MVP is *finishing and hardening what exists*, not building new systems.

---

## 3. MVP scope — keep / cut

| Ships in MVP (product B) | Cut from MVP (personal C / later) |
|---|---|
| Chat-first console (ChatHome) | Telegram + Signal transports |
| Council: multi-model parallel chain + Brain aggregator | Goose-agent-system repo readers (agents/canon/status views) |
| 6 cloud providers + Ollama local, availability probes | Membrane, Domains, personal extensions |
| Honest per-run cost meter | Umbruh gate, voice portal |
| Settings: BYOK key management (.env local) | Mini Nexus PWA (separate track, after MVP) |
| First-run onboarding (Setup wizard + key runbook) | Bundled credits / accounts / cloud sync |
| Signed + notarized DMG | Windows/Linux builds |

The product story in one line: **a native Mac console that convenes a council of AI models —
cloud + local, side by side — with an honest meter showing what every run costs.**

**Pricing split (decided 2026-07-16, per Goose/Boris):** the free tier is the chat surface with
the full multi-model council — users can see the product's potential end-to-end. **Pro is a
subscription** that unlocks the retention layers: projects, library, domains, visibility — with a
**7-day free Pro trial** to hook users before the paywall. Consequence for scope: the beta ships
the free tier only; the Pro features get productized from their personal-lineage ancestors during/
after beta, plus license-entitlement plumbing to gate them (needed by v1.0, not by beta). This
moves "Domains" from *cut* to *deferred-Pro*.

## 3b. Competitive landscape (checked 2026-07-16)

The name-collision sweep doubled as a market scan. The multi-model space is real and crowded —
side-by-side comparison is a commodity (ChatHub, MultipleChat, ChatPlayground, Admix, GetMulti,
OpenRouter's playground), and at least two products already sell *deliberation*:

- **Conclave AI** (conclaveai.dev) — the closest competitor: Claude + GPT + Gemini analyze
  independently, a moderator synthesizes; cross-platform, subscription, 7-day free trial.
- **Parley AI** (tryparleyai.app) — "smarter answers through AI deliberation," plus a separate
  Parley multi-agent debate app.
- **Allgn** (allgn.io) — side-by-side plus agreement/difference summaries.

Read: the council concept is validated — and no longer novel on its own. Nexus's defensible
differences, which the landing page must lead with: **(1) native Mac + local Ollama models seated
at the same table** (nobody else does local), **(2) BYOK with an honest live cost meter** (the
competitors resell inference at a markup), **(3) the Pro depth layers** (projects/library/domains —
a workspace, not just a chat toy).

---

## 4. Release gate — turn the A/B protocol into a written checklist

Promote the "is it worthwhile" experiment into the release gate. MVP ships only when all pass on a
**clean machine**:

1. **Cold install** — DMG installs on a fresh macOS account; app opens with no config, no repo,
   no keys, and shows a working first-run screen (no blank panes, no console errors).
2. **Key onboarding** — paste one key (Gemini free tier) → dot goes green → first chat reply
   works, in under 10 minutes following only in-app instructions.
3. **Solo chat** — single-model chat streams, survives an app restart without losing the thread.
4. **Council run** — ≥3 cloud models + 1 local in a chain completes; every response attributed to
   the right model; a mid-chain provider failure shows an honest unavailable row, not a hang.
5. **Cost meter honesty** — meter total for the council run matches provider dashboard usage
   within rounding.
6. **No-network behavior** — pull the network mid-run: clear error states, no crash, local Ollama
   still works.
7. **Key hygiene** — keys exist only in local `.env`; never in logs, config, exports, or crash
   output.
8. **Personal-lineage leak check** — grep the product build for Membrane/Domains/Telegram/personal
   paths; nothing from C leaks into B artifacts.

---

## 5. Today's punch list (in order)

1. **Decide & freeze (30 min, Goose + Boris):** BYOK v1 yes/no · MVP keep/cut table above ·
   pricing direction (see §7). Write the three answers at the bottom of this doc.
2. **Start the Apple lead-time clock (15 min, blocking, do early):** enroll/verify the Apple
   Developer account for the LLC and request the **Developer ID Application** certificate.
   Notarization is mandatory for distributing a DMG outside the App Store, and enrollment can take
   days — this is the single longest external dependency, so it starts today.
3. **Fresh-machine dry run (1–2 h, Boris):** build the B-lineage DMG, install on a clean macOS
   user account, walk gate items 1–3. Every failure becomes a ticket. This produces the *real*
   MVP backlog — everything else is guessing.
4. **Run the council A/B on record (1 h, Goose):** execute the 3-run protocol from
   `cloud-provider-keys.md` (solo vs roundtable vs Director-budget), save the transcripts and
   meter screenshots. This is simultaneously the workflow robustness test **and** the landing
   page's proof/demo material.
5. **Landing page v0 (1–2 h):** copy draft is ready in `docs/product/landing-page-draft.md` —
   review, then stand up a single page on the SFS Studio site with an **email waitlist** (Buttondown/
   Tally/Formspark — anything that ships today). The page goes live *before* the app; start
   collecting interest immediately.
6. **Name check (30 min, parallelizable):** "Nexus" is heavily used (Google Nexus, Sonatype Nexus,
   NexusMods). "Nexus by SFS Studio" is likely fine for launch, but do a quick trademark/collision
   sanity pass today, before the landing page makes the name public.

Realistic end-of-day state: decisions frozen, Apple clock running, a ticket list from a real
cold install, one recorded council demo, and a live waitlist page.

## 6. This week → market

- **D1 (today):** everything in §5.
- **D2–D3:** burn the cold-install ticket list; make gate items 1–3 pass; first-run onboarding
  polish (Setup wizard + embedded key runbook).
- **D4:** full release-gate pass on a clean machine; sign + notarize the DMG (cert permitting);
  cut `v0.9-beta`.
- **D5–D7:** private beta — 5–10 hand-picked users from the waitlist, each must complete key
  onboarding unaided; fix what they hit; publish the demo (council A/B recording) on the landing
  page.
- **Week 2:** public v1: DMG download from the landing page, launch posts. Beta feedback decides
  whether payment gating ships in v1.0 or fast-follows.

## 7. Decisions — frozen 2026-07-16 (Goose + Boris + Claude)

1. **BYOK v1?** — **DECIDED: yes.** Users bring their own provider keys; the Pro subscription
   pays for features, not inference.
2. **Pricing** — **DECIDED: freemium.** Free tier = chat + full multi-model council (see the
   full spec in §3). Pro subscription = projects, library, domains, visibility; 7-day free Pro
   trial. Beta = free tier only.
3. **Beta channel** — **DECIDED: direct DMG to waitlist.** Signed + notarized DMG emailed to
   hand-picked waitlist users. No TestFlight.
4. **Product name** — **OPEN, actively renaming.** "Nexus" was never checked and "Healix"
   (Goose/Boris candidate) is dead on arrival: multiple existing AI-health products already use
   Healix/HealixAI, plus Healix Ltd (health-risk services) and Healx (AI drug discovery) — and it
   mispositions a general-purpose console as a health product. Vetted candidates and the
   recommended direction live in `docs/product/naming-candidates.md`. Landing page copy proceeds
   with placeholder branding until this closes — target: decide within 48h so the page can ship.
