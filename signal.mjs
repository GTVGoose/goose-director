// ─────────────────────────────────────────────────────────────────────────────
// signal.mjs — Signal fleet delivery wiring for the Nexus server (PERSONAL, C lineage)
//
// Implements the Director-ratified fork-delivery protocol from
// goose-agent-system/agents/operational/AGT-SIG-001_SignalFleet_VaultGrade_v3.md §4:
//
//   1. FORK WATCHER — watches campaigns/*/forks/*.md in the goose-agent-system
//      repo. Open forks with urgency `urgent` (or a deadline <72h, which
//      auto-escalates per charter) are pushed to the Director's Telegram
//      immediately, once per file revision. Routine forks wait for the brief.
//   2. SIGNAL BRIEF — a daily digest (forks awaiting the Director, next-72h
//      clock items, campaign status, fleet activity, dataset state) sent to
//      Telegram at config.signal.briefHour and archived into the campaign's
//      logs/briefs/. Also buildable on demand (/api/signal/brief, /brief).
//   3. PANEL API — /api/signal/* endpoints for the Signal Desk view.
//
// Fork packet contract (one file per fork, YAML-ish frontmatter):
//   campaigns/<CAM>/forks/FORK-<...>.md
//   ---
//   fork_id: FORK-CAM001-001
//   campaign: CAM-001
//   urgency: routine | urgent
//   status: open | resolved
//   deadline: 2026-07-10
//   default: <what happens if unanswered>
//   ---
//   # <title>
//   ## Situation / ## Options / ## Recommendation / ## Resolution
//
// No new npm deps. Telegram sends go through telegram.mjs's notify()
// (injected via setNotify after both modules boot).
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs'
import path from 'path'
import os from 'os'

