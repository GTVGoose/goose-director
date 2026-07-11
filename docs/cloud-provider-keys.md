# Cloud provider keys — 10-minute signup runbook (2026-07-11)

Four accounts, all with free tiers or trivial cost. After each: paste the key in
**Nexus → Settings → API keys** (it stores to the local `.env`, never config/git),
restart Nexus, and the model's dot goes green in Invoke/Sandbox.

| Provider | Where | Key looks like | Cost reality |
|---|---|---|---|
| **Google Gemini** | aistudio.google.com → "Get API key" (any Google account) | `AIza…` | Genuinely free tier (rate-limited); no card needed |
| **DeepSeek** | platform.deepseek.com → sign up → API Keys | `sk-…` | Prepaid; $2 top-up lasts ages (~30× cheaper than frontier) |
| **Mistral** | console.mistral.ai → La Plateforme → API Keys | random string | "Experiment" free tier; no card for that tier |
| **Qwen (Alibaba)** | modelstudio (DashScope **International**: dashscope-intl console) → API-KEY | `sk-…` | Free quota per model on signup; use the INTL endpoint (already wired in Nexus) |

Notes:
- Nexus is already configured for all four (`gemini-flash` (model: gemini-flash-latest), `deepseek-chat`,
  `mistral-large`, `qwen-plus`); the Settings panel has a labeled field per key.
- The availability dot does a real 1-token probe, so green = actually working.
- Qwen: make sure you're on the **international** DashScope console, not the
  China-mainland one — different endpoints, and Nexus points at intl.
- None of these keys should ever land in a repo; Settings handles storage.

## First test once ≥2 keys are green (the "is it worthwhile" experiment)

Same real task, three runs, compare output quality + the spend meter:
1. **Solo baseline** — Invoke, Claude Max alone.
2. **Roundtable** — 4-5 cloud models + local, Claude Max as aggregator.
3. **Umbruh Director** — Director mode with the full menu, budget ceiling set low
   (e.g. $1) to watch the free-local rerouting engage.

Use a task with a checkable answer (e.g. "review this server.mjs endpoint for
bugs" — we know its real bugs from the audit). Worthwhile = the council finds
things the solo run missed, at a cost the meter shows was pennies.
