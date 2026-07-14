#!/usr/bin/env node
// Aggregate bench/results/<run-id>/*.jsonl into a markdown scoreboard.
//   node bench/report.mjs [--run-id v0]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readJsonl } from './lib.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const runId = process.argv.includes('--run-id') ? process.argv[process.argv.indexOf('--run-id') + 1] : 'v0'
const dir = path.join(HERE, 'results', runId)
if (!fs.existsSync(dir)) { console.error(`no results at ${dir}`); process.exit(1) }

const rows = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'))
  .flatMap(f => readJsonl(path.join(dir, f)))

// De-dupe on (taskId, lane): keep the LAST record (a retried run supersedes).
const latest = new Map()
for (const r of rows) latest.set(`${r.taskId}::${r.lane}`, r)
const results = [...latest.values()]

const suites = [...new Set(results.map(r => r.suite))].sort()
const lanes = [...new Set(results.map(r => r.lane))].sort()

// Disputed keys: choice-style items where ≥5 lanes converge on the SAME wrong
// answer (observed MMLU-Pro label noise, e.g. mmlupro-2807/-3531 on 2026-07-14).
// Scores are reported raw AND with these excluded.
const disputed = new Set()
for (const suite of suites) {
  if (suite === 'humaneval') continue
  const byTask = new Map()
  for (const r of results.filter(r => r.suite === suite)) {
    byTask.set(r.taskId, [...(byTask.get(r.taskId) || []), r])
  }
  for (const [taskId, rs] of byTask) {
    if (rs.some(r => r.correct)) continue
    const counts = {}
    for (const r of rs) if (r.extracted != null) counts[r.extracted] = (counts[r.extracted] || 0) + 1
    if (Math.max(0, ...Object.values(counts)) >= 5) disputed.add(taskId)
  }
}

const pct = (num, den) => den ? `${(100 * num / den).toFixed(1)}%` : '—'
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0 }

let md = `# Nexus Bench — run \`${runId}\` (${new Date().toISOString().slice(0, 10)})\n`
for (const suite of suites) {
  const sr = results.filter(r => r.suite === suite)
  const nDisputed = new Set(sr.filter(r => disputed.has(r.taskId)).map(r => r.taskId)).size
  md += `\n## ${suite}\n\n| Lane | Score | Score (clean) | n | Errors | Median latency |\n|---|---|---|---|---|---|\n`
  const scored = lanes.map(lane => {
    const lr = sr.filter(r => r.lane === lane)
    if (!lr.length) return null
    const clean = lr.filter(r => !disputed.has(r.taskId))
    return {
      lane, ok: lr.filter(r => r.correct).length, n: lr.length,
      okC: clean.filter(r => r.correct).length, nC: clean.length,
      errs: lr.filter(r => r.error).length, ms: med(lr.map(r => r.ms || 0)),
    }
  }).filter(Boolean).sort((a, b) => b.okC / b.nC - a.okC / a.nC)
  for (const s of scored) {
    md += `| ${s.lane} | ${pct(s.ok, s.n)} | **${pct(s.okC, s.nC)}** | ${s.n} | ${s.errs} | ${(s.ms / 1000).toFixed(1)}s |\n`
  }
  if (nDisputed) md += `\n*${nDisputed} disputed-key item(s) excluded from the clean score: ${[...disputed].filter(t => sr.some(r => r.taskId === t)).join(', ')}.*\n`
}
md += `\n*Scores are within-harness comparisons (identical prompts/grading across lanes); not comparable to published leaderboard numbers. Errors count as incorrect. "Clean" excludes items where ≥5 lanes converged on the same non-key answer (label noise).*\n`

const out = path.join(dir, 'REPORT.md')
fs.writeFileSync(out, md)
console.log(md)
console.log(`\nsaved → ${out}`)
