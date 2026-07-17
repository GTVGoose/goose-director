# Nexus Bench — orchestrated workflow vs. solo models

**Goal.** Measure how the Nexus multi-model workflow (council/orchestrator over the
Director's model fleet) stacks up against each individual model on open-source LLM
benchmarks, under identical prompts and grading. Output is a dataset we can use to
(a) tune the routing/orchestration and (b) publish as capability evidence.

## Design

Everything runs through the **live Nexus server** (`localhost:3001`) so the test
exercises the real product plumbing, not a lab harness:

- **Solo lanes** → `POST /api/relay` (one model, one call).
- **Orchestrated lanes** → `POST /api/sandbox` (roundtable council with aggregator,
  orchestrator/director modes). The lane answer is the `final` SSE event.

Same prompt template, same answer-extraction, same grader for every lane.

## Suites (v0 — open source, auto-gradable, no human labor)

| Suite | Source | Size used | Grading |
|---|---|---|---|
| `mmlu-pro` | TIGER-Lab/MMLU-Pro (HF) | stratified sample (default 140: 10/category) | exact choice letter |
| `aime25` | AIME 2025 I+II (HF mirror) | 30 | exact integer 0–999 |
| `humaneval` | openai/human-eval (GitHub) | 164 (or `--limit`) | unit tests, pass@1 |

v1 candidates: GPQA Diamond (HF-gated — needs account + terms), IFEval, LiveCodeBench,
plus the PIN-gated `/api/chat` brain lane (local Umbruh → escalation path).

## Lanes (v0 defaults)

Solo: `claude-max` (sub, $0) · `chatgpt-sub` (Codex sub, $0) · `gpt-5.6-sol` ·
`gemini-flash` · `mistral-large` · `deepseek-chat` · `ollama-local` (llama3.1:8b).

Orchestrated:
- `nexus-council` — roundtable: [claude-max, chatgpt-sub, gemini-flash, mistral-large,
  deepseek-chat] + aggregator claude-max. The Mixture-of-Agents configuration.
- `nexus-local-council` — local-only participants + local aggregator (the "how far can
  the $0 fully-local stack go" story). Off by default in v0 smoke.

## Honest-comparison caveats (must accompany any published number)

1. **Prompt template ≠ leaderboard template.** Our zero-shot template differs from each
   lab's published eval settings, so compare lanes against *each other* within this
   harness; treat published leaderboard numbers as context only.
2. **Contamination unknown** for all models on public sets; it cuts in every lane's
   favor equally, but absolute numbers are soft.
3. **Council cost/latency** is a multiple of solo — report tokens/latency per lane so
   the tradeoff is visible (that's part of the product story: routing lets you buy
   accuracy when it matters).
4. Single-turn Q&A under-sells orchestration; agentic suites (v1) are where a
   director/worker system should shine most.

## Usage

```bash
node bench/fetch-datasets.mjs                 # downloads to bench/data/
node bench/run.mjs --suite mmlu-pro --limit 5 # smoke
node bench/run.mjs --suite mmlu-pro           # full sample, resumable
node bench/report.mjs                          # markdown table from bench/results/
```

Results append to `bench/results/<run-id>/<suite>.jsonl`; re-running skips completed
(task, lane) pairs, so interrupted runs resume cleanly.