export function initSignal({ app, config, REPO, readFileSafe }) {
  const cfg = config.signal || {}
  const campaignsRoot = path.isAbsolute(cfg.campaignsDir || '')
    ? cfg.campaignsDir
    : path.join(REPO, cfg.campaignsDir || 'campaigns')
  const briefHour = String(cfg.briefHour || '08:30') // local time HH:MM
  const URGENT_WINDOW_MS = 72 * 3600 * 1000 // deadline inside this ⇒ auto-urgent (charter §4)

  let notify = null // injected by server.mjs after initTelegram
  const setNotify = (fn) => { notify = fn }

  // ── Persistent state (dedupe pushes + one brief per day, across restarts) ──
  const stateDir = path.join(os.homedir(), 'Library/Application Support/Nexus')
  const statePath = path.join(stateDir, 'signal-state.json')
  let state = { notifiedForks: {}, lastBriefDate: '' }
  try { state = { ...state, ...JSON.parse(fs.readFileSync(statePath, 'utf8')) } } catch {}
  function saveState() {
    try {
      fs.mkdirSync(stateDir, { recursive: true })
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2))
    } catch (e) { console.error('[Signal] state save failed:', e.message) }
  }

  // ── Fork packet parsing ─────────────────────────────────────────────────────
  function parseFork(file) {
    const raw = readFileSafe(file)
    if (!raw) return null
    const fm = {}
    let body = raw
    const m = raw.match(/^---\n([\s\S]*?)\n---\n?/)
    if (m) {
      body = raw.slice(m[0].length)
      for (const line of m[1].split('\n')) {
        const kv = line.match(/^(\w[\w-]*):\s*(.*)$/)
        if (kv) fm[kv[1].trim()] = kv[2].trim()
      }
    }
    const title = (body.match(/^#\s+(.+)$/m) || [])[1] || path.basename(file, '.md')
    const deadlineMs = fm.deadline ? Date.parse(fm.deadline) : NaN
    const declared = (fm.urgency || 'routine').toLowerCase()
    const escalated = Number.isFinite(deadlineMs) && (deadlineMs - Date.now()) < URGENT_WINDOW_MS
    let mtime = 0
    try { mtime = fs.statSync(file).mtimeMs } catch {}
    return {
      file,
      relFile: path.relative(REPO, file),
      fork_id: fm.fork_id || path.basename(file, '.md'),
      campaign: fm.campaign || path.basename(path.dirname(path.dirname(file))),
      urgency: declared,
      effectiveUrgency: declared === 'urgent' || escalated ? 'urgent' : 'routine',
      status: (fm.status || 'open').toLowerCase(),
      deadline: fm.deadline || '',
      default: fm.default || '',
      title,
      body,
      mtime,
    }
  }

  function listForks() {
    const forks = []
    let campaigns = []
    try { campaigns = fs.readdirSync(campaignsRoot).filter(d => !d.startsWith('.')) } catch { return forks }
    for (const cam of campaigns) {
      const dir = path.join(campaignsRoot, cam, 'forks')
      if (!fs.existsSync(dir)) continue
      for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.md') && !/^readme/i.test(f))) {
        const fork = parseFork(path.join(dir, f))
        if (fork) forks.push(fork)
      }
    }
    // urgent first, then nearest deadline
    return forks.sort((a, b) =>
      (a.effectiveUrgency === b.effectiveUrgency ? 0 : a.effectiveUrgency === 'urgent' ? -1 : 1)
      || String(a.deadline || '9999').localeCompare(String(b.deadline || '9999')))
  }

  // ── Urgent push (one per fork revision; routine forks ride the brief) ──────
  function forkPushText(fork) {
    const camDir = path.basename(path.dirname(path.dirname(fork.file)))
    return [
      `🔱 SIGNAL FORK — URGENT`,
      `${fork.fork_id} · ${fork.campaign}`,
      fork.title,
      fork.deadline ? `Deadline: ${fork.deadline}${fork.default ? ` (default if unanswered: ${fork.default})` : ''}` : (fork.default ? `Default if unanswered: ${fork.default}` : ''),
      `Full packet: Nexus → Signal Desk, or campaigns/${camDir}/forks/${path.basename(fork.file)}`,
    ].filter(Boolean).join('\n')
  }

  function checkForks() {
    for (const fork of listForks()) {
      if (fork.status !== 'open' || fork.effectiveUrgency !== 'urgent') continue
      const key = fork.fork_id
      if (state.notifiedForks[key] === fork.mtime) continue
      state.notifiedForks[key] = fork.mtime
      saveState()
      if (notify) {
        notify(forkPushText(fork), { audience: 'director' })
          .catch(e => console.error('[Signal] fork push failed:', e.message))
        console.log('[Signal] urgent fork pushed:', key)
      } else {
        console.log('[Signal] urgent fork found (Telegram not wired):', key)
      }
    }
  }

  // ── Clock items (campaigns/<CAM>/clock.md table rows: | YYYY-MM-DD | item | owner |)
  function clockItems(camDir, horizonDays = 3) {
    const file = path.join(campaignsRoot, camDir, 'clock.md')
    const txt = readFileSafe(file)
    if (!txt) return []
    const items = []
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const horizon = today.getTime() + horizonDays * 86400000
    for (const line of txt.split('\n')) {
      const m = line.match(/^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*([^|]+)\|\s*([^|]*)\|/)
      if (!m) continue
      const t = Date.parse(m[1])
      if (!Number.isFinite(t)) continue
      if (t >= today.getTime() && t <= horizon) {
        items.push({ date: m[1], item: m[2].trim(), owner: m[3].trim() })
      } else if (t < today.getTime()) {
        items.push({ date: m[1], item: `⚠️ OVERDUE: ${m[2].trim()}`, owner: m[3].trim() })
      }
    }
    return items
  }

  function tailJsonl(file, n) {
    const txt = readFileSafe(file)
    if (!txt) return []
    return txt.trim().split('\n').slice(-n).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  }

  // ── The Signal Brief ────────────────────────────────────────────────────────
  function buildBrief() {
    const today = new Date().toISOString().slice(0, 10)
    let campaigns = []
    try {
      campaigns = fs.readdirSync(campaignsRoot).filter(d =>
        !d.startsWith('.') && fs.statSync(path.join(campaignsRoot, d)).isDirectory())
    } catch {}
    if (!campaigns.length) return `📡 SIGNAL BRIEF — ${today}\nNo active campaigns found under ${campaignsRoot}.`

    const forks = listForks().filter(f => f.status === 'open')
    const lines = [`📡 SIGNAL BRIEF — ${today}`]

    lines.push('', forks.length ? `FORKS AWAITING YOU (${forks.length}):` : 'FORKS AWAITING YOU: none — the fleet has no decisions pending on you.')
    for (const f of forks) {
      lines.push(`  ${f.effectiveUrgency === 'urgent' ? '🔱' : '•'} ${f.fork_id} — ${f.title}${f.deadline ? ` (by ${f.deadline})` : ''}`)
    }

    for (const cam of campaigns) {
      lines.push('', `── ${cam} ──`)
      const clock = clockItems(cam)
      lines.push(clock.length ? 'CLOCK — next 72h:' : 'CLOCK — next 72h: quiet.')
      for (const c of clock) lines.push(`  • ${c.date} — ${c.item}${c.owner ? ` [${c.owner}]` : ''}`)

      const acts = tailJsonl(path.join(campaignsRoot, cam, 'logs', 'activity.jsonl'), 8)
        .filter(a => a.ts && (Date.now() - Date.parse(a.ts)) < 26 * 3600 * 1000)
      lines.push(acts.length ? 'FLEET ACTIVITY (24h):' : 'FLEET ACTIVITY (24h): none logged.')
      for (const a of acts) lines.push(`  • ${a.agent || '?'} — ${a.action || a.summary || JSON.stringify(a).slice(0, 80)}`)

      const dataDir = path.join(campaignsRoot, cam, 'dataset')
      let dataNote = 'dataset not yet instantiated.'
      try {
        const files = fs.readdirSync(dataDir).filter(f => /\.(jsonl|csv|sqlite|db)$/.test(f))
        if (files.length) dataNote = `${files.length} dataset file(s) present.`
      } catch {}
      lines.push(`DATA: ${dataNote}`)
    }

    lines.push('', 'Full packets + resolution: Nexus → Signal Desk. Reply here to task Umbruh.')
    return lines.join('\n')
  }

  function archiveBrief(text) {
    const today = new Date().toISOString().slice(0, 10)
    let campaigns = []
    try { campaigns = fs.readdirSync(campaignsRoot).filter(d => !d.startsWith('.')) } catch {}
    for (const cam of campaigns) {
      try {
        const dir = path.join(campaignsRoot, cam, 'logs', 'briefs')
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, `${today}.md`), `# Signal Brief — ${today}\n\n\`\`\`\n${text}\n\`\`\`\n`)
      } catch (e) { console.error('[Signal] brief archive failed:', e.message) }
    }
  }

  function sendDailyBriefIfDue() {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    if (state.lastBriefDate === today) return
    const [h, m] = briefHour.split(':').map(Number)
    if (now.getHours() < h || (now.getHours() === h && now.getMinutes() < (m || 0))) return
    if (!fs.existsSync(campaignsRoot)) return
    state.lastBriefDate = today
    saveState()
    const text = buildBrief()
    archiveBrief(text)
    if (notify) {
      notify(text, { audience: 'director' }).catch(e => console.error('[Signal] brief send failed:', e.message))
      console.log('[Signal] daily brief sent for', today)
    } else {
      console.log('[Signal] daily brief built (Telegram not wired) for', today)
    }
  }

  // ── Fork resolution (panel-driven) ──────────────────────────────────────────
  function resolveFork(forkId, decision) {
    const fork = listForks().find(f => f.fork_id === forkId)
    if (!fork) return { error: `fork ${forkId} not found` }
    if (fork.status === 'resolved') return { error: `fork ${forkId} already resolved` }
    let raw = readFileSafe(fork.file) || ''
    raw = raw.replace(/^status:\s*open\s*$/m, 'status: resolved')
    raw += `\n## Resolution\n- ${new Date().toISOString().slice(0, 10)} · Director (via Signal Desk): ${decision}\n`
    try { fs.writeFileSync(fork.file, raw) } catch (e) { return { error: e.message } }
    console.log('[Signal] fork resolved:', forkId)
    return { ok: true }
  }

  // ── Compact phone summary for the /forks Telegram command ──────────────────
  function forksSummary() {
    const open = listForks().filter(f => f.status === 'open')
    if (!open.length) return 'No open forks — nothing is waiting on you.'
    return open.map(f =>
      `${f.effectiveUrgency === 'urgent' ? '🔱' : '•'} ${f.fork_id} — ${f.title}${f.deadline ? ` (by ${f.deadline})` : ''}`).join('\n')
  }

  // ── Panel API ───────────────────────────────────────────────────────────────
  app.get('/api/signal/forks', (_req, res) => res.json({ forks: listForks() }))
  app.get('/api/signal/brief', (_req, res) => res.json({ text: buildBrief() }))
  app.post('/api/signal/resolve', (req, res) => {
    const { fork_id, decision } = req.body || {}
    if (!fork_id || !decision) return res.status(400).json({ error: 'fork_id and decision required' })
    const r = resolveFork(String(fork_id), String(decision))
    return r.error ? res.status(400).json(r) : res.json(r)
  })

  // ── Watchers + schedulers ───────────────────────────────────────────────────
  const watched = new Set()
  function watchForkDirs() {
    let campaigns = []
    try { campaigns = fs.readdirSync(campaignsRoot).filter(d => !d.startsWith('.')) } catch { return }
    for (const cam of campaigns) {
      const dir = path.join(campaignsRoot, cam, 'forks')
      if (!fs.existsSync(dir) || watched.has(dir)) continue
      try {
        let timer = null
        fs.watch(dir, () => { clearTimeout(timer); timer = setTimeout(checkForks, 1500) })
        watched.add(dir)
        console.log('[Signal] watching forks:', dir)
      } catch (e) { console.error('[Signal] watch failed for', dir, e.message) }
    }
  }

  watchForkDirs()
  checkForks()
  // Rescan: discovers new campaigns/fork dirs, catches missed fs events, fires
  // deadline auto-escalations, and delivers the daily brief when its hour passes.
  setInterval(() => { watchForkDirs(); checkForks(); sendDailyBriefIfDue() }, 60 * 1000)
  sendDailyBriefIfDue()

  console.log(`[Signal] fleet delivery wired — campaigns at ${campaignsRoot}, brief at ${briefHour}`)
  return { setNotify, listForks, buildBrief, forksSummary, resolveFork }
}
