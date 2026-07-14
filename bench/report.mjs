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

const pct = (num, den) => den ? `${(100 * num / den).toFixed(1)}%` : '—'
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0 }

let md = `# Nexus Bench — run \`${runId}\` (${new Date().toISOString().slice(0, 10)})\n`
for (const suite of suites) {
  const sr = results.filter(r => r.suite === suite)
  md += `\n## ${suite}\n\n| Lane | Score | n | Errors | Median latency |\n|---|---|---|---|---|\n`
  const scored = lanes.map(lane => {
    const lr = sr.filter(r => r.lane === lane)
    if (!lr.length) return null
    const errs = lr.filter(r => r.error).length
    const ok = lr.filter(r => r.correct).length
    return { lane, ok, n: lr.length, errs, ms: med(lr.map(r => r.ms || 0)) }
  }).filter(Boolean).sort((a, b) => b.ok / b.n - a.ok / a.n)
  for (const s of scored) {
    md += `| ${s.lane} | **${pct(s.ok, s.n)}** | ${s.n} | ${s.errs} | ${(s.ms / 1000).toFixed(1)}s |\n`
  }
}
md += `\n*Scores are within-harness comparisons (identical prompts/grading across lanes); not comparable to published leaderboard numbers. Errors count as incorrect.*\n`

const out = path.join(dir, 'REPORT.md')
fs.writeFileSync(out, md)
console.log(md)
console.log(`\nsaved → ${out}`)
