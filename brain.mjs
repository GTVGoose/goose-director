// ─────────────────────────────────────────────────────────────────────────────
// brain.mjs — the ONE tiered brain shared by every transport.
//
// Extracted from telegram.mjs (2026-07-11, Director-approved plan:
// docs/plans/2026-07-11-mini-nexus-chat-and-domains.md). Telegram, the mini
// Nexus PWA (/m), and the /voice portal are thin transports into this module,
// so routing, history, and escalation behave identically everywhere.
//
// Responsibilities:
//   • Tiered routing — local umbruh-lite agent loop → Claude Max CLI escalation
//     ("deep"/"claude" prefix, triage regex, NEEDS_DIRECTOR escape hatch, or
//     local failure), with the runaway-guard rate cap.
//   • ONE canonical conversation — the "director" thread, persisted as
//     append-only NDJSON so history survives restarts and is shared across
//     surfaces ("as I said earlier" works from any device). Messages carry a
//     channel tag (telegram | pwa | voice). Non-Director chats (e.g. Boris)
//     get their own tg-<chatId> threads.
//   • Per-thread serialization — a promise-chain mutex so two surfaces can't
//     interleave a read-modify-write on the same thread (a latent race in the
//     old in-memory Map).
//   • Job model — submitJob() returns immediately; the work continues even if
//     the requesting socket dies (mobile screen lock). SSE clients subscribe
//     to a job and can reconnect; finished jobs persist to disk. Escalated PWA
//     jobs fire notify() on completion so Telegram becomes the push layer.
//   • Event log — appendEvent()/listEvents() back the PWA status feed; the
//     Telegram notify() records everything it pushes.
//
// File delivery stays transport-specific: runTask() hands produced files to
// opts.deliverFiles when given, else falls back to the injected Telegram
// document push (files always reach the Director's phone via Telegram in v1).
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { execFile } from 'child_process'

// Per-channel mode overrides prepended to Umbruh's persona. The Telegram text
// is verbatim from the previous telegram.mjs so bot behavior is unchanged.
const TELEGRAM_MODE_OVERRIDE = `ACTIVE MODE: TELEGRAM REMOTE SESSION

You are receiving messages from the Director (or an authorized Smiley Face Studios collaborator) via Telegram while they are away from the Mac. You have full tool access (run_bash, read_file, write_file, fetch_url, open_app) to carry out tasks on the Director's Mac.

1. BE CONCISE. Replies are read on a phone. 1–4 short sentences. No markdown headers, minimal formatting, no bullet lists unless asked.
2. ACT, DON'T ASK. When given a task, use your tools to do it, then report the result briefly. Only ask a question if you are genuinely blocked.
3. CONFIRM IRREVERSIBLE ACTIONS. Before deleting files, overwriting important documents, pushing to git, or anything you cannot undo, state plainly what you are about to do and wait for a "yes".
4. You operate with the Director's delegated authority but you are NOT the Director. You do not declare canon or install sigils. The Director decides.
5. HAND OFF WHEN IT'S BEYOND YOU. You are the fast local brain. If a request needs cloud-level reasoning, repo-wide work, or producing/delivering a file (e.g. "make a PDF and send it") — anything past your local tools — do NOT attempt it or narrate it. Reply with EXACTLY one line and nothing else:
   NEEDS_DIRECTOR: <one-line reason>
   The system then hands the task to the cloud Director (Claude), which completes it and replies. There is no "sandbox" or "activate cloud" tool for you to call — the NEEDS_DIRECTOR line IS how you reach the cloud.`

const PWA_MODE_OVERRIDE = `ACTIVE MODE: MINI NEXUS MOBILE SESSION

You are talking to the Director through the mini Nexus app on their Android phone. You have full tool access (run_bash, read_file, write_file, fetch_url, open_app) on the Director's Mac.

1. BE CONCISE. Replies are read on a phone. 1–4 short sentences unless depth is clearly called for. Minimal formatting.
2. ACT, DON'T ASK. When given a task, use your tools to do it, then report the result briefly. Only ask a question if you are genuinely blocked.
3. CONFIRM IRREVERSIBLE ACTIONS. Before deleting files, overwriting important documents, pushing to git, or anything you cannot undo, state plainly what you are about to do and wait for a "yes".
4. You operate with the Director's delegated authority but you are NOT the Director. You do not declare canon or install sigils. The Director decides.
5. HAND OFF WHEN IT'S BEYOND YOU. If a request needs cloud-level reasoning, repo-wide work, or producing/delivering a file, reply with EXACTLY one line and nothing else:
   NEEDS_DIRECTOR: <one-line reason>
6. FILES GO TO TELEGRAM. Any produced document reaches the Director's phone as a Telegram message — mention that when relevant.`

