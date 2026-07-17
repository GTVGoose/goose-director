#!/usr/bin/env node
// Run a suite across lanes through the live Nexus server. Resumable: results
// append to bench/results/<run-id>/<suite>.jsonl and completed (task, lane)
// pairs are skipped on re-run.
//
//   node bench/run.mjs --suite mmlu-pro [--limit 5] [--lanes a,b,c] [--run-id r1]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { relayAsk, sandboxAsk, buildPrompt, extractAnswer, grade, readJsonl } from './lib.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// ── Lane definitions ─────────────────────────────────────────────────────────
// Solo lanes run as single-participant, aggregator-less roundtables so every
// provider goes through the same code path (callModel), which — unlike
// /api/relay — also supports the claude-code and codex subscription CLIs.
const solo = (modelId) => ({ kind: 'sandbox', cfg: { mode: 'roundtable', participantIds: [modelId], rounds: 1 } })
const COUNCIL = ['claude-max', 'chatgpt-sub', 'gemini-flash', 'mistral-large', 'deepseek-chat']
export const LANES = {
  'claude-max':    solo('claude-max'),
  'chatgpt-sub':   solo('chatgpt-sub'),
  'gpt-5.6-sol':   solo('gpt-5.6-sol'),
  'gemini-flash':  solo('gemini-flash'),
  'mistral-large': solo('mistral-large'),
  'deepseek-chat': solo('deepseek-chat'),
  'ollama-local':  solo('ollama-local'),
  // Orchestrated lanes (via /api/sandbox)
  'nexus-council': {
    kind: 'sandbox',
    cfg: { mode: 'roundtable', participantIds: COUNCIL, aggregatorId: 'claude-max', rounds: 1 },
  },
  'nexus-local-council': {
    kind: 'sandbox',
    cfg: { mode: 'roundtable', participantIds: ['ollama-local', 'umbruh-lite'], aggregatorId: 'ollama-local', rounds: 1 },
  },
  // v1 aggregation A/B — same members, different combination policy. Needs a
  // server with the aggregation param (run with NEXUS_URL=http://localhost:3002).
  'nexus-council-vote': {
    kind: 'sandbox',
    cfg: { mode: 'roundtable', participantIds: COUNCIL, aggregatorId: 'claude-max', rounds: 1, aggregation: 'vote' },
  },
  'nexus-council-verify': {
    kind: 'sandbox',
    cfg: { mode: 'roundtable', participantIds: COUNCIL, aggregatorId: 'claude-max', rounds: 1, aggregation: 'verify' },
  },
}
const DEFAULT_LANES = ['claude-max', 'chatgpt-sub', 'gpt-5.6-sol', 'gemini-flash', 'mistral-large', 'deepseek-chat', 'ollama-local', 'nexus-council']

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) =>
  a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : []).filter(x => x.length))
const suite = args.suite
if (!suite) { console.error('usage: node bench/run.mjs --suite mmlu-pro|aime25|humaneval [--limit N] [--lanes a,b] [--run-id id]'); process.exit(1) }
const limit = args.limit ? Number(args.limit) : Infinity
const lanes = (args.lanes ? String(args.lanes).split(',') : DEFAULT_LANES).filter(l => {
  if (!LANES[l]) { console.error(`unknown lane: ${l}`); process.exit(1) }
  return true
})
const runId = args['run-id'] || 'v0'

// ── Load work ────────────────────────────────────────────────────────────────
const tasks = readJsonl(path.join(HERE, 'data', `${suite}.jsonl`)).slice(0, limit)
if (!tasks.length) { console.error(`no data for ${suite} — run fetch-datasets.mjs first`); process.exit(1) }
const outDir = path.join(HERE, 'results', runId)
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, `${suite}.jsonl`)
const done = new Set(readJsonl(outFile).map(r => `${r.taskId}::${r.lane}`))

// Long-reasoning math regularly blows the 10-minute budget (v0: Claude lost
// 10/30 AIME to timeouts while scoring 100% on what it finished) — give math
// suites a wider window.
const TIMEOUT = {
  relay: 240000,
  sandbox: Number(process.env.BENCH_SANDBOX_TIMEOUT_MS) || (suite === 'aime25' ? 1500000 : 600000),
}

async function askLane(lane, prompt) {
  if (lane.kind === 'relay') return relayAsk(lane.modelId, prompt, { timeoutMs: TIMEOUT.relay })
  return sandboxAsk(prompt, lane.cfg, { timeoutMs: TIMEOUT.sandbox })
}

async function runOne(task, laneName) {
  const lane = LANES[laneName]
  const prompt = buildPrompt(task)
  const t0 = Date.now()
  let text, ms, turns, error = null
  try {
    try {
      ({ text, ms, turns } = await askLane(lane, prompt))
    } catch (e) {
      if (!/fetch failed|no answer event|→ (408|429|5\d\d)/i.test(e.message)) throw e
      await new Promise(r => setTimeout(r, 4000))       // transient overload: one retry
      ;({ text, ms, turns } = await askLane(lane, prompt))
    }
  } catch (e) { error = e.message.slice(0, 300); ms = Date.now() - t0 }
  const extracted = error ? null : extractAnswer(suite, text)
  const g = error ? { correct: false, detail: 'lane-error' } : grade(task, extracted)
  return {
    taskId: task.id, suite, lane: laneName, correct: g.correct,
    extracted: suite === 'humaneval' ? undefined : extracted,
    expected: task.answer, detail: g.detail, error, ms, turns,
    chars: text ? text.length : 0, at: new Date().toISOString(),
  }
}

// One task at a time; its lanes run at limited concurrency — the Electron-hosted
// server's outbound fetches start failing when we hammer it with 8 parallel
// sandbox requests (observed 2026-07-14), and 3-wide keeps every provider polite.
const WIDTH = args.width ? Number(args.width) : 3
async function mapLimited(items, width, fn) {
  const out = []; let i = 0
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]) }
  }))
  return out
}
let n = 0
for (const task of tasks) {
  const pending = lanes.filter(l => !done.has(`${task.id}::${l}`))
  if (!pending.length) { n++; continue }
  const results = await mapLimited(pending, WIDTH, l => runOne(task, l))
  for (const r of results) fs.appendFileSync(outFile, JSON.stringify(r) + '\n')
  n++
  const marks = results.map(r => `${r.lane}:${r.error ? '✗ERR' : r.correct ? '✓' : '✗'}`).join(' ')
  console.log(`[${n}/${tasks.length}] ${task.id} ${marks}`)
}
console.log(`done → ${outFile}`)
