// Shared plumbing: Nexus API clients (SSE), prompt templates, answer extraction, graders.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

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
  if (suite === 'humaneval') {
    const blocks = [...text.matchAll(/```(?:python)?\n([\s\S]*?)```/g)].map(m => m[1])
    return blocks.length ? blocks[blocks.length - 1] : text
  }
  return null
}

// ── Graders ──────────────────────────────────────────────────────────────────
export function grade(task, extracted) {
  if (extracted == null) return { correct: false, detail: 'no-answer' }
  if (task.suite === 'mmlu-pro') return { correct: extracted === task.answer }
  if (task.suite === 'aime25') return { correct: Number(extracted) === Number(task.answer) }
  if (task.suite === 'humaneval') return gradeHumanEval(task, extracted)
  return { correct: false, detail: 'unknown-suite' }
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
