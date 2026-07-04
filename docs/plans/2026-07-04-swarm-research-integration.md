# Swarm Research → Integration Plan: Ornith / dSpark + 10 Open-Source AI Tools

**Date:** 2026-07-04
**Author:** Director's research swarm (two parallel deep-research passes, 167 agents, adversarially fact-checked)
**Question:** Do any of these help Umbruh's **local** 8B models — inside the hard **24GB unified-memory** envelope — and reduce unnecessary routing to cloud Claude? If so, how do we integrate them?

## System baseline (what any recommendation must fit)

- **Umbruh** drives on **two local 8B models** (both `llama3.1:8b` via Ollama; `umbruh-lite` ~5GB). Heavy reasoning routes to **Claude Max** (Sonnet via the Claude Code CLI — **$0-metered** on the Max sub, `provider: "claude-code"` in `goose.config.json`).
- **Nexus** = React/Vite/Express multi-model relay UI (`server.mjs`, `telegram.mjs`, `signal.mjs`). Stack is **JavaScript/Node + React**.
- **Hard constraint:** the 32B host was **scratched 2026-07-01** — the 24GB Mac can't run it. Anything that doesn't fit ~24GB must justify a **hardware change**.
- **Rigor note:** every figure below is tagged **✅ verified** (survived 3-vote adversarial checking), **⚠️ vendor-claimed** (self-reported, not independently reproduced), or **❌ refuted** (failed verification — do not rely on it).

---

## TL;DR — the merged tier list

| Tier | Item | Why |
|---|---|---|
| **ADOPT NOW** | **LiteLLM** (routing proxy) | Config-only OpenAI-compatible gateway behind Nexus's relay; unifies Ollama + gives free local→Claude fallback. Zero Python in the app. |
| **ADOPT NOW** | **Langfuse** (observability) | Native JS/TS SDK (`npm i langfuse`) — the one Python-adjacent tool that's genuinely native to Node. Cheap. Needed to *measure* everything else. |
| **ADOPT NOW** | **Structured-output layer** (Outlines local / Instructor API) | The clearest reliability win for weak 8B models — guaranteed-valid JSON/tool args. |
| **PILOT** | **Ornith-1.0-9B** (local model) | MIT, runs on stock Ollama, *purpose-built for agentic coding* — could reclaim routine coding from Claude. But benchmarks are unverified; must A/B. |
| **PILOT** | **RAG grounding** (Qdrant + Chonkie + Marker + Crawl4AI) | Real capability gain (grounding beats scaling for factual work) but real footprint + build cost. |
| **PILOT** | **DSPy** (prompt optimization) | Genuine gains, but it's an *offline batch compile*, not a live call. |
| **SKIP (now)** | **Ornith-1.0-35B** | ~21GB q4 vs macOS Metal's ~18GB working set — same failure class that killed the 32B. |
| **SKIP** (technique = optional PILOT) | **DSpark** (DeepSeek speculative decoding) | Speed, not memory — does **not** reopen the 32B. Checkpoints are DeepSeek-V4-only; local use needs training a custom draft head. The *technique* (speculative decoding via llama.cpp) is a legit latency PILOT. |
| **DEFER** | **NVIDIA DGX Spark** (hardware — *separate from DSpark*) | The "buy more RAM to fit the 32B" question. No spec survived verification; needs its own hardware pass. |
| **baseline** | **Ollama** | Already in the stack; everything else plugs into it. |

**The through-line:** adopt cheap infrastructure that makes the *existing* 8B models more reliable and reclaims **routine** work from Claude (LiteLLM + structured output + Langfuse), then pilot the two capability upgrades (Ornith-9B, RAG). **Keep deep multi-step reasoning and highest-quality output on Claude Max** — even RAG doesn't fully close the local↔cloud gap.

---

## Part A — Ornith-1.0 & DSpark (+ the DGX Spark hardware question)

> **Naming correction (2026-07-04):** "dSpark" is **DSpark**, DeepSeek + Peking University's open-source *speculative-decoding* framework (paper: *Confidence-Scheduled Speculative Decoding with Semi-Autoregressive Generation*) — **software**, confirmed by the Director. An earlier draft of this doc conflated it with **NVIDIA DGX Spark** (a hardware box); those are two unrelated things and are now split out below.

### Ornith-1.0-9B → **PILOT** (the real local-model opportunity)

