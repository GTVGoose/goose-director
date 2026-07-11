// ─────────────────────────────────────────────────────────────────────────────
// telegram.mjs — Goose / SFS Telegram bot for the Nexus server
//
// Two jobs:
//   1. OUTBOUND status feed — push updates about running loops / cascade prompts
//      to the Director (everything) and to Boris @ Smiley Face Studios (curated
//      milestones only). Driven by the /api/notify endpoint and by a file watcher
//      on loop logs (LOOP_LOG.md, DIRECTOR_STATUS.md, + any extra paths in config).
//   2. INBOUND remote control — the Director (or an authorized chat) can send a
//      text or a voice note from their phone; it is transcribed (voice) and run
//      through the shared tiered brain (brain.mjs) on the Mac, then the result
//      is sent back.
//
// 2026-07-11: this module is now a thin TRANSPORT. The tiered routing (local
// umbruh-lite loop → Claude escalation), history, and system prompts moved to
// brain.mjs so Telegram, the mini Nexus PWA, and /voice share ONE brain and
// ONE canonical Director thread. See docs/plans/2026-07-11-mini-nexus-chat-and-domains.md.
//
// No new npm deps: uses built-in fetch + child_process. Voice transcription shells
// out to whisper.cpp or openai-whisper (see install-telegram.command).
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

