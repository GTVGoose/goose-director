#!/usr/bin/env node
// Download the v0 benchmark suites into bench/data/ as normalized JSONL.
// Every record: { id, suite, prompt-parts..., answer } — run.mjs owns prompt templates.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data')
fs.mkdirSync(DATA, { recursive: true })

const HF_ROWS = 'https://datasets-server.huggingface.co/rows'

async function hfRows(dataset, config, split, offset, length) {
  const u = `${HF_ROWS}?dataset=${encodeURIComponent(dataset)}&config=${config}&split=${split}&offset=${offset}&length=${length}`
  const r = await fetch(u)
  if (!r.ok) throw new Error(`HF rows ${dataset} ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return (await r.json()).rows.map(x => x.row)
}

function writeJsonl(file, records) {
  fs.writeFileSync(path.join(DATA, file), records.map(r => JSON.stringify(r)).join('\n') + '\n')
  console.log(`✓ ${file}: ${records.length} records`)
}

// ── MMLU-Pro: stratified sample, deterministic (first N per category by row order).
// The datasets-server rows API 503s (2026-07-14), so read the canonical parquet
// directly with hyparquet (pure JS).
async function fetchMmluPro(perCategory = 10) {
  const { parquetReadObjects, asyncBufferFromUrl } = await import('hyparquet')
  const url = 'https://huggingface.co/datasets/TIGER-Lab/MMLU-Pro/resolve/main/data/test-00000-of-00001.parquet'
  const file = await asyncBufferFromUrl({ url })
  const all = await parquetReadObjects({ file, columns: ['question_id', 'question', 'options', 'answer', 'category'] })
  const byCat = new Map()
  for (const r of all) {
    const arr = byCat.get(r.category) || []
    if (arr.length < perCategory) { arr.push(r); byCat.set(r.category, arr) }
  }
  const records = []
  for (const [cat, rows] of [...byCat.entries()].sort()) {
    for (const r of rows) {
      records.push({
        id: `mmlupro-${r.question_id}`, suite: 'mmlu-pro', category: cat,
        question: r.question, options: r.options, answer: r.answer, // letter e.g. "B"
      })
    }
  }
  writeJsonl('mmlu-pro.jsonl', records)
}

// ── AIME 2025 (30 problems, integer answers) from the math-ai/aime25 mirror ──
async function fetchAime25() {
  const url = 'https://huggingface.co/datasets/math-ai/aime25/resolve/main/test.jsonl'
  const r = await fetch(url)
  if (!r.ok) throw new Error(`aime25 fetch ${r.status}`)
  const rows = (await r.text()).trim().split('\n').map(l => JSON.parse(l))
  const records = rows.map((row, i) => ({
    id: `aime25-${String(row.id ?? i).replace(/[^\w-]/g, '_')}`,
    suite: 'aime25',
    question: row.problem || row.question,
    answer: String(row.answer).trim(),
  })).filter(rec => rec.question && /^\d+$/.test(rec.answer))
  if (records.length < 28) throw new Error(`aime25: only ${records.length} usable rows`)
  writeJsonl('aime25.jsonl', records)
}

// ── HumanEval: canonical gz from the openai/human-eval repo ──
async function fetchHumanEval() {
  const url = 'https://raw.githubusercontent.com/openai/human-eval/master/data/HumanEval.jsonl.gz'
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HumanEval fetch ${r.status}`)
  const gz = Buffer.from(await r.arrayBuffer())
  const text = zlib.gunzipSync(gz).toString('utf8')
  const records = text.trim().split('\n').map(l => {
    const t = JSON.parse(l)
    return {
      id: t.task_id.replace('/', '-'), suite: 'humaneval',
      prompt: t.prompt, entry_point: t.entry_point, test: t.test,
    }
  })
  writeJsonl('humaneval.jsonl', records)
}

// ── LiveBench (contamination-limited; graders reimplemented in lib.mjs) ──────
// Mechanically-gradable categories only. Rows currently served by HF are the
// live (non-removed) question set; livebench_release_date is kept per record.
async function fetchLiveBench() {
  const cats = [
    ['reasoning', 'lb-reasoning'],
    ['math', 'lb-math'],
    ['data_analysis', 'lb-data'],
    ['coding', 'lb-coding'],
  ]
  for (const [cat, suite] of cats) {
    const rows = []
    const page = cat === 'coding' ? 10 : 100 // coding rows embed test blobs
    for (let off = 0; off < 1000; off += page) {
      const batch = await hfRows(`livebench/${cat}`, 'default', 'test', off, page)
      rows.push(...batch)
      if (batch.length < page) break
    }
    const records = rows.map(r => {
      const base = {
        id: `lb-${r.question_id.slice(0, 12)}`, suite, task: r.task,
        question: r.turns[0], release: (r.livebench_release_date || '').slice(0, 10),
      }
      if (cat === 'coding') {
        return { ...base, question_title: r.question_title, ground_truth: '',
                 public_test_cases: r.public_test_cases, private_test_cases: r.private_test_cases,
                 original_json: r.original_json ? { metadata: r.original_json.metadata } : undefined }
      }
      return { ...base, ground_truth: String(r.ground_truth ?? '') }
    })
    writeJsonl(`${suite}.jsonl`, records)
  }
}

const only = process.argv[2] // optional: mmlu-pro | aime25 | humaneval | livebench
const jobs = { 'mmlu-pro': () => fetchMmluPro(10), aime25: fetchAime25, humaneval: fetchHumanEval, livebench: fetchLiveBench }
for (const [name, job] of Object.entries(jobs)) {
  if (only && only !== name) continue
  try { await job() } catch (e) { console.error(`✗ ${name}: ${e.message}`); process.exitCode = 1 }
}
