// Shared plumbing: Nexus API clients (SSE), prompt templates, answer extraction, graders.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
const zlibInflate = (buf) => { try { return zlib.inflateSync(buf) } catch { return zlib.gunzipSync(buf) } }

export const NEXUS = process.env.NEXUS_URL || 'http://localhost:3001'

// ── SSE helpers ──────────────────────────────────────────────────────────────
async function ssePost(url, body, { timeoutMs = 300000 } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: ctrl.signal,
    })
    if (!r.ok) throw new Error(`${url} → ${r.status}: ${(await r.text()).slice(0, 300)}`)
    const events = []
    let buf = ''
    for await (const chunk of r.body) {
      buf += Buffer.from(chunk).toString('utf8')
      let idx
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx); buf = buf.slice(idx + 2)
        for (const line of frame.split('\n')) {
          if (line.startsWith('data: ')) {
            try { events.push(JSON.parse(line.slice(6))) } catch { /* keepalive/comment */ }
          }
        }
      }
    }
    return events
  } finally { clearTimeout(timer) }
}

// Solo model call through the product's relay (streams {text} chunks then {done}).
export async function relayAsk(modelId, userText, { systemPrompt, timeoutMs } = {}) {
  const t0 = Date.now()
  const events = await ssePost(`${NEXUS}/api/relay`, {
    modelId, systemPrompt, messages: [{ role: 'user', content: userText }],
  }, { timeoutMs })
  const err = events.find(e => e.error)
  if (err && !events.some(e => e.text)) throw new Error(err.error)
  const text = events.filter(e => e.text).map(e => e.text).join('')
  return { text, ms: Date.now() - t0 }
}

// Orchestrated call through the sandbox; answer = the `final` event (aggregator
// synthesis), falling back to the last `turn` for aggregator-less runs — a
// single-participant roundtable is our unified solo-lane path, since callModel
// supports every provider (incl. claude-code and codex subscription CLIs).
export async function sandboxAsk(task, cfg, { timeoutMs } = {}) {
  const t0 = Date.now()
  const events = await ssePost(`${NEXUS}/api/sandbox`, { task, ...cfg }, { timeoutMs })
  const fin = [...events].reverse().find(e => (e.type === 'final' || e.type === 'turn') && e.text)
  if (!fin) {
    const errs = events.filter(e => e.type === 'turn-error' || e.error).map(e => e.error).join('; ')
    throw new Error(`no answer event${errs ? ` (${errs.slice(0, 200)})` : ''}`)
  }
  return { text: fin.text, ms: Date.now() - t0, turns: events.filter(e => e.type === 'turn').length }
}

// ── Prompt templates ─────────────────────────────────────────────────────────
const LETTERS = 'ABCDEFGHIJ'

export function buildPrompt(task) {
  if (task.suite === 'mmlu-pro') {
    const opts = task.options.map((o, i) => `${LETTERS[i]}. ${o}`).join('\n')
    return `Answer the following multiple-choice question. Think step by step, then give your final answer as a single line in exactly this format:\nANSWER: <letter>\n\nQuestion: ${task.question}\n\nOptions:\n${opts}`
  }
  if (task.suite === 'aime25') {
    return `Solve the following competition math problem. The answer is an integer from 0 to 999. Show your reasoning, then give your final answer as a single line in exactly this format:\nANSWER: <integer>\n\nProblem: ${task.question}`
  }
  if (task.suite === 'humaneval') {
    return `Complete the following Python function. Reply with ONE Python code block containing the complete, self-contained implementation (include the function signature and any imports; no example usage, no tests).\n\n\`\`\`python\n${task.prompt}\`\`\``
  }
  // LiveBench questions carry their own task-specific format instructions —
  // use them verbatim (matching the official harness).
  if (task.suite.startsWith('lb-')) return task.question
  throw new Error(`unknown suite ${task.suite}`)
}

