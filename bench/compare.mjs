#!/usr/bin/env node
// Cross-run comparison: how did each lane move between two runs?
//   node bench/compare.mjs --base v0 --new v1 [--suites mmlu-pro,aime25]
// Lanes present in either run are shown; disputed-key items (≥5 lanes agree on
// one non-key answer, computed per run over choice suites) are excluded from
// both sides so the delta is apples-to-apples.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readJsonl } from './lib.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) =>
  a.startsWith('--') ? [a.slice(2), all[i + 1]] : []).filter(x => x.length))
const baseId = args.base || 'v0'
const newId = args.new || 'v1'
const suites = (args.suites || 'mmlu-pro,aime25').split(',')

function loadRun(runId) {
  const dir = path.join(HERE, 'results', runId)
  const latest = new Map()
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'))) {
    for (const r of readJsonl(path.join(dir, f))) latest.set(`${r.taskId}::${r.lane}`, r)
  }
  return [...latest.values()]
}

function disputedOf(results, suite) {
  if (suite === 'humaneval') return new Set()
  const byTask = new Map()
  for (const r of results.filter(r => r.suite === suite)) byTask.set(r.taskId, [...(byTask.get(r.taskId) || []), r])
  const out = new Set()
  for (const [taskId, rs] of byTask) {
    if (rs.some(r => r.correct)) continue
    const counts = {}
    for (const r of rs) if (r.extracted != null) counts[r.extracted] = (counts[r.extracted] || 0) + 1
    if (Math.max(0, ...Object.values(counts)) >= 5) out.add(taskId)
  }
  return out
}

const base = loadRun(baseId), fresh = loadRun(newId)
let md = `# Nexus Bench — ${baseId} vs ${newId}\n`
for (const suite of suites) {
  const disputed = new Set([...disputedOf(base, suite), ...disputedOf(fresh, suite)])
  const score = (results, lane) => {
    const lr = results.filter(r => r.suite === suite && r.lane === lane && !disputed.has(r.taskId))
    return lr.length ? { pct: 100 * lr.filter(r => r.correct).length / lr.length, n: lr.length, errs: lr.filter(r => r.error).length } : null
  }
  const lanes = [...new Set([...base, ...fresh].filter(r => r.suite === suite).map(r => r.lane))].sort()
  md += `\n## ${suite}${disputed.size ? ` (${disputed.size} disputed keys excluded)` : ''}\n\n| Lane | ${baseId} | ${newId} | Δ |\n|---|---|---|---|\n`
  const rows = lanes.map(lane => ({ lane, b: score(base, lane), f: score(fresh, lane) }))
    .sort((a, b) => ((b.f || b.b)?.pct ?? -1) - ((a.f || a.b)?.pct ?? -1))
  for (const { lane, b, f } of rows) {
    const fmt = s => s ? `${s.pct.toFixed(1)}%${s.errs ? ` (${s.errs}e)` : ''}` : '—'
    const delta = b && f ? `${f.pct - b.pct >= 0 ? '+' : ''}${(f.pct - b.pct).toFixed(1)}` : '—'
    md += `| ${lane} | ${fmt(b)} | ${fmt(f)} | ${delta} |\n`
  }
}
md += `\n*Clean scores; errors count as incorrect. Lanes absent from a run show —.*\n`
const out = path.join(HERE, 'results', newId, `COMPARE-${baseId}-vs-${newId}.md`)
fs.writeFileSync(out, md)
console.log(md + `\nsaved → ${out}`)
