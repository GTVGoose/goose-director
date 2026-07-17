#!/usr/bin/env node
// Arena-Hard-Auto style evaluation: open-ended prompts, pairwise LLM-judge vs
// a fixed baseline, position-swapped. Judge template reimplements the official
// arena-hard-auto pairwise rubric (disclosed as a reimplementation — winrates
// are within-harness, not comparable to the public leaderboard).
//
//   node bench/arena-hard.mjs fetch                       # prompts → bench/data/arena-hard.jsonl
//   node bench/arena-hard.mjs answers --lanes a,b --limit 150 [--run-id ah]
//   node bench/arena-hard.mjs judge --baseline gpt-5.6-sol --judge chatgpt-sub [--run-id ah]
//   node bench/arena-hard.mjs report [--run-id ah]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { relayAsk, sandboxAsk, readJsonl, LANES } from './lib.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(3).map((a, i, all) =>
  a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : []).filter(x => x.length))
const cmd = process.argv[2]
const runId = args['run-id'] || 'ah'
const outDir = path.join(HERE, 'results', runId)
const dataFile = path.join(HERE, 'data', 'arena-hard.jsonl')

async function fetchPrompts() {
  const { parquetReadObjects, asyncBufferFromUrl } = await import('hyparquet')
  const url = 'https://huggingface.co/datasets/lmarena-ai/arena-hard-auto-v0.1/resolve/main/data/train-00000-of-00001.parquet'
  const file = await asyncBufferFromUrl({ url })
  const rows = await parquetReadObjects({ file })
  const records = rows.map((r, i) => ({
    id: `ah-${String(r.question_id ?? i).slice(0, 12)}`,
    cluster: r.cluster,
    prompt: Array.isArray(r.turns) ? (r.turns[0]?.content ?? r.turns[0]) : (r.prompt || r.turns),
  })).filter(r => typeof r.prompt === 'string' && r.prompt.length)
  fs.writeFileSync(dataFile, records.map(r => JSON.stringify(r)).join('\n') + '\n')
  console.log(`✓ arena-hard.jsonl: ${records.length} prompts`)
}

async function laneAnswer(laneName, prompt) {
  const lane = LANES[laneName]
  if (!lane) throw new Error(`unknown lane ${laneName}`)
  if (lane.kind === 'relay') return (await relayAsk(lane.modelId, prompt, { timeoutMs: 300000 })).text
  return (await sandboxAsk(prompt, lane.cfg, { timeoutMs: 900000 })).text
}

async function answers() {
  const lanes = String(args.lanes || '').split(',').filter(Boolean)
  if (!lanes.length) { console.error('need --lanes'); process.exit(1) }
  const limit = args.limit ? Number(args.limit) : Infinity
  // Deterministic sample: every Nth prompt for even cluster coverage.
  const all = readJsonl(dataFile)
  const step = Math.max(1, Math.floor(all.length / Math.min(limit, all.length)))
  const prompts = all.filter((_, i) => i % step === 0).slice(0, limit)
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, 'answers.jsonl')
  const done = new Set(readJsonl(outFile).map(r => `${r.id}::${r.lane}`))
  let n = 0
  for (const p of prompts) {
    const pending = lanes.filter(l => !done.has(`${p.id}::${l}`))
    const results = await Promise.all(pending.map(async l => {
      try { return { id: p.id, lane: l, text: await laneAnswer(l, p.prompt), at: new Date().toISOString() } }
      catch (e) { return { id: p.id, lane: l, error: e.message.slice(0, 200), at: new Date().toISOString() } }
    }))
    for (const r of results) fs.appendFileSync(outFile, JSON.stringify(r) + '\n')
    n++
    if (results.length) console.log(`[${n}/${prompts.length}] ${p.id} ${results.map(r => r.lane + (r.error ? ':ERR' : ':ok')).join(' ')}`)
  }
  console.log('answers done')
}

const JUDGE_SYSTEM = `Please act as an impartial judge and evaluate the quality of the responses provided by two AI assistants to the user prompt displayed below. You will be given assistant A's answer and assistant B's answer. Your job is to evaluate which assistant's answer is better.

Begin your evaluation by generating your own answer to the prompt. You must provide your answers before judging any answers.

When evaluating the assistants' answers, compare both assistants' answers with your answer. You must identify and correct any mistakes or inaccurate information.

Then consider if the assistant's answers are helpful, relevant, and concise. Helpful means the answer correctly responds to the prompt or follows the instructions. Note when user prompt has any ambiguity or more than one interpretation, it is more helpful and appropriate to ask for clarifications or more information from the user than providing an answer based on assumptions. Relevant means all parts of the response closely connect or are appropriate to what is being asked. Concise means the response is clear and not verbose or excessive.

Then consider the creativity and novelty of the assistant's answers when needed. Finally, identify any missing important information in the assistants' answers that would be beneficial to include when responding to the user prompt.

After providing your explanation, you must output only one of the following choices as your final verdict with a label:

1. Assistant A is significantly better: [[A>>B]]
2. Assistant A is slightly better: [[A>B]]
3. Tie, relatively the same: [[A=B]]
4. Assistant B is slightly better: [[B>A]]
5. Assistant B is significantly better: [[B>>A]]

Example output: "My final verdict is tie: [[A=B]]".`