// ── Answer extraction ────────────────────────────────────────────────────────
export function extractAnswer(suite, text) {
  if (!text) return null
  if (suite === 'mmlu-pro') {
    const m = [...text.matchAll(/ANSWER\s*[:=]\s*\(?([A-J])\)?/gi)].pop()
    if (m) return m[1].toUpperCase()
    const tail = [...text.matchAll(/\b([A-J])\b/g)].pop() // last bare letter, weak fallback
    return tail ? tail[1] : null
  }
  if (suite === 'aime25') {
    const m = [...text.matchAll(/ANSWER\s*[:=]\s*\$?(\d{1,3})\b/gi)].pop()
    if (m) return m[1]
    const boxed = [...text.matchAll(/\\boxed\{(\d{1,3})\}/g)].pop()
    if (boxed) return boxed[1]
    const tail = [...text.matchAll(/\b(\d{1,3})\b/g)].pop()
    return tail ? tail[1] : null
  }
  if (suite === 'humaneval' || suite === 'lb-coding') {
    const blocks = [...text.matchAll(/```(?:python)?\n([\s\S]*?)```/g)].map(m => m[1])
    return blocks.length ? blocks[blocks.length - 1] : text
  }
  if (suite.startsWith('lb-')) {
    // LiveBench tasks use several final-answer conventions; try them newest-last.
    const sol = [...text.matchAll(/<solution>([\s\S]*?)<\/solution>/gi)].pop()
    if (sol) return sol[1].trim()
    const ans = [...text.matchAll(/^\s*(?:\*\*)?Answer(?:\*\*)?\s*[:=]\s*(.+)$/gim)].pop()
    if (ans) return ans[1].trim()
    const bold = [...text.matchAll(/\*\*([^*]{1,300}?)\*\*/g)].pop()
    if (bold) return bold[1].trim()
    return text.trim() // tablereformat etc. answer with the raw table/JSON
  }
  return null
}

// ── Graders ──────────────────────────────────────────────────────────────────
export function grade(task, extracted) {
  if (extracted == null) return { correct: false, detail: 'no-answer' }
  if (task.suite === 'mmlu-pro') return { correct: extracted === task.answer }
  if (task.suite === 'aime25') return { correct: Number(extracted) === Number(task.answer) }
  if (task.suite === 'humaneval') return gradeHumanEval(task, extracted)
  if (task.suite === 'lb-coding') return gradeLbCoding(task, extracted)
  if (task.suite.startsWith('lb-')) return gradeLbText(task, extracted)
  return { correct: false, detail: 'unknown-suite' }
}

// LiveBench text tasks. Reimplementation of the official scorers' spirit:
// list-style answers compare element-wise after normalization; JSON tasks
// deep-compare with numeric tolerance; everything else normalized equality.
// Stricter than official for math (no sympy equivalence) — disclosed in report.
const lbNorm = (s) => String(s).toLowerCase().replace(/[$\\{}]|\\left|\\right|\s+/g, '').replace(/\.$/, '')
function deepEq(a, b) {
  if (typeof a === 'number' || typeof b === 'number') {
    const x = Number(a), y = Number(b)
    if (Number.isFinite(x) && Number.isFinite(y)) return Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(x), Math.abs(y))
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => deepEq(v, b[i]))
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort()
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && deepEq(a[k], b[k]))
  }
  return lbNorm(a) === lbNorm(b)
}
// Tables arrive in either orientation — records array [{row},...] or pandas
// "index" object {"69":{row},...} (the official scorer normalizes via pandas).
// Canonicalize both to an order-insensitive multiset of rows.
function tableRows(x) {
  if (Array.isArray(x) && x.every(v => v && typeof v === 'object')) return x
  if (x && typeof x === 'object' && Object.values(x).length && Object.values(x).every(v => v && typeof v === 'object')) return Object.values(x)
  return null
}
function canonRows(rows) {
  return rows
    .map(r => Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b))))
    .map(r => JSON.stringify(r, (k, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v)))
    .sort()
}
function gradeLbText(task, extracted) {
  const gt = task.ground_truth
  if (gt.trim().startsWith('{') || gt.trim().startsWith('[')) {
    try {
      const want = JSON.parse(gt)
      const m = String(extracted).match(/[{[][\s\S]*[}\]]/)
      if (!m) return { correct: false, detail: 'no-json' }
      const got = JSON.parse(m[0])
      const wr = tableRows(want), gr = tableRows(got)
      if (wr && gr) return { correct: wr.length === gr.length && canonRows(wr).every((r, i) => r === canonRows(gr)[i]) }
      return { correct: deepEq(got, want) }
    } catch { return { correct: false, detail: 'json-parse' } }
  }
  const wantList = gt.split(',').map(lbNorm)
  const gotList = String(extracted).split(',').map(lbNorm)
  if (wantList.length > 1) {
    return { correct: gotList.length === wantList.length && wantList.every((w, i) => w === gotList[i]) }
  }
  return { correct: lbNorm(extracted) === lbNorm(gt) }
}

