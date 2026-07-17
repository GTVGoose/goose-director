#!/usr/bin/env node
// Drop errored records from a run's results so a re-run of run.mjs retries just
// those (task, lane) pairs. Correct/incorrect answers are kept untouched.
//   node bench/refill-errors.mjs [--run-id v0]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readJsonl } from './lib.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const runId = process.argv.includes('--run-id') ? process.argv[process.argv.indexOf('--run-id') + 1] : 'v0'
const dir = path.join(HERE, 'results', runId)
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'))) {
  const file = path.join(dir, f)
  const rows = readJsonl(file)
  const keep = rows.filter(r => !r.error)
  if (keep.length !== rows.length) {
    fs.writeFileSync(file, keep.map(r => JSON.stringify(r)).join('\n') + (keep.length ? '\n' : ''))
    console.log(`${f}: dropped ${rows.length - keep.length} errored records (re-run run.mjs to refill)`)
  } else {
    console.log(`${f}: no errors`)
  }
}