- ✅ **MIT license, no regional restrictions**, commercial use permitted.
- ✅ **Plain GGUF, runs under stock Ollama** — `ollama pull hf.co/deepreinforce-ai/Ornith-1.0-9B-GGUF`. **No special "self-scaffolding" runtime**: self-scaffolding is a *training-time* behavior baked into the weights, not a hosting component. Integration = one `ollama pull` + a config entry.
- ✅ **256K context advertised** — but practically capped far lower on 24GB (KV cache is the limiter).
- ✅ **Recommended sampling:** temp `0.6`, top_p `0.95`, top_k `20` (temp `1.0` to reproduce benchmarks).
- ⚠️ **Tool-calling:** emits Qwen-XML `<tool_call>` blocks that a parser surfaces as OpenAI `tool_calls`. **Must verify stock Ollama parses this in the Nexus relay** before trusting agentic function-calling — may need a vLLM backend or custom parser.
- ⚠️ **Benchmarks are vendor self-reported, NOT independently reproduced:** SWE-Bench Verified **69.4%**, Terminal-Bench 2.1 **43.1%** (9B). One practitioner publicly called the 397B's headline "benchmaxed." → **Pilot and A/B against `umbruh-lite`, never a blind swap.**

### Ornith-1.0-35B → **SKIP on current hardware**

- ✅ q4_K_M is **~21.2GB on disk**; macOS Metal default working set is **~18GB of 24GB** → likely won't even load, and leaves ~nothing for context/OS. **Same failure class as the scratched 32B.** Only revisit if hardware changes (see DGX Spark).

### DSpark (DeepSeek speculative decoding) → **SKIP the artifact; the technique is an optional PILOT**

*Source: the DSpark paper (DeepSeek-AI + Peking University), provided by the Director.*

