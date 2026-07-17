#!/usr/bin/env node
// G-VALUE readout — the funding gate for all Meetings audio work.
// Metric: % of imported meetings with ≥1 engagement event (item-checked,
// item-edited, report-exported) within 7 days of that meeting's import.
// Protocol: compute ONCE, at window end + 7 days (a day-13 import can still
// engage through day 18). See docs/meetings-implementation-plan.md §1.
//
// Usage: node scripts/meetings-engagement.mjs [meetingsDir]
//   default dir: $NEXUS_USER_DATA/meetings, else ~/Library/Application Support/Nexus/meetings
import fs from 'fs'
import path from 'path'
import os from 'os'

const ENGAGEMENT = new Set(['item-checked', 'item-edited', 'report-exported'])
const WINDOW_MS = 7 * 24 * 3600 * 1000

const dir = process.argv[2]
  || (process.env.NEXUS_USER_DATA && path.join(process.env.NEXUS_USER_DATA, 'meetings'))
  || path.join(os.homedir(), 'Library', 'Application Support', 'Nexus', 'meetings')

if (!fs.existsSync(dir)) {
  console.error(`No meetings store at ${dir}`)
  process.exit(1)
}

const rows = []
for (const id of fs.readdirSync(dir).filter(f => f.startsWith('mtg_'))) {
  const evPath = path.join(dir, id, 'events.ndjson')
  if (!fs.existsSync(evPath)) continue
  const events = fs.readFileSync(evPath, 'utf8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  const imp = events.find(e => e.event === 'import')
  if (!imp) continue
  const t0 = Date.parse(imp.t)
  const hits = events.filter(e => ENGAGEMENT.has(e.event) && Date.parse(e.t) - t0 <= WINDOW_MS && Date.parse(e.t) >= t0)
  let title = id
  try { title = JSON.parse(fs.readFileSync(path.join(dir, id, 'meta.json'), 'utf8')).title || id } catch {}
  rows.push({ id, title: title.slice(0, 48), imported: imp.t.slice(0, 10), engaged: hits.length > 0, kinds: [...new Set(hits.map(h => h.event))] })
}

if (!rows.length) {
  console.log('No imported meetings with event logs found.')
  process.exit(0)
}

const engaged = rows.filter(r => r.engaged).length
const pct = Math.round((engaged / rows.length) * 100)
console.log(`\nG-VALUE readout — ${dir}\n`)
for (const r of rows) {
  console.log(`  ${r.engaged ? '✓' : '·'} ${r.imported}  ${r.title}${r.kinds.length ? `  [${r.kinds.join(', ')}]` : ''}`)
}
console.log(`\n  ${engaged}/${rows.length} meetings engaged within 7 days → G-VALUE = ${pct}%  (gate: ≥40%)`)
console.log(`  Reminder: decision-grade only when computed at window end + 7 days.\n`)
process.exit(0)