async function judge() {
  const baseline = args.baseline || 'gpt-5.6-sol'
  const judgeLane = args.judge || 'chatgpt-sub'
  const answersAll = readJsonl(path.join(outDir, 'answers.jsonl')).filter(r => !r.error)
  const byKey = new Map(answersAll.map(r => [`${r.id}::${r.lane}`, r.text]))
  const prompts = new Map(readJsonl(dataFile).map(p => [p.id, p.prompt]))
  const lanes = [...new Set(answersAll.map(r => r.lane))].filter(l => l !== baseline)
  const outFile = path.join(outDir, 'judgments.jsonl')
  const done = new Set(readJsonl(outFile).map(r => `${r.id}::${r.lane}::${r.order}`))
  const ids = [...new Set(answersAll.map(r => r.id))]
  let n = 0
  for (const id of ids) {
    n++
    const base = byKey.get(`${id}::${baseline}`)
    if (!base) continue
    for (const lane of lanes) {
      const cand = byKey.get(`${id}::${lane}`)
      if (!cand) continue
      for (const order of ['cand-first', 'base-first']) {
        if (done.has(`${id}::${lane}::${order}`)) continue
        const [A, B] = order === 'cand-first' ? [cand, base] : [base, cand]
        const user = `<|User Prompt|>\n${prompts.get(id)}\n\n<|The Start of Assistant A's Answer|>\n${A}\n<|The End of Assistant A's Answer|>\n\n<|The Start of Assistant B's Answer|>\n${B}\n<|The End of Assistant B's Answer|>`
        let rec
        try {
          const lc = LANES[judgeLane]
          const out = lc.kind === 'relay'
            ? (await relayAsk(lc.modelId, user, { systemPrompt: JUDGE_SYSTEM, timeoutMs: 300000 })).text
            : (await sandboxAsk(`${JUDGE_SYSTEM}\n\n${user}`, lc.cfg, { timeoutMs: 600000 })).text
          const v = [...String(out).matchAll(/\[\[(A>>B|A>B|A=B|B>A|B>>A)\]\]/g)].pop()
          rec = { id, lane, order, verdict: v ? v[1] : null, judge: judgeLane, baseline, at: new Date().toISOString() }
        } catch (e) {
          rec = { id, lane, order, error: e.message.slice(0, 200), judge: judgeLane, baseline, at: new Date().toISOString() }
        }
        fs.appendFileSync(outFile, JSON.stringify(rec) + '\n')
      }
    }
    if (n % 10 === 0) console.log(`[judge ${n}/${ids.length}]`)
  }
  console.log('judging done')
}

function report() {
  const js = readJsonl(path.join(outDir, 'judgments.jsonl')).filter(r => r.verdict)
  const lanes = [...new Set(js.map(r => r.lane))]
  const score = (v, candIsA) => {
    const map = { 'A>>B': 1, 'A>B': 1, 'A=B': 0.5, 'B>A': 0, 'B>>A': 0 }
    const s = map[v]
    return candIsA ? s : 1 - s
  }
  console.log(`baseline: ${js[0]?.baseline}  judge: ${js[0]?.judge}`)
  const rows = lanes.map(lane => {
    const lr = js.filter(r => r.lane === lane)
    const pts = lr.map(r => score(r.verdict, r.order === 'cand-first'))
    const wr = pts.reduce((a, b) => a + b, 0) / pts.length
    return { lane, wr, n: lr.length }
  }).sort((a, b) => b.wr - a.wr)
  for (const r of rows) console.log(`${r.lane.padEnd(22)} winrate vs baseline: ${(100 * r.wr).toFixed(1)}%  (n=${r.n} judgments)`)
  fs.writeFileSync(path.join(outDir, 'REPORT.md'),
    `# Arena-Hard (within-harness) — run ${runId}\n\nbaseline: ${js[0]?.baseline} · judge: ${js[0]?.judge} · position-swapped pairs\n\n| Lane | Winrate vs baseline | Judgments |\n|---|---|---|\n` +
    rows.map(r => `| ${r.lane} | **${(100 * r.wr).toFixed(1)}%** | ${r.n} |\n`).join('') +
    `\n*50% = parity with baseline. Judge template reimplements arena-hard-auto's rubric; scores are within-harness only. Judge family = baseline family (OpenAI), which if anything biases against the non-baseline lanes.*\n`)
}

const cmds = { fetch: fetchPrompts, answers, judge, report }
if (!cmds[cmd]) { console.error('usage: arena-hard.mjs fetch|answers|judge|report'); process.exit(1) }
await cmds[cmd]()
