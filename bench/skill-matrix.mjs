#!/usr/bin/env node
// Distill bench results into a machine-readable per-domain skill matrix that
// the Nexus router (routing-policies.js / escalation-router.js) can consume in
// place of the hardcoded PROVIDER_STRENGTH map.
//   node bench/skill-matrix.mjs [--run-id v0]  → bench/results/<run-id>/skill-matrix.json
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readJsonl } from './lib.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const runId = process.argv.includes('--run-id') ? process.argv[process.argv.indexOf('--run-id') + 1] : 'v0'
const dir = path.join(HERE, 'results', runId)

// taskId → domain. MMLU-Pro contributes its 14 categories; AIME reinforces
// math; HumanEval is coding.
const domainOf = new Map()
for (const t of readJsonl(path.join(HERE, 'data', 'mmlu-pro.jsonl'))) domainOf.set(t.id, t.category)
for (const t of readJsonl(path.join(HERE, 'data', 'aime25.jsonl'))) domainOf.set(t.id, 'math')
for (const t of readJsonl(path.join(HERE, 'data', 'humaneval.jsonl'))) domainOf.set(t.id, 'coding')

const latest = new Map()
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'))) {
  for (const r of readJsonl(path.join(dir, f))) latest.set(`${r.taskId}::${r.lane}`, r)
}

const cells = {} // lane → domain → {ok, n, err, msSum}
for (const r of latest.values()) {
  const domain = domainOf.get(r.taskId)
  if (!domain) continue
  const c = ((cells[r.lane] ||= {})[domain] ||= { ok: 0, n: 0, err: 0, msSum: 0 })
  c.n++; c.ok += r.correct ? 1 : 0; c.err += r.error ? 1 : 0; c.msSum += r.ms || 0
}

const matrix = {
  generatedAt: new Date().toISOString(),
  runId,
  note: 'accuracy per lane per domain; n is small per MMLU category (~10) — treat single-domain gaps <20pts as noise. attempted = accuracy among non-errored calls.',
  lanes: {},
}
for (const [lane, domains] of Object.entries(cells)) {
  matrix.lanes[lane] = {}
  for (const [domain, c] of Object.entries(domains)) {
    matrix.lanes[lane][domain] = {
      accuracy: +(c.ok / c.n).toFixed(3),
      attempted: c.n - c.err ? +(c.ok / (c.n - c.err)).toFixed(3) : null,
      n: c.n, errors: c.err, avgMs: Math.round(c.msSum / c.n),
    }
  }
}

const out = path.join(dir, 'skill-matrix.json')
fs.writeFileSync(out, JSON.stringify(matrix, null, 2))
console.log(`saved → ${out}`)

// Console view: domains × lanes accuracy table
const lanes = Object.keys(matrix.lanes).sort()
const domains = [...new Set(Object.values(matrix.lanes).flatMap(d => Object.keys(d)))].sort()
const pad = (s, w) => String(s).padEnd(w)
console.log('\n' + pad('domain', 14) + lanes.map(l => pad(l.replace('nexus-', ''), 15)).join(''))
for (const d of domains) {
  console.log(pad(d, 14) + lanes.map(l => {
    const c = matrix.lanes[l][d]
    return pad(c ? `${(100 * c.accuracy).toFixed(0)}%${c.errors ? `(${c.errors}e)` : ''}` : '—', 15)
  }).join(''))
}