- ✅ **What it is:** a **speculative-decoding** framework. A small **draft model** proposes a block of tokens; the **full-size target model verifies them in one forward pass**. The acceptance rule preserves the target distribution **exactly → lossless** (identical output, just faster). Two innovations: a semi-autoregressive draft head that fixes **suffix decay** (the Director's "syntax decay" — acceptance collapsing toward the end of a block), and confidence-scheduled verification for high-concurrency serving. Reported **60–85% per-user speedup** in DeepSeek's own V4 serving vs. their MTP-1 baseline.
- ❌ **Does NOT reopen the 32B.** Speculative decoding is a **latency/throughput** optimization, **not** a memory one. The full target model stays **fully resident in RAM**, *plus* a draft head on top → it uses **slightly more** memory, never less. The 32B was scratched for **RAM** reasons; DSpark doesn't touch that wall. Only more RAM (hardware) or heavier quantization / MoE can fit a 32B-class model in a tight envelope.
- ❌ **Does NOT raise quality.** Because it's lossless, an 8B + DSpark returns **the same 8B answers, faster** — not smarter ones. It cannot substitute for the reasoning of a larger model or Claude.
- ⚠️ **Not plug-and-play locally:** released DSpark checkpoints are trained **specifically for DeepSeek-V4-Flash/Pro**. Using it on `llama3.1:8b` / Ornith-9B requires **training a custom draft head** via their **DeepSpec** repo (real GPU training). The paper also targets **datacenter high-concurrency serving**, not a single-user Mac.
- ✅ **The salvageable idea:** the *technique* — **speculative decoding via llama.cpp** with an off-the-shelf tiny draft model (e.g. `llama3.2:1b` drafting for an 8B) — needs no training and can speed up local Umbruh **today**. Treat as a **latency PILOT**, clear-eyed that it's a *speed* win, not a *capacity* one.

### NVIDIA DGX Spark (hardware — *a separate question from DSpark*) → **DEFER — not answered**

- This is the **"buy more RAM to fit the 32B"** path, unrelated to DSpark. **No DGX Spark claim survived the swarm's verification bar**, so nothing here is asserted as fact.
- ⚠️ *Directional only (unverified search snippets):* **128GB unified LPDDR5X** but only **~273 GB/s** bandwidth (memory-bound decode — the bottleneck for a big-model box), price **$3,999 → $4,699** after a memory-shortage hike.
- Because DSpark does **not** solve the memory wall, *this* — more unified memory — is the only thing that genuinely revives the 35B / scratched-32B path and absorbs the RAG-stack footprint below. **Needs a dedicated hardware research pass before any buy.**

---

## Part B — The 10 open-source tools (Node/React/Ollama/24GB lens)

### ADOPT NOW

**1. LiteLLM — routing backend behind Nexus's relay + `goose.config.json`**
- ✅ Open-source OpenAI-compatible **AI gateway across 100+ providers**; **Ollama and Anthropic are first-class**; **Router retry/fallback** lets a local-8B group fail over to Claude automatically.
- ✅ **Zero Python in the app:** run the proxy standalone (`litellm[proxy]` on `http://0.0.0.0:4000`), point Nexus's OpenAI client `baseURL` at it. The Langfuse JS cookbook shows exactly `new OpenAI({ baseURL: 'http://0.0.0.0:4000' })`.
- ⚠️ **Economics caveat (important):** LiteLLM's Anthropic provider hits the **metered Anthropic API with a key** — that is **NOT** your **$0 Claude Max CLI** route. → **Keep `claude-max` (provider `claude-code`) routing OUTSIDE LiteLLM** (CLI shim / custom provider) so you don't start paying for what's currently free. LiteLLM unifies the *local* models + fallback; the Claude Max path stays as-is.
- **Reclaims from Claude:** nothing directly — it's the plumbing that makes local-first routing + graceful fallback possible.

**2. Langfuse — observability**
- ✅ **Native JS/TS SDK** (`npm i langfuse`), actively maintained (v5, Mar 2026). Neutral infra (doesn't make models smarter) but it's how you *measure* whether Ornith-9B / RAG / structured-output actually beat the status quo. Adopt early so the pilots have data.

**3. Structured-output enforcement — Outlines (local) + Instructor (API)**
- ✅ **Outlines** controls generation at the **logit level** on locally-served open models → guaranteed valid JSON/grammar. **Instructor** validates with Pydantic and **auto-retries with the error appended** on failure. Rule of thumb (practitioner + mechanism): **Outlines when self-hosting, Instructor for API paths.**
- ✅ Instructor supports **Ollama** directly (`instructor.from_provider('ollama/llama3.2')`, TOOLS mode for llama3.1/3.2).
- ⚠️ **Plumbing:** true Outlines constrained decoding wants a **llama.cpp/vLLM/transformers** backend, not stock Ollama's HTTP API. **Cheaper alternative to test first:** Ollama's own **native `format`/structured-output** + Instructor's retry loop — may get 90% of the reliability without swapping the server.
- ❌ **Honesty note:** the arXiv claim that 8B models emit "0% valid JSON from prompting alone" was **REFUTED**. The case rests on the *enforcement mechanism*, not on that scary stat. Still a real win — just don't oversell the baseline failure rate.
- **Reclaims from Claude:** any task where you route to Claude *just to get reliable JSON / tool arguments* — that can come home to the 8B models.

### PILOT

**4. RAG grounding stack — Qdrant + Chonkie + Marker + Crawl4AI**
- ✅ Best evidence that grounding is a *real* capability gain (not hype): a peer-reviewed npj Digital Medicine (Nature) study held the local model constant and added only RAG → hallucinations **8% → 0%** (p=0.012), blinded mean rank **+1.3** (p<0.001).
- ✅ **But it doesn't fully close the gap** — a blinded human still ranked GPT-4o mini above the local RAG model. → **RAG reclaims grounded/retrieval-answerable work; deep reasoning still routes to Claude.**
- ✅ **Chonkie** is low-footprint (505KB wheel, ~49MB base) with **10+ chunkers** and **native Qdrant** integration. ❌ The "Chonkie is Python-only" claim was **refuted** — check for JS/TS bindings before assuming a sidecar is mandatory.
- ⚠️ **Caveats:** evidence is a single narrow domain (radiology) on an **11B, not 8B**, small synthetic sample — *direction* trustworthy, *magnitude* may not transfer to coding-agent work. And this is the biggest footprint add (see below).

**5. DSPy — prompt optimization**
- ✅ Real gains, served as a **FastAPI REST sidecar** (official pattern), callable from Node over HTTP.
- ⚠️ Its compile/optimize-against-a-metric step is an **offline batch job**, not a low-latency call → PILOT it to *bake better prompts* for the 8B models, then ship the optimized prompts; don't put it in the live path.

### How Node consumes the Python-first tools

✅ **Verified pattern:** the Python-first tools (Outlines, Instructor, DSPy, Chonkie, Marker, Crawl4AI) run as **sidecar REST services** (FastAPI/uvicorn, e.g. `POST /predict` on `127.0.0.1:8000`), not native imports. Umbruh calls them over HTTP — exactly how it already talks to Ollama. **LiteLLM (:4000) and the structured-output/RAG sidecars are all just local HTTP endpoints to the Node stack.**

---

## Part C — The footprint reckoning (where the two passes collide)

This is the crux, and it's **genuinely unresolved**:

- ✅ Ollama + Qdrant + LiteLLM + Langfuse + Crawl4AI **co-bundle** architecturally (proven by the LLemonStack project) — but that proves **compatibility, not 24GB fit**. ❌ The "needs 12GB to Docker" figure was **refuted**, so don't anchor on it.
- Two 8B models (~5GB each loaded, more with context) **+ a Qdrant + embedding-model RAG service + Python sidecars** in 24GB is **tight**. Add Ornith-9B as a *third* local model and you're context-switching models in and out of memory.
- ⚠️ **Mac-specific:** run **Ollama natively, not in Docker** (Docker-on-Mac loses Metal acceleration).

**→ This is precisely the trigger for the DGX Spark question.** The infra tools (LiteLLM, Langfuse, structured output) fit fine today. The moment you stack **RAG + a third local model (Ornith-9B) + the 8B pair**, you're arguing for more unified memory. Measure empirically (Langfuse + `ollama ps` + memory pressure) before spending.

---

## Recommended rollout order (impact-per-effort)

1. **LiteLLM proxy** — pure config/HTTP. Unifies local routing, adds free local→Claude fallback. Keep `claude-max` on the CLI route, outside LiteLLM, to preserve $0 metering.
2. **Langfuse** (`npm i langfuse`) — instrument the relay so every subsequent step is measurable.
3. **Structured-output**: start with **Ollama native `format` + Instructor retry** (cheapest); escalate to an **Outlines sidecar** only if that's not reliable enough. Reclaim "route-to-Claude-just-for-valid-JSON" tasks.
4. **Pilot Ornith-1.0-9B**: `ollama pull` → optional `Modelfile` (temp 0.6 / top_p 0.95 / top_k 20, bounded `num_ctx` ~16–32K) → add `goose.config.json` entry → **verify Ollama surfaces `tool_calls`** → **A/B vs `umbruh-lite` and Claude** on real coding/tool tasks (tracked in Langfuse).
5. **Pilot the RAG stack** (Qdrant + Chonkie, fed by Marker/Crawl4AI) as a Python sidecar — *after* measuring footprint headroom.
6. **DSPy** offline to optimize the 8B prompts; ship the results.
7. **Revisit DGX Spark** only if steps 4–5 prove the 24GB Mac is the bottleneck — and run a dedicated hardware pass first.

### Proposed `goose.config.json` addition (Ornith-9B pilot)

```jsonc
{
  "id": "ornith-9b",
  "name": "Ornith 1.0 (9B, agentic coding)",
  "provider": "ollama",
  "model": "ornith-9b",              // from `ollama create ornith-9b -f Modelfile`
  "description": "DeepReinforce Ornith-1.0-9B (MIT). Agentic-coding pilot — fits 24GB, benchmarks vendor-claimed, A/B vs umbruh-lite before trusting. temp 0.6 / top_p 0.95 / top_k 20."
}
```
Keep `ollama-local`, `umbruh-lite`, `claude-max` as-is. **What Ornith-9B could reclaim:** routine agentic coding + tool-use. **What still routes to Claude Max:** deep multi-step reasoning, long-context synthesis, highest-quality output — until a local A/B proves parity.

---

## Open questions (carry into the next pass)

1. Does the 24GB footprint actually hold with RAG + a third local model, or does it force the DGX Spark path? *(measure)*
2. How is Claude Max ($0 CLI) kept as a route while LiteLLM is the unified endpoint — CLI shim, or Claude Max bypasses LiteLLM entirely? *(economics)*
3. Does the 11B radiology RAG gain transfer to Umbruh's coding/agent workload on an 8B — and by how much? *(domain eval, Langfuse-tracked)*
4. Does Outlines require replacing stock Ollama, or is Ollama-native `format` + Instructor retry good enough at lower cost? *(plumbing)*
5. **[STILL MISSING]** The Director's original *first* link — the "stack overview" — never came through. If it named tools beyond these 10, they're not covered here.

## Provenance / honesty ledger

- **Refuted claims** (do not rely on): Ornith based on "Qwen 3.5 9B+35B" architecture (0-3); "self-scaffolding needs no runtime" as literally phrased (1-2, though the *practical* conclusion — plain GGUF on Ollama — held via other claims); 8B "0% valid JSON" arXiv stats (1-2, 0-3); Chonkie "Python-only" (0-3); "12GB to Docker" footprint (1-2).
- **Vendor-claimed, unverified:** all Ornith benchmark numbers; all DGX Spark specs/price.
- **Strongest independent evidence:** LiteLLM/Instructor/Langfuse capabilities (primary repos); the npj Digital Medicine RAG study.
</content>
</invoke>