const VOICE_MODE_OVERRIDE = `ACTIVE MODE: VOICE SESSION

You are speaking aloud to the Director via a mobile voice interface. Different rules apply here:

1. MEMORY IS AUTOMATIC. The interface handles all memory saving without your involvement. Do NOT mention context patches, propose approval workflows, ask for permission to save, or use phrases like "shall I propose a context patch." When the Director shares something, simply receive it naturally and continue the conversation.
2. BE CONCISE. You are speaking, not writing. Keep responses to 2-4 sentences unless depth is clearly called for. No bullet points. No headers.
3. CONVERSATIONAL TONE. Warm, direct, present. This is a conversation, not a document.`

const MODE_OVERRIDES = { telegram: TELEGRAM_MODE_OVERRIDE, pwa: PWA_MODE_OVERRIDE, voice: VOICE_MODE_OVERRIDE }

// Messages that clearly want a hands-on task loop rather than plain chat.
// (Same verb list the voice portal used to decide its tool path.)
const NEEDS_TOOLS_RE = /\b(open|run|execute|find|search|write|read|fetch|go to|check|list|create|delete|move|copy|install|launch|browse|look up|show me|get me|update|edit|save)\b/i

export function initBrain(deps) {
  const { config, REPO, readFileSafe, runAgentLoop, ollamaUrl, userDataDir } = deps

  const CHAT_DIR = path.join(userDataDir, 'chat')
  const JOBS_DIR = path.join(CHAT_DIR, 'jobs')
  const EVENTS_FILE = path.join(CHAT_DIR, 'events.ndjson')
  for (const d of [CHAT_DIR, JOBS_DIR]) if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })

  // Injected after initTelegram (the bot owns outbound push). Both no-op until then.
  let notify = async () => {}
  let notifyDocument = async () => {}
  const setNotify = (fn) => { if (fn) notify = fn }
  const setNotifyDocument = (fn) => { if (fn) notifyDocument = fn }

  // ── Canonical thread store (append-only NDJSON, channel-tagged) ────────────
  // In-memory tail per thread feeds the prompt; the file is the source of truth.
  const HISTORY_MAX = 12
  const tails = new Map()     // threadId -> [{role, content, channel, ts}]
  const chains = new Map()    // threadId -> Promise (the serialization mutex)

  const threadFile = (threadId) => path.join(CHAT_DIR, `${threadId.replace(/[^a-zA-Z0-9_-]/g, '_')}.ndjson`)

  function loadTail(threadId) {
    if (tails.has(threadId)) return tails.get(threadId)
    const rows = []
    const txt = readFileSafe(threadFile(threadId))
    if (txt) {
      const lines = txt.trim().split('\n')
      // Walk backward: collect rows until the most recent reset marker (which
      // truncates the usable history), stopping once we have a full tail.
      for (let i = lines.length - 1; i >= 0 && rows.length < HISTORY_MAX; i--) {
        let r
        try { r = JSON.parse(lines[i]) } catch { continue }
        if (r?.reset) break
        if (r?.role) rows.unshift(r)
      }
    }
    const tail = rows.slice(-HISTORY_MAX)
    tails.set(threadId, tail)
    return tail
  }

  function appendMessages(threadId, msgs) {
    const tail = loadTail(threadId)
    const lines = msgs.map(m => JSON.stringify(m)).join('\n') + '\n'
    try { fs.appendFileSync(threadFile(threadId), lines) } catch (e) { console.error('[Brain] history write failed:', e.message) }
    tail.push(...msgs)
    tails.set(threadId, tail.slice(-HISTORY_MAX))
  }

  function history(threadId, n = 50) {
    const txt = readFileSafe(threadFile(threadId))
    if (!txt) return []
    const rows = []
    for (const line of txt.trim().split('\n')) {
      try { const r = JSON.parse(line); if (r.reset) rows.length = 0; else if (r.role) rows.push(r) } catch { /* skip */ }
    }
    return rows.slice(-n)
  }

  function resetThread(threadId) {
    try { fs.appendFileSync(threadFile(threadId), JSON.stringify({ reset: true, ts: new Date().toISOString() }) + '\n') } catch { /* best effort */ }
    tails.set(threadId, [])
  }

  // Serialize work per thread so concurrent sends (two surfaces, double-tap)
  // can't interleave a read-modify-write. Errors don't poison the chain.
  function withThreadLock(threadId, fn) {
    const prev = chains.get(threadId) || Promise.resolve()
    const next = prev.then(fn, fn)
    chains.set(threadId, next.catch(() => {}))
    return next
  }

  // ── Event log (backs the PWA status feed) ──────────────────────────────────
  const EVENTS_CAP = 500
  function appendEvent(evt) {
    const rec = { ts: new Date().toISOString(), ...evt }
    try {
      fs.appendFileSync(EVENTS_FILE, JSON.stringify(rec) + '\n')
      // Cap the file occasionally so it can't grow unbounded.
      if (Math.random() < 0.02) {
        const lines = (readFileSafe(EVENTS_FILE) || '').trim().split('\n')
        if (lines.length > EVENTS_CAP * 1.5) fs.writeFileSync(EVENTS_FILE, lines.slice(-EVENTS_CAP).join('\n') + '\n')
      }
    } catch (e) { console.error('[Brain] event write failed:', e.message) }
    return rec
  }

  function listEvents(n = 100) {
    const txt = readFileSafe(EVENTS_FILE)
    if (!txt) return []
    const rows = []
    for (const line of txt.trim().split('\n')) {
      try { rows.push(JSON.parse(line)) } catch { /* skip */ }
    }
    return rows.slice(-n).reverse()
  }

  // ── System prompt assembly (persona + memory + per-channel override) ───────
  function buildSystem(channel, contextDocs) {
    let modelfileSystem = ''
    const modelfilePath = path.join(REPO, 'agents/umbruh/Modelfile')
    if (fs.existsSync(modelfilePath)) {
      const mf = readFileSafe(modelfilePath) || ''
      const m = mf.match(/SYSTEM\s+"""([\s\S]*?)"""/)
      if (m) modelfileSystem = m[1].trim()
    }
    let voiceMemory = ''
    const voiceMemPath = path.join(REPO, 'agents/umbruh/umbruh-voice-memory.md')
    if (fs.existsSync(voiceMemPath)) voiceMemory = (readFileSafe(voiceMemPath) || '').trim()
    const memoryBlock = voiceMemory
      ? `SAVED MEMORIES FROM PREVIOUS SESSIONS:\nQuote these directly when asked about them.\n\n${voiceMemory}`
      : ''
    const contextContent = (contextDocs || []).map(d => `--- ${d.title} ---\n${d.content}`).join('\n\n')
    return [MODE_OVERRIDES[channel] || MODE_OVERRIDES.telegram, modelfileSystem, memoryBlock, contextContent]
      .filter(Boolean).join('\n\n---\n\n')
  }

  // ── Claude escalation (heavy tasks / local-loop failure) ───────────────────
  const CLAUDE_PATHS = [
    path.join(os.homedir(), 'Library/pnpm/claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ]
  const findClaude = () => CLAUDE_PATHS.find(p => fs.existsSync(p)) || 'claude'

  const HANDOFF_MAX_PER_HOUR = Number(process.env.NEXUS_TG_HANDOFF_MAX_PER_HOUR || 30)
  const handoffLog = []
  const canHandoff = () => {
    const cutoff = Date.now() - 3600_000
    while (handoffLog.length && handoffLog[0] < cutoff) handoffLog.shift()
    return handoffLog.length < HANDOFF_MAX_PER_HOUR
  }

  const triageNeedsDirector = (text) =>
    /\b(pdf|convert|render|\.md\b|send me|email me|as a (pdf|doc|file|document)|turn .+ into|generate a (file|doc|report))\b/i.test(text) ||
    /\b(sandbox|council|cloud|use claude|deep dive|activate cloud|multi-?model|orchestrat)\b/i.test(text)

  function runDirector(userText, channel) {
    return new Promise((resolve) => {
      const prompt =
        `${MODE_OVERRIDES[channel] || MODE_OVERRIDES.telegram}\n\n` +
        `You are the cloud Director — the heavy-reasoning conductor of Umbruh, reached by handoff from the Director's phone. You are launched in the goose-agent-system repo and have full tools.\n\n` +
        `If the task is to deliver a document to the phone (a PDF, a file, "send me X"): produce the file on disk, then output — on its OWN line, one per file — a marker:\n` +
        `SEND_FILE: /absolute/path/to/file\n` +
        `For a Markdown source, render a PDF first with:  python3 bin/md_to_pdf.py --in <source.md> --out <output.pdf>  (write the PDF under /tmp). Then emit its SEND_FILE line.\n` +
        `Otherwise just answer. Keep any prose reply to 1-6 short phone-readable sentences, plain text, no markdown.\n\n` +
        `Director's message: ${userText}`
      execFile(
        findClaude(),
        ['-p', prompt, '--output-format', 'json', '--dangerously-skip-permissions'],
        {
          cwd: fs.existsSync(REPO) ? REPO : os.homedir(),
          timeout: 300000,
          maxBuffer: 10 * 1024 * 1024,
          encoding: 'utf8',
          env: { ...process.env, PATH: `${process.env.PATH || ''}:${path.join(os.homedir(), 'Library/pnpm')}:/opt/homebrew/bin:/usr/local/bin` },
        },
        (err, stdout) => {
          if (err && !stdout) {
            console.error('[Brain] director handoff failed:', err.message)
            return resolve({ text: null, files: [] })
          }
          let raw
          try { raw = (JSON.parse(stdout).result || '').trim() }
          catch { raw = String(stdout || '').trim().slice(0, 3500) }
          const files = []
          const text = raw.split('\n').filter(line => {
            const m = /^\s*SEND_FILE:\s*(.+?)\s*$/.exec(line)
            if (m) { if (fs.existsSync(m[1])) files.push(m[1]); return false }
            return true
          }).join('\n').trim()
          resolve({ text: text || null, files })
        },
      )
    })
  }

  async function handToDirector(userText, channel, deliverFiles, emit) {
    if (!canHandoff()) {
      return {
        text: `⏸️ Cloud handoff is paused — more than ${HANDOFF_MAX_PER_HOUR} cloud tasks this hour (runaway guard). It resets within the hour, or raise NEXUS_TG_HANDOFF_MAX_PER_HOUR. Local Umbruh is still live for quick things.`,
        files: [],
      }
    }
    handoffLog.push(Date.now())
    emit?.({ type: 'status', text: 'Escalated to the cloud Director…' })
    const { text, files } = await runDirector(userText, channel)
    if (files.length) {
      try {
        if (deliverFiles) await deliverFiles(files)
        else for (const f of files) await notifyDocument(f, { audience: 'director', filename: path.basename(f) })
      } catch (e) { console.error('[Brain] file delivery failed:', e.message) }
    }
    if (!text && files.length) return { text: `📎 Sent ${files.length} file${files.length === 1 ? '' : 's'} to Telegram.`, files }
    return { text, files }
  }

  // Fast conversational path: stream tokens (no tool loop). Used when the
  // transport prefers streaming (voice/PWA) and the message doesn't look like
  // a hands-on task. Falls back by throwing; caller catches.
  async function streamChat(messages, onToken) {
    const r = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.UMBRUH_MODEL || config.umbruhLocalModel || 'umbruh-lite', messages, stream: true }),
    })
    if (!r.ok) throw new Error(`Ollama ${r.status}`)
    const reader = r.body.getReader()
    const decoder = new TextDecoder()
    let buf = '', full = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        if (!line.trim()) continue
        let chunk
        try { chunk = JSON.parse(line) } catch { continue }
        const token = chunk.message?.content || ''
        if (token) { full += token; onToken?.(token) }
      }
    }
    return full
  }

  // ── The tiered task runner ──────────────────────────────────────────────────
  // opts: { channel, contextDocs, preferStreaming, onDelta, deliverFiles }
  // Returns { reply, via, files }. via: 'local' | 'director' | 'director-fallback'
  async function runTask(threadId, userText, opts = {}) {
    const { channel = 'telegram', contextDocs, preferStreaming = false, onDelta, deliverFiles } = opts
    return withThreadLock(threadId, async () => {
      const prior = loadTail(threadId).map(m => ({ role: m.role, content: m.content }))
      const heavy = /^(deep|claude)\b[:,]?\s*/i.exec(userText)
      let reply = null
      let files = []
      let via = 'local'

      if (heavy || triageNeedsDirector(userText)) {
        via = 'director'
        const out = await handToDirector(heavy ? (userText.slice(heavy[0].length).trim() || userText) : userText, channel, deliverFiles, onDelta)
        reply = out.text
        files = out.files
      } else {
        try {
          const messages = [
            { role: 'system', content: buildSystem(channel, contextDocs) },
            ...prior,
            { role: 'user', content: userText },
          ]
          if (preferStreaming && !NEEDS_TOOLS_RE.test(userText)) {
            reply = await streamChat(messages, (t) => onDelta?.({ type: 'token', text: t }))
          } else {
            onDelta?.({ type: 'status', text: 'Working…' })
            reply = await runAgentLoop(messages, ollamaUrl, 8, true)
          }
        } catch (e) {
          console.error('[Brain] local loop failed, handing to Director:', e.message)
          reply = null
        }
        const needsDirector = reply && /(^|\n)\s*NEEDS_DIRECTOR:/i.test(reply)
        if (!reply?.trim() || /step limit/i.test(reply) || needsDirector) {
          via = 'director-fallback'
          const out = await handToDirector(userText, channel, deliverFiles, onDelta)
          if (out.text) { reply = out.text; files = out.files }
        }
      }

      if (!reply?.trim()) {
        reply = `⚠️ Both brains missed that one (local Umbruh and the cloud Director). Nothing is lost — try rephrasing, or prefix with "deep" to force the cloud path. This channel is built to never go silent on you.`
        via = via === 'local' ? 'local' : via
      }

      const ts = new Date().toISOString()
      appendMessages(threadId, [
        { role: 'user', content: userText, channel, ts },
        { role: 'assistant', content: reply, channel, via, ts: new Date().toISOString() },
      ])
      return { reply, via, files }
    })
  }

  // ── Job model ───────────────────────────────────────────────────────────────
  // A job survives its requesting socket: submit returns immediately, SSE
  // clients attach/detach freely, the finished result persists to disk.
  const jobs = new Map()          // id -> job
  const JOB_MEMORY_CAP = 200

  const jobFile = (id) => path.join(JOBS_DIR, `${id}.json`)

  function publicJob(job) {
    const { listeners, ...rest } = job
    return rest
  }

  function persistJob(job) {
    try { fs.writeFileSync(jobFile(job.id), JSON.stringify(publicJob(job), null, 2)) }
    catch (e) { console.error('[Brain] job persist failed:', e.message) }
  }

  function getJob(id) {
    if (jobs.has(id)) return publicJob(jobs.get(id))
    const txt = readFileSafe(jobFile(String(id).replace(/[^a-zA-Z0-9_-]/g, '_')))
    if (txt) { try { return JSON.parse(txt) } catch { /* fall through */ } }
    return null
  }

  function subscribeJob(id, fn) {
    const job = jobs.get(id)
    if (!job) return null
    job.listeners.add(fn)
    return () => job.listeners.delete(fn)
  }

  function emitToJob(job, delta) {
    job.deltas.push(delta)
    if (job.deltas.length > 500) job.deltas.splice(0, job.deltas.length - 500)
    for (const fn of job.listeners) { try { fn(delta) } catch { /* listener's problem */ } }
  }

  function submitJob(threadId, text, opts = {}) {
    const id = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`
    const job = {
      id, threadId, channel: opts.channel || 'pwa', text,
      status: 'queued', via: null, reply: null, files: [],
      createdAt: new Date().toISOString(), doneAt: null, error: null,
      deltas: [], listeners: new Set(),
    }
    jobs.set(id, job)
    if (jobs.size > JOB_MEMORY_CAP) {
      // Drop oldest finished jobs from memory (they remain on disk).
      for (const [k, v] of jobs) {
        if (jobs.size <= JOB_MEMORY_CAP) break
        if (v.status === 'done' || v.status === 'error') jobs.delete(k)
      }
    }

    ;(async () => {
      job.status = 'running'
      emitToJob(job, { type: 'status', text: 'Thinking…' })
      const started = Date.now()
      try {
        const { reply, via, files } = await runTask(threadId, text, {
          ...opts,
          onDelta: (d) => emitToJob(job, d),
        })
        job.status = 'done'
        job.via = via
        job.reply = reply
        job.files = files
        job.doneAt = new Date().toISOString()
        emitToJob(job, { type: 'done', reply, via, files })
        // Long/escalated mobile jobs: push completion through Telegram so the
        // phone hears about it even if the PWA was locked away. Deep link when
        // a mobile base URL is configured.
        const tookMs = Date.now() - started
        if (job.channel === 'pwa' && (via !== 'local' || tookMs > 45000)) {
          const base = (config.mobile && config.mobile.baseUrl) ? String(config.mobile.baseUrl).replace(/\/$/, '') : ''
          const link = base ? `\n${base}/m/chat?job=${id}` : ''
          notify(`🧠 Mini Nexus task done: ${text.slice(0, 80)}${text.length > 80 ? '…' : ''}${link}`, { audience: 'director' }).catch(() => {})
        }
        appendEvent({ kind: 'chat-job', channel: job.channel, via, text: text.slice(0, 120), jobId: id })
      } catch (e) {
        job.status = 'error'
        job.error = e.message
        job.doneAt = new Date().toISOString()
        emitToJob(job, { type: 'error', error: e.message })
      }
      persistJob(job)
    })()

    return publicJob(job)
  }

  return {
    runTask, submitJob, getJob, subscribeJob,
    history, resetThread,
    appendEvent, listEvents,
    setNotify, setNotifyDocument,
    buildSystem, // exposed for the /voice fold
  }
}
