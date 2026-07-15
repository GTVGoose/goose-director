# Nexus Bench — run `v0` (2026-07-15)

## aime25

| Lane | Score | Score (clean) | n | Errors | Median latency |
|---|---|---|---|---|---|
| chatgpt-sub | 90.0% | **90.0%** | 30 | 3 | 65.9s |
| gemini-flash | 90.0% | **90.0%** | 30 | 3 | 66.1s |
| nexus-council | 83.3% | **83.3%** | 30 | 2 | 289.4s |
| gpt-5.6-sol | 80.0% | **80.0%** | 30 | 5 | 86.7s |
| claude-max | 66.7% | **66.7%** | 30 | 10 | 109.6s |
| deepseek-chat | 53.3% | **53.3%** | 30 | 0 | 22.6s |
| mistral-large | 53.3% | **53.3%** | 30 | 1 | 85.4s |
| ollama-local | 0.0% | **0.0%** | 30 | 0 | 113.0s |

## humaneval

| Lane | Score | Score (clean) | n | Errors | Median latency |
|---|---|---|---|---|---|
| claude-max | 99.4% | **99.4%** | 164 | 0 | 5.6s |
| gpt-5.6-sol | 99.4% | **99.4%** | 164 | 0 | 14.6s |
| nexus-council | 99.4% | **99.4%** | 164 | 0 | 38.6s |
| chatgpt-sub | 98.8% | **98.8%** | 164 | 0 | 11.2s |
| gemini-flash | 95.7% | **95.7%** | 164 | 7 | 24.2s |
| mistral-large | 92.7% | **92.7%** | 164 | 0 | 2.7s |
| deepseek-chat | 91.5% | **91.5%** | 164 | 0 | 1.8s |
| ollama-local | 57.3% | **57.3%** | 164 | 0 | 13.6s |

## mmlu-pro

| Lane | Score | Score (clean) | n | Errors | Median latency |
|---|---|---|---|---|---|
| gemini-flash | 90.0% | **94.0%** | 140 | 2 | 36.3s |
| nexus-council | 90.0% | **94.0%** | 140 | 0 | 52.6s |
| claude-max | 88.6% | **92.5%** | 140 | 2 | 16.9s |
| gpt-5.6-sol | 88.6% | **92.5%** | 140 | 1 | 26.9s |
| chatgpt-sub | 87.9% | **91.8%** | 140 | 0 | 21.7s |
| mistral-large | 81.4% | **85.1%** | 140 | 0 | 5.3s |
| deepseek-chat | 80.7% | **84.3%** | 140 | 0 | 1.9s |
| ollama-local | 46.4% | **48.5%** | 140 | 0 | 26.2s |

*6 disputed-key item(s) excluded from the clean score: mmlupro-2807, mmlupro-10358, mmlupro-10365, mmlupro-4678, mmlupro-866, mmlupro-7687.*

*Scores are within-harness comparisons (identical prompts/grading across lanes); not comparable to published leaderboard numbers. Errors count as incorrect. "Clean" excludes items where ≥5 lanes converged on the same non-key answer (label noise).*