export function initTelegram(deps) {
  const { app, config, REPO, readFileSafe, generateTTS, signal, brain } = deps
  const tg = config.telegram || {}
  const token = process.env.TELEGRAM_BOT_TOKEN

  if (!tg.enabled || !token) {
    console.log('[Telegram] disabled — set telegram.enabled=true in goose.config.json and TELEGRAM_BOT_TOKEN in .env to activate.')
    // Still register a notify endpoint that reports it's disabled, so callers get a clear error.
    app.post('/api/notify', (_req, res) => res.status(503).json({ error: 'Telegram bot disabled' }))
    return
  }

  const API = `https://api.telegram.org/bot${token}`
  const FILE_API = `https://api.telegram.org/file/bot${token}`
  const directorChatId = String(tg.directorChatId || '').trim()
  const borisChatId = String(tg.borisChatId || '').trim()
  const allowVoiceReplies = tg.allowVoiceReplies !== false
  const pollTimeout = Number(tg.pollTimeoutSec || 50)
  const notifySecret = process.env.NOTIFY_SECRET || ''
  // Tags that Boris is allowed to receive when notify() is called with a `tag`.
  const borisTags = (tg.borisTags || ['milestone', 'release', 'proposal', 'merge']).map(t => String(t).toLowerCase())

  const knownChats = new Set([directorChatId, borisChatId].filter(Boolean))
  const isKnown = (id) => knownChats.has(String(id))
  const isDirector = (id) => String(id) === directorChatId

  // The Director's messages join the ONE canonical cross-surface thread; any
  // other authorized chat (Boris) gets its own persisted thread.
  const threadFor = (chatId) => (isDirector(chatId) ? 'director' : `tg-${chatId}`)

  // ── Telegram API helpers ───────────────────────────────────────────────────
  async function tgCall(method, body) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 20000)
    try {
      const r = await fetch(`${API}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
      const data = await r.json()
      if (!data.ok) console.error(`[Telegram] ${method} failed:`, data.description)
      return data
    } catch (e) {
      console.error(`[Telegram] ${method} error:`, e.name, e.message)
      return { ok: false, error: e.message }
    } finally {
      clearTimeout(timer)
    }
  }

  async function sendText(chatId, text) {
    if (!chatId || !text) return
    // Telegram hard limit is 4096 chars/message — chunk long output.
    const chunks = []
    let t = String(text)
    while (t.length > 0) { chunks.push(t.slice(0, 3900)); t = t.slice(3900) }
    for (const chunk of chunks) {
      await tgCall('sendMessage', { chat_id: chatId, text: chunk, disable_web_page_preview: true })
    }
  }

  async function sendChatAction(chatId, action = 'typing') {
    await tgCall('sendChatAction', { chat_id: chatId, action })
  }

  // Send an Umbruh voice reply (best effort). Telegram voice notes must be OGG/Opus;
  // we convert the Piper WAV with ffmpeg if available, else fall back to text only.
  async function sendVoice(chatId, text) {
    if (!allowVoiceReplies || !chatId || !text?.trim()) return false
    try {
      const b64 = await generateTTS(text.slice(0, 600))
      if (!b64) return false
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const wavPath = `/tmp/tg-voice-${id}.wav`
      const oggPath = `/tmp/tg-voice-${id}.ogg`
      fs.writeFileSync(wavPath, Buffer.from(b64, 'base64'))
      let ok = false
      try {
        execSync(`ffmpeg -y -i '${wavPath}' -c:a libopus -b:a 32k '${oggPath}'`, { stdio: 'ignore', timeout: 20000 })
        ok = fs.existsSync(oggPath)
      } catch { ok = false }
      if (!ok) { cleanup([wavPath, oggPath]); return false }

      // multipart/form-data upload via global FormData/Blob (Node 18+)
      const form = new FormData()
      form.append('chat_id', String(chatId))
      form.append('voice', new Blob([fs.readFileSync(oggPath)], { type: 'audio/ogg' }), 'reply.ogg')
      const r = await fetch(`${API}/sendVoice`, { method: 'POST', body: form })
      const data = await r.json()
      cleanup([wavPath, oggPath])
      return !!data.ok
    } catch (e) {
      console.error('[Telegram] sendVoice error:', e.message)
      return false
    }
  }

  function cleanup(paths) { for (const p of paths) { try { fs.unlinkSync(p) } catch {} } }

  // Upload a local file (PDF, etc.) as a Telegram document. Used for anything
  // referenced by filename in a status push — phones can't open a bare .md
  // path, so callers convert to PDF first and hand us the rendered file.
  async function sendDocument(chatId, filePath, filename) {
    if (!chatId || !filePath || !fs.existsSync(filePath)) return false
    try {
      const form = new FormData()
      form.append('chat_id', String(chatId))
      form.append('document', new Blob([fs.readFileSync(filePath)], { type: 'application/pdf' }), filename || path.basename(filePath))
      const r = await fetch(`${API}/sendDocument`, { method: 'POST', body: form })
      const data = await r.json()
      if (!data.ok) console.error('[Telegram] sendDocument failed:', data.description)
      return !!data.ok
    } catch (e) {
      console.error('[Telegram] sendDocument error:', e.message)
      return false
    }
  }

  // ── Outbound notify with Director/Boris curation ────────────────────────────
  // audience: 'director' (default, you only) | 'all' (you + Boris)
  // tag: optional string; if present and in borisTags, Boris also receives it
  //      even when audience is 'director'.
  // Every notify is also recorded in the brain's event log so the mini Nexus
  // status feed can show the same stream the phone receives.
  async function notify(text, { audience = 'director', tag = '' } = {}) {
    if (!text) return
    brain?.appendEvent({ kind: 'notify', text: String(text), audience, tag })
    const targets = new Set()
    if (directorChatId) targets.add(directorChatId) // Director always gets everything
    const tagAllowed = tag && borisTags.includes(String(tag).toLowerCase())
    if ((audience === 'all' || audience === 'boris' || tagAllowed) && borisChatId) targets.add(borisChatId)
    for (const id of targets) await sendText(id, text)
  }

  // Same audience curation as notify(), but for a file (e.g. a rendered PDF).
  async function notifyDocument(filePath, { audience = 'director', tag = '', filename = '' } = {}) {
    if (!filePath) return
    const targets = new Set()
    if (directorChatId) targets.add(directorChatId)
    const tagAllowed = tag && borisTags.includes(String(tag).toLowerCase())
    if ((audience === 'all' || audience === 'boris' || tagAllowed) && borisChatId) targets.add(borisChatId)
    for (const id of targets) await sendDocument(id, filePath, filename)
  }

  // ── Voice transcription (whisper.cpp preferred, then openai-whisper) ─────────
  async function transcribe(srcPath) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const wavPath = `/tmp/tg-stt-${id}.wav`
    const env = { ...process.env, PATH: '/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:/usr/sbin' }
    try {
      // Telegram voice notes are OGG/Opus → decode to 16kHz mono WAV for whisper.
      execSync(`ffmpeg -y -i '${srcPath}' -ar 16000 -ac 1 '${wavPath}'`, { stdio: 'ignore', timeout: 30000, env })
    } catch (e) {
      console.error('[Telegram] ffmpeg decode failed:', e.message)
      return null
    }

    // 1) whisper.cpp (set WHISPER_CPP_BIN + WHISPER_CPP_MODEL in .env)
    const cppBin = process.env.WHISPER_CPP_BIN
    const cppModel = process.env.WHISPER_CPP_MODEL
    if (cppBin && cppModel && fs.existsSync(cppBin) && fs.existsSync(cppModel)) {
      try {
        const outBase = `/tmp/tg-stt-${id}`
        execSync(`'${cppBin}' -m '${cppModel}' -f '${wavPath}' -nt -otxt -of '${outBase}'`, { stdio: 'ignore', timeout: 120000, env })
        const txt = readFileSafe(`${outBase}.txt`)
        cleanup([wavPath, `${outBase}.txt`])
        if (txt) return txt.trim()
      } catch (e) {
        console.error('[Telegram] whisper.cpp failed:', e.message)
      }
    }

    // 2) openai-whisper CLI (pip install openai-whisper)
    try {
      const model = process.env.WHISPER_MODEL || 'base.en'
      const outDir = `/tmp/tg-stt-out-${id}`
      fs.mkdirSync(outDir, { recursive: true })
      execSync(`whisper '${wavPath}' --model ${model} --language en --output_format txt --output_dir '${outDir}' --fp16 False`, { stdio: 'ignore', timeout: 180000, env })
      const files = fs.readdirSync(outDir).filter(f => f.endsWith('.txt'))
      let txt = files.length ? readFileSafe(path.join(outDir, files[0])) : ''
      cleanup([wavPath])
      try { fs.rmSync(outDir, { recursive: true, force: true }) } catch {}
      if (txt) return txt.trim()
    } catch (e) {
      console.error('[Telegram] openai-whisper failed:', e.message)
    }

    cleanup([wavPath])
    return null
  }

  // (System-prompt assembly moved to brain.mjs — shared by every transport.)

  // ── Run a user message through the shared tiered brain ──────────────────────
  // Routing (deep/claude prefix, triage, NEEDS_DIRECTOR, local failure → Claude
  // escalation), history, and the runaway guard all live in brain.mjs now.
  // This adapter only maps chat → thread and delivers produced files to the
  // requesting chat via sendDocument.
  async function runTask(chatId, userText) {
    const { reply, via } = await brain.runTask(threadFor(chatId), userText, {
      channel: 'telegram',
      deliverFiles: async (files) => {
        for (const f of files) {
          try { await sendDocument(chatId, f, path.basename(f)) }
          catch (e) { console.error('[Telegram] sendDocument failed:', e.message) }
        }
      },
    })
    return via === 'local' ? reply : `🧠 ${reply}`
  }

  // ── Inbound update handling ──────────────────────────────────────────────────
  async function handleUpdate(u) {
    const msg = u.message || u.edited_message
    if (!msg) return
    const chatId = msg.chat?.id
    const text = (msg.text || '').trim()

    // /whoami and /start work for ANYONE so people can discover their chat ID
    // during setup. Everything else is restricted to known chats.
    if (text === '/start' || text === '/whoami' || text.startsWith('/whoami')) {
      await sendText(chatId,
        `Goose / SFS bot online.\nYour chat ID is: ${chatId}\n` +
        (isKnown(chatId)
          ? `You are authorized.`
          : `You are not yet authorized. Send this ID to the Director to be added (directorChatId or borisChatId in goose.config.json).`))
      return
    }

    if (!isKnown(chatId)) {
      await sendText(chatId, `Not authorized. Send /whoami and give your chat ID to the Director.`)
      return
    }

    if (text === '/help') {
      await sendText(chatId,
        `Send a message or a voice note to give Umbruh a task on the Mac.\n\n` +
        `/status — latest loop / Director status\n` +
        `/forks — open Signal fleet forks awaiting the Director\n` +
        `/brief — build today's Signal Brief on demand\n` +
        `/whoami — show your chat ID\n` +
        `/reset — clear this chat's short-term memory`)
      return
    }

    // Signal fleet commands (Director only — fork packets are Director-facing).
    if (text === '/forks' || text === '/brief') {
      if (!isDirector(chatId)) { await sendText(chatId, 'Director-only command.'); return }
      if (!signal) { await sendText(chatId, 'Signal delivery module is not wired in this build.'); return }
      if (text === '/forks') {
        await sendText(chatId, signal.forksSummary())
      } else {
        await sendText(chatId, signal.buildBrief())
        if (signal.sendBriefAttachments) await signal.sendBriefAttachments()
      }
      return
    }

    if (text === '/reset') {
      brain.resetThread(threadFor(chatId))
      await sendText(chatId, 'Short-term memory cleared.')
      return
    }

    if (text === '/status') {
      await sendText(chatId, latestStatus() || 'No status log found yet.')
      return
    }

    // Voice note → transcribe → task
    const voice = msg.voice || msg.audio
    if (voice?.file_id) {
      await sendChatAction(chatId, 'record_voice')
      const transcript = await downloadAndTranscribe(voice.file_id)
      if (!transcript) {
        await sendText(chatId, `Couldn't transcribe that. Make sure whisper + ffmpeg are installed (run install-telegram.command). You can also just type the task.`)
        return
      }
      await sendText(chatId, `🎙 "${transcript}"`)
      await sendChatAction(chatId, 'typing')
      const reply = await runTask(chatId, transcript)
      await sendText(chatId, reply)
      sendVoice(chatId, reply) // best-effort spoken reply
      return
    }

    // Plain text → task
    if (text) {
      await sendChatAction(chatId, 'typing')
      const reply = await runTask(chatId, text)
      await sendText(chatId, reply)
      return
    }
  }

  async function downloadAndTranscribe(fileId) {
    try {
      const info = await tgCall('getFile', { file_id: fileId })
      const filePath = info?.result?.file_path
      if (!filePath) return null
      const r = await fetch(`${FILE_API}/${filePath}`)
      const buf = Buffer.from(await r.arrayBuffer())
      const ext = path.extname(filePath) || '.oga'
      const tmp = `/tmp/tg-in-${Date.now()}${ext}`
      fs.writeFileSync(tmp, buf)
      const txt = await transcribe(tmp)
      cleanup([tmp])
      return txt
    } catch (e) {
      console.error('[Telegram] downloadAndTranscribe error:', e.message)
      return null
    }
  }

  // ── Long-polling loop ────────────────────────────────────────────────────────
  let offset = 0
  let running = true
  async function poll() {
    while (running) {
      // Abort the long-poll if it overruns its window by 10s. Without this, a
      // socket left half-open by a Mac sleep/wake would hang the loop forever
      // and the bot would silently stop responding (the original failure).
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), (pollTimeout + 10) * 1000)
      try {
        const r = await fetch(`${API}/getUpdates?timeout=${pollTimeout}&offset=${offset}`, { method: 'GET', signal: ctrl.signal })
        const data = await r.json()
        if (data.ok && Array.isArray(data.result)) {
          for (const u of data.result) {
            offset = u.update_id + 1
            handleUpdate(u).catch(e => console.error('[Telegram] handleUpdate:', e?.stack || e?.message || e))
          }
        }
      } catch (e) {
        // Aborted long-poll, network blip, or Mac wake — log and retry shortly.
        console.error('[Telegram] poll error:', e.name, e.message)
        await new Promise(res => setTimeout(res, 3000))
      } finally {
        clearTimeout(timer)
      }
    }
  }

  // ── /api/notify endpoint (script & cascade-driven posts) ─────────────────────
  // POST { text, audience?, tag? } with header x-notify-secret: <NOTIFY_SECRET>
  app.post('/api/notify', async (req, res) => {
    if (notifySecret && req.get('x-notify-secret') !== notifySecret) {
      return res.status(401).json({ error: 'bad notify secret' })
    }
    const { text, audience, tag } = req.body || {}
    if (!text) return res.status(400).json({ error: 'text required' })
    await notify(String(text), { audience, tag })
    res.json({ ok: true })
  })

  // ── Status log helpers + file watcher (automatic loop status posts) ──────────
  const statusFile = config.statusLayerFile
    ? path.join(REPO, config.statusLayerFile)
    : path.join(REPO, 'DIRECTOR_STATUS.md')

  // Default watch targets: the incubation loop log + Director status, plus any
  // extra absolute/relative paths the Director adds in config.telegram.watchPaths.
  const defaultWatch = [
    statusFile,
    path.join(REPO, '../The Incubation Chamber/_governance/LOOP_LOG.md'),
  ]
  const extraWatch = (tg.watchPaths || []).map(p =>
    path.isAbsolute(p) ? p : path.join(REPO, p))
  const watchTargets = [...new Set([...defaultWatch, ...extraWatch])].filter(fs.existsSync)

  function latestStatus() {
    for (const f of watchTargets) {
      const txt = readFileSafe(f)
      if (txt) {
        const built = lastLineMatching(txt, /^- \*\*Built:\*\*/m)
        const next = lastLineMatching(txt, /^- \*\*Next run target:\*\*/m)
        if (built || next) return [built, next].filter(Boolean).join('\n')
        return txt.split('\n').slice(0, 12).join('\n')
      }
    }
    return ''
  }

  function lastLineMatching(text, re) {
    const lines = text.split('\n').filter(l => re.test(l))
    return lines.length ? lines[lines.length - 1].trim() : ''
  }

  // Track last-posted "Built" line per file so we only post genuinely new events.
  const lastBuilt = new Map()
  function primeWatch() {
    for (const f of watchTargets) {
      lastBuilt.set(f, lastLineMatching(readFileSafe(f) || '', /^- \*\*Built:\*\*/m))
    }
  }

  function onLogChange(file) {
    const txt = readFileSafe(file) || ''
    const built = lastLineMatching(txt, /^- \*\*Built:\*\*/m)
    if (built && built !== lastBuilt.get(file)) {
      lastBuilt.set(file, built)
      const next = lastLineMatching(txt, /^- \*\*Next run target:\*\*/m)
      const label = path.basename(file, '.md')
      // Director gets the full event; Boris gets the milestone (audience 'all').
      notify(`🔁 ${label}\n${built}${next ? '\n' + next : ''}`, { audience: 'all', tag: 'milestone' })
    }
  }

  function startWatchers() {
    primeWatch()
    for (const f of watchTargets) {
      try {
        let timer = null
        fs.watch(f, () => {
          clearTimeout(timer)
          timer = setTimeout(() => onLogChange(f), 1500) // debounce editor writes
        })
        console.log('[Telegram] watching', f)
      } catch (e) {
        console.error('[Telegram] watch failed for', f, e.message)
      }
    }
  }

  // ── Boot ─────────────────────────────────────────────────────────────────────
  tgCall('getMe').then(me => {
    if (me?.ok) {
      console.log(`[Telegram] bot online as @${me.result.username}`)
      // Boot notification — also proves outbound sendMessage works in this
      // process (the packaged Electron app, where the original failure occurred).
      notify('🤖 Goose / SFS bot is online (server started).', { audience: 'director' }).catch(() => {})
    } else {
      console.error('[Telegram] getMe failed — check TELEGRAM_BOT_TOKEN')
    }
  })
  startWatchers()
  poll()

  // Expose notify for any in-process callers (e.g. future server hooks).
  return { notify, notifyDocument }
}
