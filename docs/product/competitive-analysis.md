# Competitive analysis — multi-model / council products (2026-07-16)

**Method:** three parallel research passes (deliberation products · side-by-side web tools · native
desktop BYOK apps), ~130 tool calls against vendor sites via search index, pricing pages, docs,
GitHub, and review sites. Direct correction of earlier statements: this market **does** have
competition, and more of it than the first-pass sweep showed. Full sources at bottom.

## TL;DR verdict

The *mechanic* (fan one prompt to many models, synthesize one answer) is commoditized — Karpathy
open-sourced `llm-council` in Nov 2025 and the clones number in the dozens, with Perplexity
validating the pattern at the top of the market (Model Council, Feb 2026, in their $200/mo Max
tier). **We are not first and can't claim to be.**

But the specific product Nexus is — **a native desktop console where cloud AND local models sit on
one council, keys are yours, synthesis is the default, and a live meter shows the true dollar cost
of every run** — is a combination *nobody occupies*. One app (Fluent, fluentmac.app) is close and
must be watched. The sector's two chronic, complained-about failures — opaque credit pricing and
unreliable orchestration — are exactly the two things Nexus was built around (honest cost meter,
honest unavailable-rows/probes). The opportunity is real but the window is short.

---

## The market: three rings

### Ring 1 — Side-by-side web tools (commodity, decaying)

| Product | Parallel | Synthesis | Price | BYOK | Local | Cost display |
|---|---|---|---|---|---|---|
| ChatHub | 6 models | summarize-only | $19–39/mo | no (abandoned OSS roots) | Ollama (compare only) | none |
| MultipleChat | 4+ | **Fusion/Debate/Sequential modes** | $15–90/mo | enterprise-only | no | none |
| ChatPlayground | 6 | "Mixture AI" (reviewed as mixed) | ~$20/mo + LTDs | no | no | none |
| Admix | 6 | none | from $10/mo | no | no | none |
| Poe (Quora) | @-mention multi-bot | none | $5–250/mo points | no | no | points per msg |
| AI Fiesta | 6 | none | ~$12/mo | no | no | token caps |

Signals: ChatHub lost ~91% of search interest in a year; ChatPlayground revoked paid lifetime
licenses (AppSumo scandal, "scam" reviews); MultipleChat's Trustpilot says its flagship
collaboration **silently skips the assigned team** — orchestration you can't trust. Poe is the
traction outlier (~$65M rev 2026) but has zero synthesis and a confusing points economy. This ring
competes on bundled-subscription price and is racing to the bottom.

### Ring 2 — Council/deliberation products (hot, post-Karpathy, mostly web)

| Product | Mechanics | Price | Notes |
|---|---|---|---|
| **Perplexity Model Council** | 3 parallel + synthesizer chair | in Max, **$200/mo** | Feb 2026; the category validator — and ceiling-setter |
| **OpenRouter Fusion** | 3–5 panel + judge (structured consensus/contradictions) | pay-per-token | Labs beta; benchmark: fused panel beats solo frontier |
| llmcouncil.ai | full Karpathy pipeline (anon peer review + chairman) | free/day → $25 → $100/mo | document-centric, clearest pricing |
| Council AI | 27 models + consensus score | up to $199/mo | fan-out theater; consensus favors blandness |
| Roundtable | 3-round adversarial debate → verdict | credits + enterprise | most debate-native; MCP server |
| ModelCouncil | 2–4 models, outlier-surfacing, "Diamond Mode" debate, decision memory | n/a | privacy/business framing |
| Parley (parley.sh) | deliberation sandbox, browser-local runtime | BYOK or sub | **only one with Ollama/LM Studio support** |
| tryparleyai.app, AISCouncil, myaicouncil, CouncilMind, +dozens | Karpathy clones | free–cheap | zero traction; noise floor |

Also: **Conclave AI (conclaveai.dev) is not what it first looked like** — it's an AI *app-builder*
that uses a 3-model conclave to plan code generation, not a general chat console. Correcting the
2026-07-16 plan doc which called it our closest competitor.