// LiveBench coding: LCB-style test cases (public + private; private may be
// base64+zlib). stdin tests feed stdin and compare stdout; functional tests
// call metadata.fn_name on a Solution instance.
function lbTests(task) {
  const parse = (raw) => {
    if (!raw) return []
    try { return JSON.parse(raw) } catch { /* compressed */ }
    // LCB private tests: base64(zlib(pickle(json_str))) — decode via python.
    const r = spawnSync('python3', ['-c',
      'import pickle,zlib,base64,json,sys;d=pickle.loads(zlib.decompress(base64.b64decode(sys.stdin.read())));print(d if isinstance(d,str) else json.dumps(d))'],
      { input: raw, encoding: 'utf8', timeout: 20000, maxBuffer: 64 * 1024 * 1024 })
    if (r.status !== 0) throw new Error(`pickle-decode: ${(r.stderr || '').slice(0, 80)}`)
    return JSON.parse(r.stdout)
  }
  return [...parse(task.public_test_cases), ...parse(task.private_test_cases)]
}
function gradeLbCoding(task, code) {
  let tests
  try { tests = lbTests(task) } catch (e) { return { correct: false, detail: `tests-undecodable: ${e.message.slice(0, 80)}` } }
  if (!tests.length) return { correct: false, detail: 'no-tests' }
  const meta = task.original_json?.metadata ? JSON.parse(task.original_json.metadata) : {}
  for (const t of tests.slice(0, 24)) {
    let program, input = ''
    if ((t.testtype || 'stdin') === 'functional' && meta.fn_name) {
      program = `${code}\nimport json,sys\n_args=json.loads(sys.stdin.read())\n_r=Solution().${meta.fn_name}(*_args)\nprint(json.dumps(_r))`
      input = JSON.stringify(String(t.input).trim().split('\n').map(l => JSON.parse(l)))
    } else {
      program = code
      input = t.input
    }
    const tmp = path.join(os.tmpdir(), `lb-${task.id}-${process.pid}.py`)
    fs.writeFileSync(tmp, program)
    try {
      const r = spawnSync('python3', ['-I', tmp], { timeout: 20000, encoding: 'utf8', input })
      if (r.status !== 0) return { correct: false, detail: (r.stderr || 'exit-nonzero').split('\n').filter(Boolean).pop()?.slice(0, 120) }
      const got = (r.stdout || '').trim(), want = String(t.output ?? '').trim()
      const ok = (t.testtype === 'functional' && meta.fn_name)
        ? (() => { try { return deepEq(JSON.parse(got), JSON.parse(want)) } catch { return got === want } })()
        : got === want
      if (!ok) return { correct: false, detail: `wrong-output@${t.testtype || 'stdin'}` }
    } finally { fs.unlinkSync(tmp) }
  }
  return { correct: true }
}

function gradeHumanEval(task, code) {
  // If the model returned only a body, prepend the original prompt (signature).
  const defRe = new RegExp(`def\\s+${task.entry_point}\\s*\\(`)
  const program = (defRe.test(code) ? code : task.prompt + '\n' + code)
    + '\n\n' + task.test + `\ncheck(${task.entry_point})\n`
  const tmp = path.join(os.tmpdir(), `he-${task.id}-${process.pid}.py`)
  fs.writeFileSync(tmp, program)
  try {
    const r = spawnSync('python3', ['-I', tmp], { timeout: 15000, encoding: 'utf8' })
    if (r.status === 0) return { correct: true }
    return { correct: false, detail: (r.stderr || r.error?.message || 'nonzero-exit').split('\n').filter(Boolean).pop()?.slice(0, 200) }
  } finally { fs.unlinkSync(tmp) }
}

export function readJsonl(file) {
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
}
