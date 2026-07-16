# Nexus landing page — copy draft v0 (for the SFS Studio site)

**Date:** 2026-07-16 · **Status:** draft for Goose/Boris review — nothing here is public yet.
**Page goal for v0:** one page, one CTA (join the waitlist). The page ships *before* the app.
All claims below must stay true of the actual MVP build — cut any line the release gate can't back.

---

## Hero

**Headline options (pick one):**
1. One question. Every AI. One answer.
2. Convene the council.
3. Stop asking one AI. Ask all of them.

**Subhead:**
Nexus is a native Mac console that puts Claude, GPT, Gemini, DeepSeek, Mistral, Qwen — and the
models running on your own machine — around one table. Ask once, watch them work in parallel,
and get a synthesized answer with the receipts.

**CTA:** `Join the waitlist` (email field) · secondary line: *Private beta on macOS — rolling
invites this month.*

## The pitch (3 blocks)

**⚡ The council, not a chatbot.**
Route one prompt through multiple frontier models at once. A fixed Brain aggregates the chain into
a single answer — and you can inspect every model's contribution, side by side.

**🧾 An honest meter.**
Every run shows exactly what it cost, live, token by token. You bring your own API keys, so the
number on the meter is the number on your bill. No bundled-credit markup, no mystery pricing.

**🔒 Yours, locally.**
Nexus runs on your Mac. Your keys live in a local file, never on our servers — we don't have
servers in the loop. Local models via Ollama sit at the same table as the cloud, and work offline.

## How it works (3 steps)

1. **Install** — download the DMG, open Nexus.
2. **Add a key** — paste any provider key (Gemini's free tier works; ~10 minutes, guided in-app).
3. **Convene** — pick your council, ask, and watch the chain run with live cost.

## Proof section (placeholder — fill from the recorded A/B run)

> Short screen recording or GIF: solo model vs. council on the same real task, with the cost meter
> visible. Caption: *"The council caught N issues the solo run missed — for $0.0X."*
> (Source: today's recorded 3-run protocol. Do not publish until the recording exists.)

## FAQ

- **What do I need?** A Mac (Apple silicon or Intel) and at least one AI provider API key. Gemini's
  key is free and takes minutes to get — the app walks you through it.
- **Do you see my prompts or keys?** No. Nexus is a local app; keys are stored on your machine and
  requests go directly from your Mac to each provider.
- **What does it cost?** The beta is free. You pay your AI providers directly for what you use —
  Nexus shows you that spend in real time.
- **Which models?** Claude, GPT-4o, Gemini, DeepSeek, Mistral, Qwen out of the box, plus anything
  you run locally with Ollama.
- **Windows/Linux?** macOS first. Tell us what you're on when you join the waitlist.

## Footer

An **SFS Studio** product · contact · privacy (state plainly: waitlist email is the only thing
collected).

---

## Build notes (not copy)

- One static page + email capture (Buttondown / Tally / Formspark — whatever ships today). No
  backend of our own.
- Waitlist form asks exactly two things: email + "what would you ask the council?" (free text —
  doubles as use-case research and beta-selection signal).
- Dark, console-aesthetic to match the app (reuse app theme tones); one screenshot of ChatHome +
  CouncilInspector once the product build's UI is leak-checked (no personal-lineage panels in shot).
- OG image = the council chain screenshot; title "Nexus — one question, every AI."
- Add a plausible-deniability line nowhere; make no uptime/SLA/benchmark claims — everything above
  is verifiable in-product.
