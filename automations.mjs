// ─── Automations — scheduled prompts that run themselves ─────────────────────
// Shared-core module (both Nexus lineages). An automation is a named prompt on
// a cadence (every N minutes / hours, or daily at HH:MM). When due, it runs as
// a plain TOOL-LESS model call through the configured brain and stores the
// result — a standing rhythm of work (morning brief, daily digest, watchlist
// check) without a human pressing the button. No tools, no sandbox: an
// unattended run must not be able to execute anything; producing text is the
// entire capability surface. Store lives in userData (automations.json).
import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MAX_RUNS_KEPT = 20
const TICK_MS = 30_000

export function initAutomations({ app, config, callModel, resolveBrain }) {
  const DATA_DIR = process.env.NEXUS_USER_DATA || __dirname
  const FILE = path.join(DATA_DIR, 'automations.json')

  const load = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return { automations: [] } } }
  const save = (db) => { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db, null, 2)) }

  // schedule: { kind: 'interval', everyMinutes } | { kind: 'daily', at: 'HH:MM' }
  function normalizeSchedule(s) {
    if (!s || typeof s !== 'object') return null
    if (s.kind === 'interval') {
      const m = Math.max(5, Math.min(7 * 24 * 60, Number(s.everyMinutes) || 0))
      return Number(s.everyMinutes) ? { kind: 'interval', everyMinutes: m } : null
    }
    if (s.kind === 'daily' && /^\d{2}:\d{2}$/.test(String(s.at || ''))) return { kind: 'daily', at: s.at }
    return null
  }

  function isDue(a, now) {
    if (!a.enabled || !a.schedule) return false
    const last = a.lastRun ? Date.parse(a.lastRun) : 0
    if (a.schedule.kind === 'interval') return now - last >= a.schedule.everyMinutes * 60_000
    // daily: fire once per calendar day at/after HH:MM local
    const d = new Date(now)
    const [hh, mm] = a.schedule.at.split(':').map(Number)
    const todayAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm).getTime()
    return now >= todayAt && last < todayAt
  }

  async function runAutomation(a) {
    const startedAt = new Date().toISOString()
    let entry
    try {
      const mc = a.modelId
        ? (config.models || []).find(m => m.id === a.modelId) || await resolveBrain()
        : await resolveBrain()
      if (!mc) throw new Error('No model available')
      const text = await callModel(mc,
        `You are running "${a.name}", a scheduled automation the owner set up in their Nexus console. Do exactly what the prompt asks and return the result as clean markdown. You have no tools — produce text only. Current date/time: ${new Date().toString()}`,
        [{ role: 'user', content: a.prompt }])
      entry = { t: startedAt, ok: true, model: `${mc.provider}/${mc.model}`, text: String(text).slice(0, 40_000) }
    } catch (e) {
      entry = { t: startedAt, ok: false, error: e.message }
    }
    const db = load()
    const cur = db.automations.find(x => x.id === a.id)
    if (cur) {
      cur.lastRun = startedAt
      cur.runs = [entry, ...(cur.runs || [])].slice(0, MAX_RUNS_KEPT)
      cur.unread = true
      save(db)
    }
    return entry
  }

  // Scheduler tick — sequential, one due automation at a time (local models are
  // RAM-bound; cloud calls are metered anyway). A run marks lastRun BEFORE the
  // model call so a slow run can't double-fire on the next tick.
  let ticking = false
  setInterval(async () => {
    if (ticking) return
    ticking = true
    try {
      const now = Date.now()
      const db = load()
      for (const a of db.automations) {
        if (!isDue(a, now)) continue
        a.lastRun = new Date(now).toISOString()
        save(db)
        await runAutomation(a)
      }
    } catch (e) {
      console.error('[Automations] tick failed:', e.message)
    } finally {
      ticking = false
    }
  }, TICK_MS).unref?.()

  // ─── routes ─────────────────────────────────────────────────────────────────
  app.get('/api/automations', (req, res) => {
    res.json(load().automations.map(a => ({ ...a, runs: (a.runs || []).slice(0, 5) })))
  })

  app.post('/api/automations', express.json(), (req, res) => {
    const { name, prompt, schedule, modelId, enabled } = req.body || {}
    const sched = normalizeSchedule(schedule)
    if (!name || !prompt || !sched) return res.status(400).json({ error: 'name, prompt, and a valid schedule are required' })
    const db = load()
    const a = {
      id: `auto_${Date.now()}`,
      name: String(name).slice(0, 80),
      prompt: String(prompt).slice(0, 8000),
      schedule: sched,
      modelId: modelId ? String(modelId) : null,
      enabled: enabled !== false,
      createdAt: new Date().toISOString(),
      lastRun: null,
      runs: [],
    }
    db.automations.unshift(a)
    save(db)
    res.json({ ok: true, automation: a })
  })

  app.patch('/api/automations/:id', express.json(), (req, res) => {
    const db = load()
    const a = db.automations.find(x => x.id === req.params.id)
    if (!a) return res.status(404).json({ error: 'not found' })
    const { name, prompt, schedule, modelId, enabled, markRead } = req.body || {}
    if (name !== undefined) a.name = String(name).slice(0, 80)
    if (prompt !== undefined) a.prompt = String(prompt).slice(0, 8000)
    if (schedule !== undefined) {
      const sched = normalizeSchedule(schedule)
      if (!sched) return res.status(400).json({ error: 'invalid schedule' })
      a.schedule = sched
    }
    if (modelId !== undefined) a.modelId = modelId ? String(modelId) : null
    if (enabled !== undefined) a.enabled = !!enabled
    if (markRead) a.unread = false
    save(db)
    res.json({ ok: true, automation: a })
  })

  // Run now — manual trigger, same tool-less path as the scheduler.
  app.post('/api/automations/:id/run', async (req, res) => {
    const a = load().automations.find(x => x.id === req.params.id)
    if (!a) return res.status(404).json({ error: 'not found' })
    const entry = await runAutomation(a)
    res.json({ ok: entry.ok !== false, run: entry })
  })

  app.get('/api/automations/:id/runs', (req, res) => {
    const a = load().automations.find(x => x.id === req.params.id)
    if (!a) return res.status(404).json({ error: 'not found' })
    res.json(a.runs || [])
  })

  app.delete('/api/automations/:id', (req, res) => {
    const db = load()
    const before = db.automations.length
    db.automations = db.automations.filter(x => x.id !== req.params.id)
    if (db.automations.length === before) return res.status(404).json({ error: 'not found' })
    save(db)
    res.json({ ok: true })
  })

  console.log('[Automations] store:', FILE)
}
