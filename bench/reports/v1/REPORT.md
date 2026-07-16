# Nexus Bench — run `v1` (2026-07-16)

## aime25

| Lane | Score | Score (clean) | n | Errors | Median latency |
|---|---|---|---|---|---|
| claude-max | 100.0% | **100.0%** | 27 | 0 | 87.9s |
| gpt-5.6-sol | 100.0% | **100.0%** | 30 | 0 | 29.0s |
| chatgpt-sub | 96.7% | **96.7%** | 30 | 0 | 27.7s |
| nexus-council-vote | 96.7% | **96.7%** | 30 | 0 | 305.2s |
| nexus-council-verify | 93.3% | **93.3%** | 30 | 0 | 399.2s |

## mmlu-pro

| Lane | Score | Score (clean) | n | Errors | Median latency |
|---|---|---|---|---|---|
| nexus-council-vote | 90.7% | **90.7%** | 140 | 0 | 64.4s |
| nexus-council-verify | 89.2% | **89.2%** | 139 | 0 | 75.2s |

*Scores are within-harness comparisons (identical prompts/grading across lanes); not comparable to published leaderboard numbers. Errors count as incorrect. "Clean" excludes items where ≥5 lanes converged on the same non-key answer (label noise).*