Signals: category vocabulary ("council," "chairman") is established — cheap user education for us.
Almost none show dollar costs (Allgn's pre-send credit estimate is the best attempt). Local models
are nearly absent. Every standalone entrant has negligible traction so far.

### Ring 3 — Native desktop BYOK apps (structurally closest to Nexus)

| App | Multi-model fan-out | Synthesis | Local | Cost display | Price |
|---|---|---|---|---|---|
| **Fluent (fluentmac.app)** | **"Council": up to 10 parallel** | **"chairman" synthesizes; saved council presets** | MLX + Ollama/LM Studio endpoints | no live meter | **$49–69 one-time** |
| TypingMind | multi-model responses | **"Finalize Mode"** (buried, top tier) | via endpoints | per-chat estimate | $39–99 one-time |
| Msty | Split Chats (signature) | DIY via "shadow personas" | bundled Ollama | retrospective Insights | free → $149/yr, $349 life |
| BoltAI | compare-only side-by-side | none | first-class Ollama | outsourced to dashboards | ~$69–100 one-time |
| ChatWise | none | none | Ollama | none | $29 one-time |
| Jan | none (top community request!) | none | native | none | free OSS |
| AnythingLLM | none | none | many | none | free OSS |

**Fluent is the single closest competitor in existence**: native Mac, BYOK, and "Council" is a
headline feature — parallel fan-out to 10 models, chairman synthesis, reusable council presets,
one-time $49–69. What it lacks vs Nexus: no live cost meter, council is one feature inside an
"AI-everywhere-on-Mac" app (not the product identity), no first-class DeepSeek/Qwen, chairman is
per-council user config rather than a tuned fixed Brain, and no depth/workspace layers. Watch it.

---

## Where Nexus wins (defensible, evidence-backed)

1. **The full combination is unoccupied.** Native desktop + BYOK + cloud-and-local on one council +
   default Brain synthesis + live honest cost meter — no product has all five. Fluent has three.
   Perplexity has two. The council-web-clones have one.
2. **Cost honesty as identity.** Opaque credits/points/quotas are the single most repeated user
   complaint across all three rings (ChatPlayground credits, Poe points, ChatHub quota buckets).
   Only OpenRouter (a dev tool) shows real per-request cost. Nexus's meter records *actual streamed
   usage* of *your own keys* — the number on the meter is the number on your bill. Nobody in the
   consumer space can copy this without abandoning their markup business model. **This is the moat
   the business model creates.**
3. **Local models seated at the council.** Nearly absent everywhere (parley.sh and Fluent partially).
   Nexus's budget-ceiling → free-local rerouting mechanic (watch the council reroute to free local
   workers when the meter hits your limit) is a demo nobody else can show — it *requires* both the
   meter and first-class local seats.
4. **Reliability theater vs honest failure states.** MultipleChat's flagship silently skips its
   own orchestration; users noticed and torched it on Trustpilot. Nexus's real 1-token availability
   probes and honest unavailable-rows are already built. In a category with a trust deficit
   (revoked LTDs, silent downgrades, model bait-and-switch), *provable honesty* is a feature. The
   recorded council A/B protocol (solo vs roundtable vs budget-directed) becomes publishable
   receipts.
5. **Depth under the council (the Pro tier).** Council SaaS clones are shallow (no projects/memory);
   desktop apps with depth (TypingMind, Msty, AnythingLLM) have weak or no synthesis. Council +
   projects/library/domains in one native app is the "workspace, not toy" position — and it's what
   justifies recurring revenue.

## Honest risks

- **Perplexity down-market.** Model Council is Max-only today ($200/mo). If it drops to their $20
  Pro tier, "council" becomes a free-ish checkbox for the mainstream. Our answer must already be
  live: local models, BYOK economics, depth layers — things a hosted product structurally won't do.
- **Fluent (or TypingMind) adds a cost meter.** The meter alone is a feature, not a moat; the moat
  is the combination plus the honesty *brand*. Ship fast, own the story first.
- **Category noise.** Dozens of council clones means differentiation-by-name matters (relevant to
  the Second Skein decision — a distinct brand vs the "AI Council #47" soup is itself a moat).
- **Electron vs Swift.** Fluent, BoltAI, ChatWise are Swift/Tauri-native and market speed/lightness.
  Electron gives us cross-platform later but expect "another Electron app" pushback on Mac forums.
- **Pricing tension (needs a Goose/Boris look).** The frozen decision is Pro-as-subscription. But
  Ring-3 category norms are **one-time licenses ($29–$99)** — desktop BYOK buyers expect to own
  their tools, and they're vocal about it (TypingMind gets grief for sync upsells; Msty raised
  prices and got flak). Subscriptions are tolerated where value is ongoing (hosted, synced, updated
  weekly). Options that keep the freemium+sub decision intact: (a) justify the sub with genuinely
  ongoing Pro value — synced library/domains, continuous model-roster updates; (b) add a
  founder-lifetime tier at launch (bounded number, e.g. $149–199) to harvest the one-time crowd and
  fund runway; (c) both. Recommend (c). Flagged, not decided.

## Landing-page claims we can defend (and two we can't)

Safe: "The only Mac console where local models sit on the council beside the clouds" · "Your keys,
your bill — watch the real cost of every run, live" · "When the budget hits your ceiling, the
council reroutes to your free local models" · "See every model's answer; a fixed Brain synthesizes
one."

NOT safe: "the first multi-model council" (Karpathy/Perplexity/Fluent precede us) · "no one else
does multi-model synthesis" (TypingMind Finalize, Fluent chairman, Perplexity, OpenRouter Fusion).

## Key sources

Fluent: fluentmac.app · TypingMind Finalize: docs.typingmind.com, feedback.typingmind.com changelog ·
Msty: msty.ai/blog/split-chats, docs.msty.studio insights · Perplexity: perplexity.ai/hub/blog/
introducing-model-council · OpenRouter Fusion: openrouter.ai/fusion, /blog/announcements/
fusion-beats-frontier · Karpathy: github.com/karpathy/llm-council · llmcouncil.ai/pricing ·
council-ai.app · roundtable.now · modelcouncil.co · parley.sh · MultipleChat trust issues:
trustpilot.com/review/multiple.chat · ChatPlayground LTD revocations: appsumo.com/products/
chatplayground-ai/reviews · ChatHub decay: third-party search-volume trackers · Poe revenue:
Quora-reported figures · Full per-product detail lives in the three research-agent reports
(session artifacts, 2026-07-16).
