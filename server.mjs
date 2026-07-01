import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import os from 'os'
import yaml from 'js-yaml'
import { fileURLToPath } from 'url'
import { execFileSync, execSync } from 'child_process'
import { initTelegram } from './telegram.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Config file location — in packaged app it lives in Contents/Resources/
// (set by main.cjs via NEXUS_RESOURCES). Fall back to local dir for dev.
const configCandidates = [
  process.env.NEXUS_RESOURCES && path.join(process.env.NEXUS_RESOURCES, 'goose.config.json'),
  path.join(__dirname, 'goose.config.json'),
  path.join(__dirname, '..', 'goose.config.json'),
].filter(Boolean)
const configPath = configCandidates.find(p => fs.existsSync(p))
if (!configPath) throw new Error(`goose.config.json not found. Searched:\n  ${configCandidates.join('\n  ')}`)
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const REPO = config.repoPath

// Load .env — try multiple locations in order of priority
try {
  const envCandidates = [
    process.env.NEXUS_USER_DATA && path.join(process.env.NEXUS_USER_DATA, '.env'),
    path.join(os.homedir(), 'Library', 'Application Support', 'Nexus', '.env'),
    path.join(__dirname, '.env'),
    path.join(__dirname, '..', '.env'),
  ].filter(Boolean)
  // Load ALL candidate .env files (do NOT stop at the first). Later files
  // override earlier ones, so keys missing from one location (e.g. the app's
  // own userData/.env) get filled in from another (e.g. the installer's
  // ~/Library/Application Support/Nexus/.env). This prevents the bot from
  // silently disabling itself when the token lives in a different .env than
  // the one the packaged app's userData path points at.
  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      const envText = fs.readFileSync(envPath, 'utf8')
      for (const line of envText.split('\n')) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)/)
        if (m) process.env[m[1]] = m[2].trim()
      }
      console.log('[ENV] Loaded from', envPath)
    }
  }
} catch {}


const app = express()
app.use(cors())
app.use(express.json())

// ─── helpers ────────────────────────────────────────────────────────────────

function readFileSafe(filePath) {
  try { return fs.readFileSync(filePath, 'utf8') } catch { return null }
}

// Extract a header field from a markdown file
// Looks for lines like:  **Field:** Value  or  Field: Value
function extractMdField(text, fieldName) {
  const patterns = [
    new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+)`, 'i'),
    new RegExp(`^${fieldName}:\\s*(.+)`, 'im'),
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) return m[1].trim()
  }
  return null
}

// Parse the master registry markdown table(s) into agent rows. This is the
// authoritative fleet list — Nexus stays in sync with registry/agent-registry.md
// no matter where individual charter files physically live.
function parseRegistryAgents(text) {
  const rows = []
  let headers = null
  for (const raw of text.split('\n')) {
    const t = raw.trim()
    if (!t.startsWith('|')) { headers = null; continue }
    const cells = t.split('|').slice(1, -1).map(c => c.trim())
    if (cells.every(c => /^:?-+:?$/.test(c))) continue          // separator row
    if (cells[0] === 'agent_id') { headers = cells; continue }   // header row
    if (!headers) continue
    if (/^AGT-/.test(cells[0])) {
      const row = {}
      headers.forEach((h, i) => { row[h] = cells[i] || '' })
      rows.push(row)
    }
  }
  return rows
}

// Derive a Nexus "posture" bucket from a registry row's type/role.
function derivePosture(row) {
  const ty = (row.type || '').toLowerCase()
  const ro = (row.role || '').toLowerCase()
  if (ty.includes('archetype')) return 'Passive'
  if (ty.includes('(sub)')) return 'Passive'
  if (ro === 'rsi-coach' || ty.includes('(meta)') || ro === 'integrator') return 'Recursive'
  if (ty.includes('dual')) return 'Dual'
  return 'Active'   // reviewers, operational, companion, orchestrator
}

const cleanStatus = (s) => (s ? s.split(/[—(]/)[0].trim() : null)

// Walk agents/ (subdir AGENT.md files + flat AGT-*.md charters like
// _chamber-installed/) collecting canon status + sigil per agent id.
function collectCharterInfo(agentsDir) {
  const info = {}
  const add = (file) => {
    const text = readFileSafe(file)
    if (!text) return
    const bm = path.basename(file).match(/AGT-[A-Z]+-\d+/)
    const fm = text.match(/Agent ID:\s*(AGT-[A-Z]+-\d+)/i)
    const id = bm ? bm[0] : (fm ? fm[1] : null)
    if (!id) return
    info[id] = {
      canonStatus: cleanStatus(extractMdField(text, 'Canon Status') || extractMdField(text, 'Status')),
      sigil: extractMdField(text, 'Primary Sigil Alignment') || null,
      path: file,
    }
  }
  if (!fs.existsSync(agentsDir)) return info
  for (const d of fs.readdirSync(agentsDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    const sub = path.join(agentsDir, d.name)
    const af = path.join(sub, 'AGENT.md')
    if (fs.existsSync(af)) add(af)
    for (const f of fs.readdirSync(sub)) {
      if (f.endsWith('.md') && /AGT-/.test(f)) add(path.join(sub, f))
    }
  }
  return info
}

// ─── posture map (name-specific overrides; the registry drives the rest) ────
const POSTURE_MAP = {
  'Watcher':              { posture: 'Dual',      type: 'Dual' },
  'Void':                 { posture: 'Active',     type: 'Archetype' },
  'Dream':                { posture: 'Active',     type: 'Archetype' },
  'Truth':                { posture: 'Active',     type: 'Archetype' },
  'Reality':              { posture: 'Active',     type: 'Archetype' },
  'Angel':                { posture: 'Active',     type: 'Meta-Evaluator' },
  'Adversary':            { posture: 'Active',     type: 'Meta-Evaluator' },
  'Evolution Pair':       { posture: 'Recursive',  type: 'Meta-Evaluator' },
  'Continuity Keeper':    { posture: 'Passive',    type: 'Operational' },
  'Inception':            { posture: 'Recursive',  type: 'Operational' },
  'Steward':              { posture: 'Passive',    type: 'Operational' },
  'Choreographer':        { posture: 'Recursive',  type: 'Operational' },
  'Archivist-Orchestrator': { posture: 'Active',   type: 'Operational' },
  'Imagewright':          { posture: 'Active',     type: 'Operational' },
  'Lantern':              { posture: 'Active',     type: 'Operational' },
  'Signal':               { posture: 'Active',     type: 'Operational' },
}

// ─── routes ─────────────────────────────────────────────────────────────────

// GET /api/config — current config
app.get('/api/config', (req, res) => {
  res.json({ repoPath: REPO, exists: fs.existsSync(REPO) })
})

// GET /api/agents — full fleet from the registry (authoritative), enriched
// with canon status + sigil from charter files. Falls back to the legacy
// scan + static POSTURE_MAP only if the registry can't be read.
app.get('/api/agents', (req, res) => {
  const agentsDir = path.join(REPO, config.agentsDir)
  const registryPath = path.join(REPO, path.dirname(config.registryDir || 'registry/agents'), 'agent-registry.md')
  const registryText = readFileSafe(registryPath)
  const registryRows = registryText ? parseRegistryAgents(registryText) : []

  if (registryRows.length) {
    const charter = collectCharterInfo(agentsDir)
    const agents = registryRows.map(row => {
      const name = row.agent_name
      const info = charter[row.agent_id] || {}
      const override = POSTURE_MAP[name] || Object.entries(POSTURE_MAP).find(([k]) => name.includes(k))?.[1] || {}
      return {
        name,
        agentId: row.agent_id,
        posture: override.posture || derivePosture(row),
        type: row.type || override.type || 'Unknown',
        role: row.role || null,
        authority: row.authority || null,
        owner: row.owner || null,
        canonStatus: info.canonStatus || ((row.status || '').includes('active') ? 'Active' : 'Development'),
        sigil: info.sigil || 'N/A',
        status: row.status || null,
        source: 'registry',
        path: info.path || null,
      }
    })
    return res.json(agents)
  }

  // ── Legacy fallback: registry unreadable → scan agents/ + static map ──
  const agents = []
  if (!fs.existsSync(agentsDir)) {
    for (const [name, data] of Object.entries(POSTURE_MAP)) {
      agents.push({ name, ...data, canonStatus: 'Development', sigil: 'N/A', source: 'static' })
    }
    return res.json(agents)
  }
  const agentDirs = fs.readdirSync(agentsDir, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name)
  for (const dir of agentDirs) {
    const agentFile = path.join(agentsDir, dir, 'AGENT.md')
    const text = readFileSafe(agentFile)
    if (!text) continue
    const name = extractMdField(text, 'Agent') || extractMdField(text, 'Name') || dir
    const displayName = name.replace(/^(AGT-\S+\s+—\s+)/, '').replace(/\sv\d+\.\d+$/, '').trim()
    const postureField = extractMdField(text, 'Operational Posture')
    const mapEntry = POSTURE_MAP[displayName] || Object.entries(POSTURE_MAP).find(([k]) => displayName.includes(k))?.[1] || {}
    agents.push({
      name: displayName,
      posture: postureField || mapEntry.posture || 'Unknown',
      type: extractMdField(text, 'Agent Type') || mapEntry.type || 'Unknown',
      canonStatus: extractMdField(text, 'Canon Status') || 'Development',
      sigil: extractMdField(text, 'Primary Sigil Alignment') || 'N/A',
      source: 'live', path: agentFile
    })
  }
  for (const [name, data] of Object.entries(POSTURE_MAP)) {
    if (!agents.find(a => a.name === name || name.includes(a.name))) {
      agents.push({ name, ...data, canonStatus: 'Development', sigil: 'N/A', source: 'static' })
    }
  }
  res.json(agents)
})

// GET /api/status — parse DIRECTOR_STATUS.md entries
app.get('/api/status', (req, res) => {
  // Try repo first, then workspace fallback
  const repoPaths = [
    path.join(REPO, config.statusLayerFile),
    path.join(__dirname, '..', 'DIRECTOR_STATUS.md'),
  ]

  let text = null
  for (const p of repoPaths) {
    text = readFileSafe(p)
    if (text) break
  }

  if (!text) return res.json({ entries: [], source: 'none' })

  const entries = []
  // Parse structured entries — look for DATE: blocks
  const blocks = text.split(/(?=^DATE:)/m).filter(b => b.trim().startsWith('DATE:'))

  for (const block of blocks) {
    const entry = {}
    const lines = block.trim().split('\n')
    for (const line of lines) {
      const m = line.match(/^(\w+):\s*(.*)/)
      if (m) entry[m[1].toLowerCase()] = m[2].trim()
    }
    if (entry.date && entry.agent) {
      entries.push({
        date: entry.date,
        agent: entry.agent,
        posture: entry.posture || null,
        action: entry.action || '',
        scope: entry.scope || null,
        status: entry.status || 'LOGGED',
        result: entry.result || null,
        directorNote: entry.director_note || null
      })
    }
  }

  // Sort: ESCALATION first, then REVIEW, then LOGGED; within each, newest first
  const order = { 'ESCALATION_REQUIRED': 0, 'REVIEW_WHEN_READY': 1, 'LOGGED': 2 }
  entries.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || b.date.localeCompare(a.date))

  res.json({ entries, source: text ? 'live' : 'none' })
})

// GET /api/canon — source-of-truth documents with Canon Status/Boundary
app.get('/api/canon', (req, res) => {
  const sotDir = path.join(REPO, config.sourceOfTruthDir)
  const docs = []

  // Also check workspace files as fallback
  const fallbackDir = path.join(__dirname, '..')

  const readDir = (dir, label) => {
    if (!fs.existsSync(dir)) return
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'))
    for (const file of files) {
      const text = readFileSafe(path.join(dir, file))
      if (!text) continue
      const canonStatus = extractMdField(text, 'Canon Status') || 'Unknown'
      const canonBoundary = extractMdField(text, 'Canon Boundary') || 'N/A'
      const title = file.replace(/\.md$/, '').replace(/_/g, ' ').replace(/v\d+$/, '').trim()
      const lastMod = fs.statSync(path.join(dir, file)).mtime.toISOString().slice(0, 10)
      docs.push({ file, title, canonStatus, canonBoundary, lastMod, source: label })
    }
  }

  readDir(sotDir, 'live')
  if (docs.length === 0) readDir(fallbackDir, 'workspace')

  // Also scan contextDirs (e.g. agents/umbruh) for context/session files
  for (const relDir of (config.contextDirs || [])) {
    const dir = path.join(REPO, relDir)
    if (!fs.existsSync(dir)) continue
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'))
    for (const file of files) {
      const fullPath = path.join(dir, file)
      const text = readFileSafe(fullPath)
      if (!text) continue
      const canonStatus = extractMdField(text, 'Canon Status') || 'Development'
      const canonBoundary = extractMdField(text, 'Canon Boundary') || 'Internal'
      const h1 = text.match(/^#\s+(.+)/m)
      const title = h1 ? h1[1].trim() : file.replace(/\.md$/, '')
      const lastMod = fs.statSync(fullPath).mtime.toISOString().slice(0, 10)
      docs.push({ file, title, canonStatus, canonBoundary, lastMod, source: relDir, path: path.join(relDir, file) })
    }
  }

  // Sort: Canon first, then Dev, then others
  const statusOrder = { Canon: 0, Development: 1, Candidate: 2, Unknown: 3 }
  docs.sort((a, b) => (statusOrder[a.canonStatus] ?? 9) - (statusOrder[b.canonStatus] ?? 9))

  res.json(docs)
})

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, repoFound: fs.existsSync(REPO) })
})

// GET /api/key-status — tells the UI which keys are set (without revealing them)
app.get('/api/key-status', (req, res) => {
  res.json({
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
  })
})

// POST /api/settings — write API keys to the user data .env file
app.post('/api/settings', (req, res) => {
  const { anthropicKey, openaiKey } = req.body
  try {
    const envDir = process.env.NEXUS_USER_DATA
      || path.join(os.homedir(), 'Library', 'Application Support', 'Nexus')
    if (!fs.existsSync(envDir)) fs.mkdirSync(envDir, { recursive: true })
    const envPath = path.join(envDir, '.env')

    // Read existing, update/add keys
    let lines = fs.existsSync(envPath)
      ? fs.readFileSync(envPath, 'utf8').split('\n').filter(Boolean)
      : []

    const set = (key, val) => {
      if (!val) return
      const idx = lines.findIndex(l => l.startsWith(`${key}=`))
      if (idx >= 0) lines[idx] = `${key}=${val}`
      else lines.push(`${key}=${val}`)
      process.env[key] = val  // apply immediately without restart
    }

    set('ANTHROPIC_API_KEY', anthropicKey)
    set('OPENAI_API_KEY', openaiKey)
    if (!lines.find(l => l.startsWith('OLLAMA_BASE_URL=')))
      lines.push('OLLAMA_BASE_URL=http://localhost:11434')

    fs.writeFileSync(envPath, lines.join('\n') + '\n')
    res.json({
      ok: true,
      keyStatus: {
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        openai: !!process.env.OPENAI_API_KEY,
      }
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ─── Ollama model discovery ─────────────────────────────────────────────────
// Query the local Ollama daemon for installed models. Cached briefly so the
// model picker can poll without hammering the daemon. Returns an array of model
// tag strings, or null if Ollama is unreachable (not running).
let _ollamaCache = { at: 0, models: null }
async function getOllamaTags() {
  const now = Date.now()
  if (now - _ollamaCache.at < 10000 && _ollamaCache.models !== undefined) {
    return _ollamaCache.models
  }
  const base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 1500)
    const r = await fetch(`${base}/api/tags`, { signal: ctrl.signal })
    clearTimeout(t)
    if (!r.ok) throw new Error(`status ${r.status}`)
    const data = await r.json()
    const names = (data.models || []).map(m => m.name || m.model).filter(Boolean)
    _ollamaCache = { at: now, models: names }
    return names
  } catch {
    _ollamaCache = { at: now, models: null }  // null = Ollama not reachable
    return null
  }
}

// Normalize an Ollama tag for comparison (Ollama appends :latest by default,
// but config typically stores the bare name, e.g. "umbruh").
const normTag = (t) => String(t).replace(/:latest$/, '')

// Robust PATH for shelling out to CLIs (claude, etc.) from the GUI-launched app.
function cliEnv() {
  const home = os.homedir()
  const extra = [`${home}/.local/bin`, `${home}/.claude/local`, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']
  const env = { ...process.env, HOME: home, PATH: [process.env.PATH, ...extra].filter(Boolean).join(':') }
  // Claude Code prefers ANTHROPIC_API_KEY over the Max-subscription OAuth login.
  // Nexus keeps a (possibly dead) API key in its env, which would force the
  // credit-billed external key. Strip it so `claude` uses the Max login instead.
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  return env
}

// ─── Honest cloud-key validation ────────────────────────────────────────────
// A green availability dot should mean "this will actually respond", not just
// "a key string exists". We do a tiny (max_tokens:1) real call per provider and
// cache the result for 5 min, so an invalid key or exhausted quota shows red.
// Failed calls (401 invalid key, insufficient_quota) are not billed.
const _keyCache = {}
async function validateProvider(provider) {
  const now = Date.now()
  const cached = _keyCache[provider]
  if (cached && now - cached.at < 300000) return cached
  const result = { at: now, ok: false, error: null }
  try {
    if (provider === 'anthropic') {
      if (!process.env.ANTHROPIC_API_KEY) { result.error = 'No API key set' }
      else {
        const model = (config.models || []).find(m => m.provider === 'anthropic')?.model || 'claude-haiku-4-5-20251001'
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 8000)
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
        })
        clearTimeout(t)
        if (r.ok) result.ok = true
        else result.error = `${r.status}: ${(await r.text()).slice(0, 140)}`
      }
    } else if (provider === 'openai') {
      if (!process.env.OPENAI_API_KEY) { result.error = 'No API key set' }
      else {
        const model = (config.models || []).find(m => m.provider === 'openai')?.model || 'gpt-4o'
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 8000)
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST', signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
          body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
        })
        clearTimeout(t)
        if (r.ok) result.ok = true
        else result.error = `${r.status}: ${(await r.text()).slice(0, 140)}`
      }
    } else if (provider === 'claude-code') {
      // Available iff the Claude Code CLI is installed (it uses the Max login).
      try {
        execSync('claude --version', { timeout: 6000, encoding: 'utf8', env: cliEnv() })
        result.ok = true
      } catch {
        result.error = 'Claude Code CLI not found — install it and log in with your Claude Max account'
      }
    }
  } catch (e) {
    result.error = e.name === 'AbortError' ? 'timed out' : e.message
  }
  _keyCache[provider] = result
  return result
}

// GET /api/models — configured model list, with live Ollama availability +
// auto-detected local models appended.
app.get('/api/models', async (req, res) => {
  const [installed, anth, oai, cc] = await Promise.all([
    getOllamaTags(),                 // array, or null if down
    validateProvider('anthropic'),
    validateProvider('openai'),
    validateProvider('claude-code'),
  ])
  const ollamaRunning = installed !== null
  const installedNorm = new Set((installed || []).map(normTag))
  const isOllamaInstalled = (modelStr) =>
    ollamaRunning && installedNorm.has(normTag(modelStr))

  const models = (config.models || []).map(m => ({
    ...m,
    available: m.provider === 'ollama'
      ? isOllamaInstalled(m.model)
      : m.provider === 'anthropic'
        ? anth.ok
        : m.provider === 'openai'
          ? oai.ok
          : m.provider === 'claude-code'
            ? cc.ok
            : false,
    // Why a model is unavailable (shown on hover) — honest, not just "no key".
    unavailableReason: m.provider === 'ollama'
      ? (isOllamaInstalled(m.model) ? null : (ollamaRunning ? 'Not installed in Ollama' : 'Ollama not running'))
      : m.provider === 'anthropic'
        ? (anth.ok ? null : anth.error)
        : m.provider === 'openai'
          ? (oai.ok ? null : oai.error)
          : m.provider === 'claude-code'
            ? (cc.ok ? null : cc.error)
            : 'Unknown provider',
  }))

  // Append any installed Ollama models that aren't already represented in config
  if (ollamaRunning) {
    const configuredTags = new Set(
      (config.models || [])
        .filter(m => m.provider === 'ollama')
        .map(m => normTag(m.model))
    )
    for (const tag of installed) {
      if (configuredTags.has(normTag(tag))) continue
      models.push({
        id: `ollama-auto:${tag}`,
        name: tag,
        provider: 'ollama',
        model: tag,
        description: 'Auto-detected local Ollama model.',
        available: true,
        autoDetected: true,
      })
    }
  }

  res.json({ models, agentRoles: config.agentRoles || [], ollamaRunning })
})

// GET /api/usage — live token/cost meter. Second-to-second awareness of spend so
// the engine (and the Director) can see, throttle, and route down before a ceiling.
app.get('/api/usage', (req, res) => {
  res.json({
    ...usage,
    budgetUSD,
    overBudget: budgetUSD > 0 && usage.costUSD >= budgetUSD,
    remainingUSD: budgetUSD > 0 ? Math.max(0, budgetUSD - usage.costUSD) : null,
  })
})

// POST /api/usage — set the paid-spend budget ceiling (USD/day; 0 = off) or reset the meter.
app.post('/api/usage', (req, res) => {
  if (typeof req.body.budgetUSD === 'number') budgetUSD = req.body.budgetUSD
  if (req.body.reset) { usage.calls = 0; usage.inTok = 0; usage.outTok = 0; usage.costUSD = 0; usage.byModel = {}; usage.since = new Date().toISOString() }
  res.json({ ok: true, budgetUSD, usage })
})

// GET /api/file — read a specific file from the repo (for source bundle assembly)
app.get('/api/file', (req, res) => {
  const { p } = req.query
  if (!p) return res.status(400).json({ error: 'p param required' })
  const filePath = path.join(REPO, p)
  const text = readFileSafe(filePath)
  if (!text) return res.status(404).json({ error: 'file not found' })
  res.json({ path: p, content: text })
})

// POST /api/relay — send a prompt to a model, stream response
app.post('/api/relay', async (req, res) => {
  const { modelId, systemPrompt, messages, sourceDocs } = req.body
  if (!modelId || !messages?.length) {
    return res.status(400).json({ error: 'modelId and messages required' })
  }

  let modelConfig = (config.models || []).find(m => m.id === modelId)
  // Auto-detected Ollama models aren't in config — build an ad-hoc entry.
  if (!modelConfig && modelId.startsWith('ollama-auto:')) {
    const tag = modelId.slice('ollama-auto:'.length)
    modelConfig = { id: modelId, name: tag, provider: 'ollama', model: tag }
  }
  if (!modelConfig) return res.status(400).json({ error: `Unknown model: ${modelId}` })

  // Build context from source docs
  // Persona (model-level system prompt, e.g. cloud Umbruh) layers under the role prompt.
  const persona = loadPersona(modelConfig)
  let systemContent = [persona, systemPrompt].filter(Boolean).join('\n\n')
  // Wired supply: auto-inject a model's defaultDocs (e.g. Umbruh's Director profile +
  // affective-context line) so the persona's supplied-context clauses are fed at
  // invocation on the desktop relay too — matching the voice surface. Only models that
  // declare defaultDocs (Umbruh) are affected; safe-empty affective-context = no-op.
  const autoDocs = modelConfig.defaultDocs || []
  if (autoDocs.length) {
    let supply = ''
    for (const dp of autoDocs) {
      const text = readFileSafe(path.join(REPO, dp))
      if (text) supply += `### ${path.basename(dp, '.md')}\n\n${text}\n\n`
    }
    if (supply) systemContent += `\n\n---\n## Director Supplied Context\n\n${supply}`
  }
  if (sourceDocs?.length) {
    systemContent += '\n\n---\n## Source Documents\n\n'
    for (const doc of sourceDocs) {
      const text = readFileSafe(doc.path ? path.join(REPO, doc.path) : null)
        || readFileSafe(doc.path)
      if (text) {
        systemContent += `### ${doc.title || doc.path}\n\n${text}\n\n`
      }
    }
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const sendChunk = (text) => res.write(`data: ${JSON.stringify({ text })}\n\n`)
  const sendDone = (meta) => {
    res.write(`data: ${JSON.stringify({ done: true, ...meta })}\n\n`)
    res.end()
  }
  const sendError = (msg) => {
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`)
    res.end()
  }

  try {
    if (modelConfig.provider === 'anthropic') {
      if (!process.env.ANTHROPIC_API_KEY) return sendError('ANTHROPIC_API_KEY not set in .env')

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: modelConfig.model,
          max_tokens: 4096,
          stream: true,
          system: systemContent || undefined,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
        }),
      })

      if (!response.ok) {
        const err = await response.text()
        return sendError(`Anthropic API error: ${err}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'content_block_delta' && data.delta?.text) {
                sendChunk(data.delta.text)
              }
            } catch {}
          }
        }
      }
      sendDone({ model: modelConfig.model, provider: 'anthropic' })

    } else if (modelConfig.provider === 'openai') {
      if (!process.env.OPENAI_API_KEY) return sendError('OPENAI_API_KEY not set in .env')

      const oaiMessages = []
      if (systemContent) oaiMessages.push({ role: 'system', content: systemContent })
      oaiMessages.push(...messages.map(m => ({ role: m.role, content: m.content })))

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: modelConfig.model,
          stream: true,
          messages: oaiMessages,
        }),
      })

      if (!response.ok) {
        const err = await response.text()
        return sendError(`OpenAI API error: ${err}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6))
              const text = data.choices?.[0]?.delta?.content
              if (text) sendChunk(text)
            } catch {}
          }
        }
      }
      sendDone({ model: modelConfig.model, provider: 'openai' })

    } else if (modelConfig.provider === 'ollama') {
      const base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
      const ollamaMessages = []
      if (systemContent) ollamaMessages.push({ role: 'system', content: systemContent })
      ollamaMessages.push(...messages.map(m => ({ role: m.role, content: m.content })))

      const response = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelConfig.model,
          stream: true,
          messages: ollamaMessages,
        }),
      })

      if (!response.ok) return sendError(`Ollama error: is Ollama running at ${base}?`)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const lines = decoder.decode(value).split('\n').filter(Boolean)
        for (const line of lines) {
          try {
            const data = JSON.parse(line)
            if (data.message?.content) sendChunk(data.message.content)
          } catch {}
        }
      }
      sendDone({ model: modelConfig.model, provider: 'ollama' })

    } else {
      sendError(`Unknown provider: ${modelConfig.provider}`)
    }
  } catch (e) {
    sendError(e.message)
  }
})

// ─── Multi-model sandbox ("Council") ────────────────────────────────────────
// Shared model resolution (handles auto-detected Ollama models too).
async function resolveModelConfig(modelId) {
  let m = (config.models || []).find(x => x.id === modelId)
  if (!m && typeof modelId === 'string' && modelId.startsWith('ollama-auto:')) {
    const tag = modelId.slice('ollama-auto:'.length)
    m = { id: modelId, name: tag, provider: 'ollama', model: tag }
  }
  return m
}

// Load a model's persona system-prompt from its `systemPromptFile` (repo-relative).
// If the file uses "=== BEGIN/END SYSTEM PROMPT ===" markers, extract between them.
// Lets a cloud model (no Ollama Modelfile) carry the same persona as a local one.
function loadPersona(modelConfig) {
  if (!modelConfig?.systemPromptFile) return ''
  const raw = readFileSafe(path.join(REPO, modelConfig.systemPromptFile))
  if (!raw) return ''
  const m = raw.match(/=== BEGIN SYSTEM PROMPT ===([\s\S]*?)=== END SYSTEM PROMPT ===/)
  return (m ? m[1] : raw).trim()
}

// Assemble a "## Source Documents" block from selected docs.
function buildDocContext(sourceDocs) {
  if (!sourceDocs?.length) return ''
  let s = '\n\n---\n## Source Documents\n\n'
  for (const doc of sourceDocs) {
    const text = readFileSafe(doc.path ? path.join(REPO, doc.path) : null) || readFileSafe(doc.path)
    if (text) s += `### ${doc.title || doc.path}\n\n${text}\n\n`
  }
  return s
}

// Non-streaming single-shot call to any provider. Returns full text, or throws
// with a clear message (so the orchestrator can degrade gracefully per model).
// ─── Live token/cost meter ───────────────────────────────────────────────────
// Second-to-second usage awareness: every model call records its token counts so
// the engine can see spend as it happens, trip a budget breaker, and route down
// to free/local when a ceiling is near. Pricing is $ per 1M tokens [in, out] —
// estimate only; ollama (local) is free; a claude-code (Max-subscription) provider
// would be metered as tokens-but-$0 (covered by the subscription, not credits).
const PRICE = {
  'claude-sonnet-4-6': [3, 15],
  'claude-haiku-4-5-20251001': [0.8, 4],
  'gpt-4o': [2.5, 10],
}
const usage = { calls: 0, inTok: 0, outTok: 0, costUSD: 0, byModel: {}, since: new Date().toISOString() }
// Soft daily ceiling on *paid* spend (USD). 0 disables. Override via NEXUS_DAILY_BUDGET_USD.
let budgetUSD = Number(process.env.NEXUS_DAILY_BUDGET_USD || 5)

function recordUsage(mc, inTok = 0, outTok = 0) {
  inTok = inTok || 0; outTok = outTok || 0
  const paid = mc.provider !== 'ollama' && mc.provider !== 'claude-code'
  const [pin, pout] = (paid && PRICE[mc.model]) || [0, 0]
  const cost = (inTok * pin + outTok * pout) / 1e6
  usage.calls++; usage.inTok += inTok; usage.outTok += outTok; usage.costUSD += cost
  const b = (usage.byModel[mc.id] || (usage.byModel[mc.id] = { calls: 0, inTok: 0, outTok: 0, costUSD: 0, provider: mc.provider }))
  b.calls++; b.inTok += inTok; b.outTok += outTok; b.costUSD += cost
  return { cost, overBudget: budgetUSD > 0 && usage.costUSD >= budgetUSD }
}
const overBudget = () => budgetUSD > 0 && usage.costUSD >= budgetUSD

async function callModel(modelConfig, systemContent, messages) {
  const provider = modelConfig.provider
  // Prepend the model's persona (if any) so cloud Umbruh carries its identity.
  const persona = loadPersona(modelConfig)
  if (persona) systemContent = [persona, systemContent].filter(Boolean).join('\n\n')
  if (provider === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set')
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: modelConfig.model, max_tokens: 4096,
        system: systemContent || undefined,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    })
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const data = await r.json()
    recordUsage(modelConfig, data.usage?.input_tokens, data.usage?.output_tokens)
    return (data.content || []).map(c => c.text || '').join('').trim()
  }
  if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set')
    const msgs = []
    if (systemContent) msgs.push({ role: 'system', content: systemContent })
    msgs.push(...messages.map(m => ({ role: m.role, content: m.content })))
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: modelConfig.model, messages: msgs }),
    })
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const data = await r.json()
    recordUsage(modelConfig, data.usage?.prompt_tokens, data.usage?.completion_tokens)
    return (data.choices?.[0]?.message?.content || '').trim()
  }
  if (provider === 'ollama') {
    const base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
    const msgs = []
    if (systemContent) msgs.push({ role: 'system', content: systemContent })
    msgs.push(...messages.map(m => ({ role: m.role, content: m.content })))
    const r = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // keep_alive: 0 unloads the model from RAM immediately after responding.
      // Critical for the sandbox: local models run sequentially, and on a 24GB
      // Mac two large models (e.g. 8B + 32B) won't co-reside. Unloading each
      // one after its turn frees RAM for the next, preventing OOM ("fetch failed").
      body: JSON.stringify({ model: modelConfig.model, stream: false, keep_alive: 0, messages: msgs }),
    })
    if (!r.ok) throw new Error(`Ollama ${r.status}: is Ollama running at ${base}?`)
    const data = await r.json()
    recordUsage(modelConfig, data.prompt_eval_count, data.eval_count)
    return (data.message?.content || '').trim()
  }
  if (provider === 'claude-code') {
    // Claude via the Claude Code CLI — billed to the Max subscription, NOT API
    // credits. Runs one non-interactive turn; the prompt (persona + system + msgs)
    // is piped on stdin. Metered as $0 by recordUsage (provider !== paid).
    const model = modelConfig.model || 'sonnet'
    const prompt = [systemContent, ...messages.map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))].filter(Boolean).join('\n\n')
    // Prompt is passed as an ARGUMENT (execFileSync — no shell, no escaping issues).
    // No --bare: bare mode skips the OAuth/keychain read, i.e. it would NOT use the
    // Max subscription. cwd=home for a stable, low-context run.
    let out
    try {
      out = execFileSync('claude', ['-p', prompt, '--output-format', 'json', '--model', model], {
        encoding: 'utf8', timeout: 180000, maxBuffer: 20 * 1024 * 1024,
        cwd: os.homedir(), env: cliEnv(),
      })
    } catch (e) {
      const detail = String(e.stderr || e.stdout || e.message || '').replace(/\s+/g, ' ').slice(0, 400)
      throw new Error(`Claude Code CLI failed (exit ${e.status ?? '?'}): ${detail}`)
    }
    const parsed = safeJson(out)
    recordUsage(modelConfig, parsed?.usage?.input_tokens, parsed?.usage?.output_tokens)
    return String(parsed?.result ?? out).trim()
  }
  throw new Error(`Unknown provider: ${provider}`)
}

// POST /api/sandbox — orchestrate multiple models. Streams SSE turn events.
// Modes: 'roundtable' (Mixture-of-Agents), 'debate', 'orchestrator'.
// Local (Ollama) models are RAM-bound, so every call runs sequentially.
app.post('/api/sandbox', async (req, res) => {
  const {
    task, participantIds = [], mode = 'roundtable',
    aggregatorId, rounds = 2, sourceDocs = [], roleAssignments = {},
    backendId, championFile, challengerFile,   // A/B (champion vs challenger) mode
    directorId, tools = true,                  // Umbruh-Director mode
  } = req.body
  if (!task) return res.status(400).json({ error: 'task required' })
  if (mode !== 'ab' && !participantIds.length) {
    return res.status(400).json({ error: 'task and participantIds required' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  const emit = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)

  const participants = []
  for (const id of participantIds) {
    const mc = await resolveModelConfig(id)
    if (mc) participants.push(mc)
  }
  const aggregator = aggregatorId ? await resolveModelConfig(aggregatorId) : null
  const docContext = buildDocContext(sourceDocs)
  const roleSys = (id) => {
    const role = (config.agentRoles || []).find(r => r.id === roleAssignments[id])
    return ((role ? role.systemPrompt : '') + docContext) || undefined
  }

  try {
    if (mode === 'roundtable') {
      emit({ type: 'status', message: 'Roundtable — gathering independent answers' })
      const answers = []
      for (const p of participants) {
        emit({ type: 'turn-start', model: p.name, modelId: p.id, phase: 'propose' })
        try {
          const text = await callModel(p, roleSys(p.id), [{ role: 'user', content: task }])
          answers.push({ name: p.name, text })
          emit({ type: 'turn', model: p.name, modelId: p.id, phase: 'propose', text })
        } catch (e) {
          emit({ type: 'turn-error', model: p.name, modelId: p.id, phase: 'propose', error: e.message })
        }
      }
      if (aggregator && answers.length) {
        emit({ type: 'status', message: `Synthesizing with ${aggregator.name}` })
        const synth = `You are the aggregator in a Mixture-of-Agents council. The Director posed this task:\n\n"""${task}"""\n\nBelow are the council members' independent answers. Synthesize them into one superior answer: keep the strongest reasoning, reconcile agreements, resolve contradictions, and flag any important unresolved disagreement.\n\n${answers.map((a, i) => `### Member ${i + 1} — ${a.name}\n${a.text}`).join('\n\n')}`
        try {
          const finalText = await callModel(aggregator, docContext || undefined, [{ role: 'user', content: synth }])
          emit({ type: 'final', model: aggregator.name, modelId: aggregator.id, text: finalText })
        } catch (e) {
          emit({ type: 'turn-error', model: aggregator.name, phase: 'synthesize', error: e.message })
        }
      }

    } else if (mode === 'debate') {
      let prev = []
      for (let round = 1; round <= rounds; round++) {
        emit({ type: 'status', message: `Debate — round ${round} of ${rounds}` })
        const cur = []
        for (const p of participants) {
          emit({ type: 'turn-start', model: p.name, modelId: p.id, phase: 'debate', round })
          const userMsg = round === 1
            ? `Answer this task as well as you can. Be concrete.\n\nTASK:\n${task}`
            : `This is round ${round} of a structured debate. Below are the other members' answers from the previous round. Critique them, defend or revise your own position, and produce your improved answer.\n\nTASK:\n${task}\n\n${prev.filter(x => x.name !== p.name).map(o => `### ${o.name} said:\n${o.text}`).join('\n\n')}`
          try {
            const text = await callModel(p, roleSys(p.id), [{ role: 'user', content: userMsg }])
            cur.push({ name: p.name, text })
            emit({ type: 'turn', model: p.name, modelId: p.id, phase: 'debate', round, text })
          } catch (e) {
            emit({ type: 'turn-error', model: p.name, modelId: p.id, phase: 'debate', round, error: e.message })
          }
        }
        if (cur.length) prev = cur
      }
      if (aggregator && prev.length) {
        emit({ type: 'status', message: `${aggregator.name} judging the debate` })
        const judge = `You are the neutral judge of a multi-model debate. Do NOT simply count votes — weigh the quality of reasoning (a single well-argued minority position can be correct). Task:\n\n"""${task}"""\n\nFinal positions:\n\n${prev.map(o => `### ${o.name}\n${o.text}`).join('\n\n')}\n\nProduce: (1) the consensus, (2) the key remaining disagreements, (3) your single best-judged answer with brief justification.`
        try {
          const finalText = await callModel(aggregator, docContext || undefined, [{ role: 'user', content: judge }])
          emit({ type: 'final', model: aggregator.name, modelId: aggregator.id, text: finalText })
        } catch (e) {
          emit({ type: 'turn-error', model: aggregator.name, phase: 'judge', error: e.message })
        }
      }

    } else if (mode === 'orchestrator') {
      const director = aggregator || participants[0]
      emit({ type: 'status', message: `${director.name} decomposing the task` })
      const planPrompt = `You are the orchestrator. Break the task below into ${Math.max(2, participants.length)} concrete, independent subtasks that can each be delegated to a worker model. Output ONLY a numbered list — one subtask per line, no preamble or commentary.\n\nTASK:\n${task}`
      let subtasks = []
      try {
        const planText = await callModel(director, undefined, [{ role: 'user', content: planPrompt }])
        emit({ type: 'turn', model: director.name, modelId: director.id, phase: 'plan', text: planText })
        subtasks = planText.split('\n').map(l => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(l => l.length > 3)
      } catch (e) {
        emit({ type: 'turn-error', model: director.name, phase: 'plan', error: e.message })
      }
      const results = []
      for (let i = 0; i < subtasks.length; i++) {
        const worker = participants[i % participants.length]
        emit({ type: 'turn-start', model: worker.name, modelId: worker.id, phase: 'work', subtask: subtasks[i] })
        try {
          const text = await callModel(worker, roleSys(worker.id), [{ role: 'user', content: `Subtask:\n${subtasks[i]}\n\n(This is one part of a larger goal: ${task})` }])
          results.push({ subtask: subtasks[i], worker: worker.name, text })
          emit({ type: 'turn', model: worker.name, modelId: worker.id, phase: 'work', subtask: subtasks[i], text })
        } catch (e) {
          emit({ type: 'turn-error', model: worker.name, phase: 'work', subtask: subtasks[i], error: e.message })
        }
      }
      emit({ type: 'status', message: `${director.name} composing the final result` })
      const compose = `You are the orchestrator. Compose the worker outputs below into one coherent final deliverable for the task:\n\n"""${task}"""\n\n${results.map(r => `### Subtask: ${r.subtask}\n(by ${r.worker})\n${r.text}`).join('\n\n')}`
      try {
        const finalText = await callModel(director, docContext || undefined, [{ role: 'user', content: compose }])
        emit({ type: 'final', model: director.name, modelId: director.id, text: finalText })
      } catch (e) {
        emit({ type: 'turn-error', model: director.name, phase: 'compose', error: e.message })
      }

    } else if (mode === 'ab') {
      // Champion vs Challenger: same prompt + backend, two personas, side by side.
      const backend = await resolveModelConfig(backendId)
      if (!backend) {
        emit({ type: 'error', error: 'No backend model selected for A/B trial' })
      } else {
        const champPersona = loadPersona({ systemPromptFile: championFile || 'agents/umbruh/umbruh-persona.md' })
        const chalPersona = loadPersona({ systemPromptFile: challengerFile || 'agents/umbruh/umbruh-persona.candidate.md' })
        if (!champPersona || !chalPersona) {
          emit({ type: 'status', message: 'Warning: a persona file was empty or missing — comparison may be one-sided.' })
        }
        // bare = backend without its own systemPromptFile, so we control the persona explicitly
        const bare = { ...backend, systemPromptFile: undefined }
        const sysFor = (persona) => [persona, docContext].filter(Boolean).join('\n\n') || undefined

        emit({ type: 'status', message: `Champion vs Challenger on ${backend.name}` })
        emit({ type: 'turn-start', model: backend.name, modelId: backend.id, phase: 'champion' })
        try {
          const a = await callModel(bare, sysFor(champPersona), [{ role: 'user', content: task }])
          emit({ type: 'turn', model: backend.name, modelId: backend.id, phase: 'champion', text: a })
        } catch (e) {
          emit({ type: 'turn-error', model: backend.name, phase: 'champion', error: e.message })
        }
        emit({ type: 'turn-start', model: backend.name, modelId: backend.id, phase: 'challenger' })
        try {
          const b = await callModel(bare, sysFor(chalPersona), [{ role: 'user', content: task }])
          emit({ type: 'turn', model: backend.name, modelId: backend.id, phase: 'challenger', text: b })
        } catch (e) {
          emit({ type: 'turn-error', model: backend.name, phase: 'challenger', error: e.message })
        }
      }

    } else if (mode === 'director') {
      // Umbruh as Director: the Umbruh identity (on a chosen backend) plans the
      // work, routes each subtask to the best-fit model in the ensemble, uses
      // tools where needed, and composes the result in its own voice.
      const director = (await resolveModelConfig(directorId || aggregatorId)) || participants[0]
      if (!director) { emit({ type: 'error', error: 'No Director backend selected' }); }
      else {
        const ensemble = participants.length ? participants : [director]
        const menu = ensemble.map(m => `- ${m.id}: ${m.name}${m.provider === 'ollama' ? ' [FREE · local]' : ' [PAID · cloud]'}${/umbruh/i.test(m.id) ? ' (you, Umbruh — best for anything private or personal)' : ''}`).join('\n')
        const budgetLine = overBudget()
          ? 'BUDGET CEILING REACHED for paid spend — assign ONLY [FREE] local models this run.'
          : (budgetUSD > 0 ? `Paid budget remaining today: ~$${Math.max(0, budgetUSD - usage.costUSD).toFixed(2)}.` : '')
        emit({ type: 'status', message: `${director.name} planning as Director` })
        const planPrompt = `You are Umbruh, conducting a model ensemble as its Director. Break the task into the FEWEST subtasks that do the job well (1–5) and assign each to the best-fit model from the menu below.

COST DISCIPLINE (real money is at stake — do not waste it):
- Local models [FREE] cost nothing. Prefer them. A single strong local pass often beats fanning out to paid models.
- Cloud models [PAID] cost real money per token. Use them ONLY when the task genuinely needs stronger reasoning or larger context than a local model can deliver.
- Do not split work that one model can do in one pass. Fewer, cheaper, focused calls beat many expensive ones.
- Route private/personal to yourself (an "umbruh" id); simple/quick to a small local; hard reasoning to a strong cloud model only if truly needed.
- REGENERATION RULE: reach for a PAID model only when the task is BOTH (a) beyond what a local model can do well AND (b) advances something that sustains Goose — revenue, a release, a shippable deliverable, or infrastructure that pays for itself. Paid compute is an investment that should help keep the system alive, not just spend the wallet. If a paid subtask does not help regenerate its cost, route it local or drop it.
- ${budgetLine}

Set needsTools=true ONLY when a subtask must run commands, read/write files, or fetch the web.

Return ONLY valid JSON, no prose, no code fences:
{"subtasks":[{"task":"...","modelId":"<id from the menu>","needsTools":true|false}]}

MODEL MENU:
${menu}

TASK:
${task}`
        let plan = []
        try {
          const planText = await callModel(director, undefined, [{ role: 'user', content: planPrompt }])
          emit({ type: 'turn', model: director.name, modelId: director.id, phase: 'plan', text: planText })
          const parsed = safeJson(planText.replace(/```json|```/g, '').trim()) || safeJson((planText.match(/\{[\s\S]*\}/) || [])[0] || '')
          plan = (parsed?.subtasks || []).filter(s => s && s.task)
        } catch (e) {
          emit({ type: 'turn-error', model: director.name, phase: 'plan', error: e.message })
        }
        if (!plan.length) plan = [{ task, modelId: director.id, needsTools: tools }]

        const results = []
        for (const step of plan) {
          let worker = (await resolveModelConfig(step.modelId)) || director
          // Budget breaker: at the paid-spend ceiling, downgrade paid workers to free/local.
          if (overBudget() && worker.provider !== 'ollama' && worker.provider !== 'claude-code') {
            const local = ensemble.find(m => m.provider === 'ollama') || director
            emit({ type: 'status', message: `Budget ceiling — routing "${step.task.slice(0, 40)}…" to ${local.name} (free) instead of ${worker.name}` })
            worker = local
          }
          const wantTools = tools && step.needsTools
          emit({ type: 'turn-start', model: worker.name, modelId: worker.id, phase: 'work', subtask: step.task })
          try {
            let text
            if (wantTools) {
              text = await callModelAgentic(
                worker, roleSys(worker.id),
                `${step.task}\n\n(This is one part of a larger goal: ${task})`,
                (ev) => emit({
                  type: 'turn', model: worker.name, modelId: worker.id, phase: 'tool',
                  subtask: `${ev.tool} ${JSON.stringify(ev.args || {}).slice(0, 140)}`,
                  text: String(ev.result?.output ?? ev.result?.content ?? ev.result?.message ?? JSON.stringify(ev.result)).slice(0, 700),
                })
              )
            } else {
              text = await callModel(worker, roleSys(worker.id), [{ role: 'user', content: `Subtask:\n${step.task}\n\n(This is one part of a larger goal: ${task})` }])
            }
            results.push({ subtask: step.task, worker: worker.name, text })
            emit({ type: 'turn', model: worker.name, modelId: worker.id, phase: 'work', subtask: step.task, text })
          } catch (e) {
            emit({ type: 'turn-error', model: worker.name, phase: 'work', subtask: step.task, error: e.message })
          }
        }
        emit({ type: 'status', message: `${director.name} composing as Director` })
        const compose = `You are Umbruh, the Director. Compose the ensemble's work below into one coherent, high-quality deliverable for the task. Keep the strongest reasoning, reconcile any conflicts, note anything still unresolved, and speak in your own voice.\n\nTASK:\n"""${task}"""\n\n${results.map(r => `### ${r.subtask}\n(by ${r.worker})\n${r.text}`).join('\n\n')}`
        try {
          const finalText = await callModel(director, docContext || undefined, [{ role: 'user', content: compose }])
          emit({ type: 'final', model: director.name, modelId: director.id, text: finalText })
        } catch (e) {
          emit({ type: 'turn-error', model: director.name, phase: 'compose', error: e.message })
        }
      }

    } else {
      emit({ type: 'error', error: `Unknown mode: ${mode}` })
    }
    emit({ type: 'done' })
  } catch (e) {
    emit({ type: 'error', error: e.message })
  }
  res.end()
})

// GET /api/knowledge — index all repo files with metadata for the bibliographer
app.get('/api/knowledge', (req, res) => {
  const index = []

  const DOC_TYPES = {
    'agents': 'Agent Charter',
    'docs/source-of-truth': 'Governance / Source of Truth',
    'registry/agents': 'Registry Entry',
    'archive': 'Archive',
    'docs/codex': 'Codex Workflow',
    'tests': 'Test / Checklist',
    'docs/mythology': 'Mythology',
    'docs/lexicon': 'Lexicon',
  }

  function getDocType(relPath) {
    for (const [prefix, label] of Object.entries(DOC_TYPES)) {
      if (relPath.startsWith(prefix + '/') || relPath.startsWith(prefix + '\\')) return label
    }
    return 'Document'
  }

  function walkDir(dir, baseDir) {
    if (!fs.existsSync(dir)) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      const relPath = path.relative(baseDir, fullPath)
      if (entry.isDirectory()) {
        // Skip node_modules, .git, hidden dirs
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walkDir(fullPath, baseDir)
        }
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.yaml')) {
        const text = readFileSafe(fullPath)
        if (!text) continue
        const stat = fs.statSync(fullPath)

        const canonStatus = extractMdField(text, 'Canon Status') || null
        const canonBoundary = extractMdField(text, 'Canon Boundary') || null
        const agentType = extractMdField(text, 'Agent Type') || null
        const posture = extractMdField(text, 'Operational Posture') || null
        const docType = getDocType(relPath.replace(/\\/g, '/'))

        // Extract title: first H1, or filename
        const h1 = text.match(/^#\s+(.+)/m)
        const title = h1 ? h1[1].trim().replace(/^AGT-\S+\s+—\s+/, '') : entry.name

        // Extract first non-heading, non-frontmatter paragraph as excerpt
        const lines = text.split('\n')
        const excerptLine = lines.find(l => l.trim() && !l.startsWith('#') && !l.startsWith('**') && !l.startsWith('|') && !l.startsWith('-') && !l.startsWith('```') && l.length > 20)
        const excerpt = excerptLine ? excerptLine.trim().slice(0, 160) : ''

        index.push({
          path: relPath.replace(/\\/g, '/'),
          title,
          docType,
          canonStatus,
          canonBoundary,
          agentType,
          posture,
          excerpt,
          lastMod: stat.mtime.toISOString().slice(0, 10),
          size: stat.size,
        })
      }
    }
  }

  if (fs.existsSync(REPO)) {
    walkDir(REPO, REPO)
  }

  // Also include workspace governance docs as fallback
  const workspaceDir = path.join(__dirname, '..')
  const wsFiles = ['Goose_Agent_Type_Classification_v1.md', 'Goose_Sigil_Mode_Standard_v1.md',
    'Goose_Canon_Terminology_Standard_v1.md', 'Goose_Operational_Posture_Standard_v1.md',
    'DIRECTOR_STATUS.md']
  for (const f of wsFiles) {
    const fullPath = path.join(workspaceDir, f)
    if (fs.existsSync(fullPath) && !index.find(e => e.title.includes(f.replace('.md', '')))) {
      const text = readFileSafe(fullPath)
      if (!text) continue
      const stat = fs.statSync(fullPath)
      const h1 = text.match(/^#\s+(.+)/m)
      index.push({
        path: `[workspace]/${f}`,
        title: h1 ? h1[1].trim() : f,
        docType: 'Governance / Source of Truth',
        canonStatus: extractMdField(text, 'Canon Status'),
        canonBoundary: extractMdField(text, 'Canon Boundary'),
        lastMod: stat.mtime.toISOString().slice(0, 10),
        excerpt: '',
      })
    }
  }

  // Sort by lastMod desc
  index.sort((a, b) => b.lastMod.localeCompare(a.lastMod))

  res.json(index)
})

// ─── thread records (bibliographer output, saved locally) ───────────────────
// Use NEXUS_USER_DATA (~/Library/Application Support/Nexus) in production
// so we write to a writable location, not the read-only app bundle.
const THREADS_DIR = process.env.NEXUS_USER_DATA
  ? path.join(process.env.NEXUS_USER_DATA, 'threads')
  : path.join(__dirname, 'threads')
if (!fs.existsSync(THREADS_DIR)) fs.mkdirSync(THREADS_DIR, { recursive: true })

// GET /api/threads — list all saved thread records
app.get('/api/threads', (req, res) => {
  if (!fs.existsSync(THREADS_DIR)) return res.json([])
  const files = fs.readdirSync(THREADS_DIR).filter(f => f.endsWith('.json'))
  const threads = files.map(f => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(THREADS_DIR, f), 'utf8'))
      return { id: f.replace('.json', ''), ...data }
    } catch { return null }
  }).filter(Boolean)
  threads.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  res.json(threads)
})

// POST /api/threads — save a thread record
app.post('/api/threads', (req, res) => {
  const { title, content, tags, relatedFiles, messages, role, modelName } = req.body
  if (!title || !content) return res.status(400).json({ error: 'title and content required' })
  const id = `thread_${Date.now()}`
  const record = {
    id,
    title,
    content,
    tags: tags || [],
    relatedFiles: relatedFiles || [],
    messages: messages || [],   // raw conversation, so history can reload a session
    role: role || null,         // agent role used, for per-role history filtering
    modelName: modelName || null,
    date: new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
  }
  fs.writeFileSync(path.join(THREADS_DIR, `${id}.json`), JSON.stringify(record, null, 2))
  res.json(record)
})

// DELETE /api/threads/:id
app.delete('/api/threads/:id', (req, res) => {
  const filePath = path.join(THREADS_DIR, `${req.params.id}.json`)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  res.json({ ok: true })
})

// POST /api/umbruh-log — auto-generate and append a session log entry
// Called automatically when "Save thread" is clicked with Umbruh selected.
// Uses the Bibliographer system prompt via Ollama to structure the entry,
// then appends it to umbruh-session-log.md in the repo.
app.post('/api/umbruh-log', async (req, res) => {
  const { conversation } = req.body
  if (!conversation?.length) return res.status(400).json({ error: 'conversation required' })

  const logPath = path.join(REPO, 'agents/umbruh/umbruh-session-log.md')
  if (!fs.existsSync(logPath)) return res.status(404).json({ error: 'umbruh-session-log.md not found in repo' })

  const bibliographerPrompt = `You are the Bibliographer for the Goose Agent System. Given the following conversation between the Director and Umbruh, produce a structured session log entry in this exact markdown format:

## YYYY-MM-DD — [Session Title]

### Session Purpose
[One sentence: what was this session for?]

### Project Context Added
[Any new Goose, Nexus, Umbruh, Heart/Mind, or agent-system facts established]

### Decisions Made
- [Decision 1]
- [Decision 2]

### Artifacts Produced
- [Files, prompts, rules, or outputs created or modified]

### Continuity Notes
[Only practical context needed for future sessions — compress ruthlessly]

### Boundary Notes
[Any guardrail, safety, ontology, or behavior rule that should be preserved]

### Do Not Preserve
[Temporary mood, rejected ideas, sensitive material, or anything not worth carrying forward]

---

Use today's date. Be compressed and practical. This is a work log, not a diary.
Do not fabricate. If something wasn't discussed, leave the section as "None."
Do not include raw conversation — only structured output.`

  const conversationText = conversation
    .map(m => `${m.role === 'user' ? 'Director' : 'Umbruh'}: ${m.content}`)
    .join('\n\n')

  try {
    const base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
    const response = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'umbruh',
        stream: false,
        messages: [
          { role: 'system', content: bibliographerPrompt },
          { role: 'user', content: `Here is the session conversation:\n\n${conversationText}` }
        ]
      })
    })

    if (!response.ok) return res.status(500).json({ error: 'Ollama unavailable' })

    const data = await response.json()
    const entry = data.message?.content || ''
    if (!entry) return res.status(500).json({ error: 'No entry generated' })

    // Append to session log
    const existing = fs.readFileSync(logPath, 'utf8')
    // Insert after the header block, before the first --- separator that precedes the template comment
    const insertMarker = '\n\n---\n\n<!-- Add new sessions above this line'
    const insertPoint = existing.indexOf(insertMarker)
    let updated
    if (insertPoint !== -1) {
      updated = existing.slice(0, insertPoint) + '\n\n---\n\n' + entry.trim() + existing.slice(insertPoint)
    } else {
      updated = existing + '\n\n---\n\n' + entry.trim()
    }
    fs.writeFileSync(logPath, updated)
    res.json({ ok: true, entry })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Voice interface ──────────────────────────────────────────────────────────
function voicePinCheck(req, res) {
  const configPin = String(config.voicePin || '1234')
  const supplied = (req.headers['x-voice-pin'] || '').trim()
  if (supplied !== configPin) { res.status(401).json({ error: 'Invalid PIN' }); return false }
  return true
}

const VOICE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>Umbruh Voice v2</title>
<style>
:root{--bg:#0e0e0e;--surface:#1a1a1a;--green:#4a7c59;--green-dim:#2d4d38;--text:#e8e8e8;--text-dim:#888;}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
body{background:var(--bg);color:var(--text);font-family:-apple-system,sans-serif;height:100dvh;display:flex;flex-direction:column;overflow:hidden;}
#pin-screen{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100dvh;gap:20px;padding:40px;}
.sigil{font-size:52px;margin-bottom:4px;}
.title{font-size:26px;font-weight:300;letter-spacing:0.05em;}
.subtitle{font-size:14px;color:var(--text-dim);text-align:center;line-height:1.6;}
#pin-input{background:var(--surface);border:1px solid #333;border-radius:12px;color:var(--text);font-size:22px;padding:14px 20px;width:100%;max-width:280px;text-align:center;letter-spacing:0.3em;outline:none;-webkit-appearance:none;}
#pin-input:focus{border-color:var(--green);}
#pin-btn{background:var(--green);border:none;border-radius:12px;color:var(--text);font-size:16px;padding:14px 40px;cursor:pointer;width:100%;max-width:280px;font-weight:500;}
.pin-error{color:#e07070;font-size:14px;min-height:20px;text-align:center;}
#voice-screen{display:none;flex-direction:column;height:100dvh;}
.voice-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #222;flex-shrink:0;}
.voice-header .name{font-size:18px;font-weight:500;}
.status-row{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-dim);}
.dot{width:8px;height:8px;border-radius:50%;background:#555;transition:background 0.3s;}
.dot.listening{background:#4a9c59;animation:pulse 1s infinite;}
.dot.thinking{background:#9c7a3a;animation:pulse 0.7s infinite;}
.dot.speaking{background:#4a6a9c;animation:pulse 0.5s infinite;}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.5;transform:scale(1.3);}}
.conversation{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;-webkit-overflow-scrolling:touch;}
.bubble{max-width:85%;padding:10px 14px;border-radius:16px;font-size:15px;line-height:1.5;word-wrap:break-word;}
.bubble.user{background:var(--green-dim);align-self:flex-end;border-bottom-right-radius:4px;}
.bubble.umbruh{background:var(--surface);align-self:flex-start;border-bottom-left-radius:4px;}
.bubble.system{align-self:center;color:var(--text-dim);font-size:13px;font-style:italic;background:none;text-align:center;}
.voice-controls{padding:24px 20px;border-top:1px solid #222;display:flex;flex-direction:column;align-items:center;gap:14px;flex-shrink:0;}
#mic-btn{width:80px;height:80px;border-radius:50%;border:none;cursor:pointer;background:var(--green);display:flex;align-items:center;justify-content:center;font-size:32px;transition:background 0.2s,transform 0.1s;-webkit-user-select:none;user-select:none;}
#mic-btn:active{transform:scale(0.95);}
#mic-btn.listening{background:#8b3a3a;animation:mic-pulse 1s infinite;}
#mic-btn.disabled{background:#333;cursor:not-allowed;}
@keyframes mic-pulse{0%,100%{box-shadow:0 0 0 0 rgba(139,58,58,0.5);}70%{box-shadow:0 0 0 22px rgba(139,58,58,0);}}
.hint{font-size:13px;color:var(--text-dim);text-align:center;}
.settings-btn{background:none;border:none;color:var(--text-dim);font-size:18px;cursor:pointer;padding:4px 8px;line-height:1;}
.voice-panel{position:fixed;bottom:0;left:0;right:0;background:#111;border-top:1px solid #333;padding:20px;transform:translateY(100%);transition:transform 0.3s ease;z-index:20;}
.voice-panel.open{transform:translateY(0);}
.voice-panel h3{font-size:13px;color:var(--text-dim);margin-bottom:14px;font-weight:400;letter-spacing:0.05em;text-transform:uppercase;}
.voice-list{display:flex;flex-direction:column;gap:8px;max-height:45vh;overflow-y:auto;}
.voice-item{background:var(--bg);border:1px solid #2a2a2a;border-radius:8px;padding:10px 14px;font-size:14px;cursor:pointer;text-align:left;color:var(--text);}
.voice-item.selected{border-color:var(--green);color:var(--green);}
.panel-close{margin-top:14px;width:100%;background:#222;border:none;border-radius:8px;padding:11px;color:var(--text);font-size:15px;cursor:pointer;}
</style>
</head>
<body>

<div id="pin-screen">
  <div class="sigil">◈</div>
  <div class="title">Umbruh Voice</div>
  <div class="subtitle">Your private Heart/Mind AI.<br>Enter PIN to connect.</div>
  <input id="pin-input" type="tel" placeholder="PIN" maxlength="8" autocomplete="off"/>
  <button id="pin-btn" onclick="verifyPin()">Connect</button>
  <div class="pin-error" id="pin-error"></div>
</div>

<div id="voice-screen">
  <div class="voice-header">
    <div class="name">◈ Umbruh</div>
    <div style="display:flex;align-items:center;gap:12px;">
      <div class="status-row">
        <div class="dot" id="status-dot"></div>
        <span id="status-text">Ready</span>
      </div>
      <button class="settings-btn" id="settings-btn" title="Voice settings">⚙︎</button>
    </div>
  </div>
  <div class="voice-panel" id="voice-panel">
    <h3>Choose a voice</h3>
    <div class="voice-list" id="voice-list"></div>
    <button class="panel-close" id="panel-close">Done</button>
  </div>
  <div class="conversation" id="conversation"></div>
  <div class="voice-controls">
    <button id="mic-btn">🎤</button>
    <div class="hint" id="hint">Tap to speak</div>
    <div id="memory-status" style="font-size:12px;color:var(--text-dim);min-height:18px;"></div>
  </div>
</div>

<script>
// ── Global state ──
var pin = ''
var contextDocs = []
var messages = []
var recognition = null
var isListening = false
var isBusy = false
var audioCtx = null

// ── Utilities ──
function getAudioCtx() {
  if (!audioCtx) {
    var AC = window.AudioContext || window.webkitAudioContext
    if (AC) audioCtx = new AC()
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

function normalizeTranscript(text) {
  return text.replace(/\b(umbra|um bra|umbrae|amber|ambre|ambra|imbruh|embra|ombra)\b/gi, 'Umbruh')
}

function setHint(text) {
  var el = document.getElementById('hint')
  if (el) el.textContent = text
}

function setStatus(state, text) {
  var dot = document.getElementById('status-dot')
  var txt = document.getElementById('status-text')
  if (dot) dot.className = 'dot ' + (state || '')
  if (txt) txt.textContent = text || 'Ready'
}

function addBubble(role, text) {
  var conv = document.getElementById('conversation')
  if (!conv) return
  var div = document.createElement('div')
  div.className = 'bubble ' + role
  div.textContent = text
  conv.appendChild(div)
  conv.scrollTop = conv.scrollHeight
}

// ── PIN screen ──
async function verifyPin() {
  var btn = document.getElementById('pin-btn')
  var inp = document.getElementById('pin-input')
  var err = document.getElementById('pin-error')
  var entered = (inp.value || '').trim()
  if (!entered) { err.textContent = 'Enter your PIN'; return }
  btn.disabled = true
  btn.textContent = 'Connecting…'
  err.textContent = 'Reaching Nexus…'
  try {
    var ctrl = new AbortController()
    var tid = setTimeout(function() { ctrl.abort() }, 10000)
    var r = await fetch('/api/voice-context', {
      headers: { 'x-voice-pin': entered },
      signal: ctrl.signal
    })
    clearTimeout(tid)
    if (r.status === 401) {
      err.textContent = 'Wrong PIN'
      btn.disabled = false; btn.textContent = 'Connect'; return
    }
    if (!r.ok) {
      err.textContent = 'Server error ' + r.status
      btn.disabled = false; btn.textContent = 'Connect'; return
    }
    var data = await r.json()
    pin = entered
    contextDocs = data.docs || []
    sessionStorage.setItem('voice-pin', pin)
    showVoiceScreen()
  } catch(e) {
    err.textContent = e.name === 'AbortError' ? 'Timed out — is Nexus on?' : 'Error: ' + e.message
    btn.disabled = false; btn.textContent = 'Connect'
  }
}

// Auto-reconnect on load (plain callbacks — no async)
window.addEventListener('load', function() {
  var saved = sessionStorage.getItem('voice-pin')
  if (!saved) return
  document.getElementById('pin-input').value = saved
  document.getElementById('pin-error').textContent = 'Auto-connecting…'
  var ctrl = new AbortController()
  setTimeout(function() { ctrl.abort() }, 8000)
  fetch('/api/voice-context', { headers: { 'x-voice-pin': saved }, signal: ctrl.signal })
    .then(function(r) {
      if (!r.ok) { sessionStorage.removeItem('voice-pin'); document.getElementById('pin-error').textContent = ''; return }
      return r.json().then(function(data) {
        pin = saved; contextDocs = data.docs || []
        showVoiceScreen()
      })
    })
    .catch(function() { document.getElementById('pin-error').textContent = '' })
})

// ── Voice screen ──
function showVoiceScreen() {
  document.getElementById('pin-screen').style.display = 'none'
  document.getElementById('voice-screen').style.display = 'flex'
  addBubble('system', 'Connected.')
  initRecognition()
}

// ── Speech recognition ──
function initRecognition() {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) {
    addBubble('system', '⚠ Speech recognition not available in this browser.')
    document.getElementById('mic-btn').className = 'disabled'
    setHint('Not supported here')
    return
  }
  recognition = new SR()
  recognition.continuous = false
  recognition.interimResults = false
  recognition.lang = 'en-US'
  recognition.onstart = function() {
    isListening = true
    document.getElementById('mic-btn').classList.add('listening')
    document.getElementById('mic-btn').textContent = '⏹'
    setHint('Listening… tap to stop')
    setStatus('listening', 'Listening…')
  }
  recognition.onresult = function(e) {
    var raw = e.results[0][0].transcript.trim()
    var text = normalizeTranscript(raw)
    if (text) handleSpeech(text)
  }
  recognition.onerror = function(e) {
    resetMic()
    if (e.error !== 'no-speech' && e.error !== 'aborted') {
      addBubble('system', '⚠ Mic: ' + e.error)
    }
    setStatus('', 'Ready')
  }
  recognition.onend = function() {
    isListening = false
    resetMic()
  }
}

function resetMic() {
  var btn = document.getElementById('mic-btn')
  btn.classList.remove('listening')
  btn.textContent = '🎤'
  setHint(isBusy ? 'Wait…' : 'Tap to speak')
}

document.getElementById('mic-btn').addEventListener('click', function() {
  getAudioCtx()
  if (isBusy) { setHint('Wait…'); return }
  if (!recognition) { setHint('Mic not ready'); return }
  if (isListening) { recognition.stop(); return }
  try { recognition.start() } catch(e) { setHint('Mic error: ' + e.message) }
})

// ── Streaming speech handler ──
async function handleSpeech(text) {
  isBusy = true
  setStatus('thinking', 'Thinking…')
  setHint('Wait…')
  addBubble('user', text)
  messages.push({ role: 'user', content: text })

  var audioQueue = []
  var isPlaying = false
  var streamDone = false
  var fullText = ''

  function finishUp() {
    isBusy = false
    setStatus('', 'Ready')
    setHint('Tap to speak')
  }

  function playNext() {
    if (!audioQueue.length) {
      isPlaying = false
      if (streamDone) finishUp()
      return
    }
    isPlaying = true
    var b64 = audioQueue.shift()
    setStatus('speaking', 'Speaking…')
    var ctx = getAudioCtx()
    if (!ctx) { playNext(); return }
    try {
      var bytes = atob(b64)
      var arr = new Uint8Array(bytes.length)
      for (var i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
      ctx.decodeAudioData(arr.buffer.slice(0), function(buf) {
        var src = ctx.createBufferSource()
        src.buffer = buf
        src.connect(ctx.destination)
        src.onended = playNext
        src.start(0)
      }, function() { playNext() })
    } catch(e) { playNext() }
  }

  function enqueueAudio(b64) {
    audioQueue.push(b64)
    if (!isPlaying) playNext()
  }

  try {
    var resp = await fetch('/api/voice-relay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-voice-pin': pin },
      body: JSON.stringify({ messages: messages, contextDocs: contextDocs })
    })
    if (!resp.ok) throw new Error('Relay ' + resp.status)

    var reader = resp.body.getReader()
    var decoder = new TextDecoder()
    var sseBuffer = ''
    var reading = true

    while (reading) {
      var chunk = await reader.read()
      if (chunk.done) { reading = false }
      if (chunk.value) { sseBuffer += decoder.decode(chunk.value, { stream: true }) }
      var lines = sseBuffer.split('\n')
      sseBuffer = lines.pop()
      for (var li = 0; li < lines.length; li++) {
        var line = lines[li]
        if (line.indexOf('data: ') !== 0) continue
        var evt = null
        try { evt = JSON.parse(line.slice(6)) } catch(e) { evt = null }
        if (!evt) continue
        if (evt.type === 'status') {
          setStatus('thinking', evt.text)
        } else if (evt.type === 'audio') {
          if (evt.audio) enqueueAudio(evt.audio)
        } else if (evt.type === 'done') {
          fullText = evt.content
          messages.push({ role: 'assistant', content: fullText })
          addBubble('umbruh', fullText)
          streamDone = true
          if (!isPlaying) finishUp()
        } else if (evt.type === 'error') {
          addBubble('system', '⚠ ' + evt.error)
          isBusy = false; setStatus('', 'Ready'); setHint('Tap to speak')
        }
      }
    }
  } catch(e) {
    addBubble('system', '⚠ ' + e.message)
    isBusy = false; setStatus('', 'Ready'); setHint('Tap to speak')
  }
}
</script>
</body>
</html>`

// POST /api/voice-memory — PIN-protected, extracts key facts and writes to umbruh-voice-memory.md
app.post('/api/voice-memory', async (req, res) => {
  if (!voicePinCheck(req, res)) return
  const { conversation } = req.body
  if (!conversation?.length) return res.status(400).json({ error: 'conversation required' })

  const ollamaUrl = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '')
  const convText = conversation.map(m => `${m.role === 'user' ? 'Director' : 'Umbruh'}: ${m.content}`).join('\n')

  try {
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'umbruh',
        stream: false,
        messages: [
          { role: 'system', content: 'You extract durable facts from conversations for a persistent memory file. Output ONLY a bullet list of facts. Each line starts with "- ". Be direct and specific — include exact values, names, preferences, and secrets shared. No commentary, no hedging, no intro text.' },
          { role: 'user', content: `Extract every fact, preference, and personal detail worth saving from this conversation:\n\n${convText}` }
        ]
      })
    })
    if (!response.ok) return res.status(502).json({ error: 'Ollama unavailable' })
    const data = await response.json()
    const extracted = (data.message?.content || '').trim()
    if (!extracted) return res.status(500).json({ error: 'Nothing extracted' })

    // Write to dedicated short memory file — not buried in the longer context doc
    const memPath = path.join(REPO, 'agents/umbruh/umbruh-voice-memory.md')
    const date = new Date().toISOString().slice(0, 10)
    const header = fs.existsSync(memPath) ? '' : '# Umbruh Voice Memory\n\nFacts saved from previous voice sessions.\nWhen the Director asks about anything here, quote it directly and precisely.\n\n'
    const entry = `\n## ${date}\n\n${extracted}\n`
    fs.appendFileSync(memPath, header + entry)
    res.json({ ok: true, saved: extracted })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /tts-voices — lists all voices installed via `say`
app.get('/tts-voices', (_req, res) => {
  try {
    const out = execFileSync('/usr/bin/say', ['--voice', '?']).toString()
    res.setHeader('Content-Type', 'text/plain')
    res.send(out)
  } catch(e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /tts-test.wav — voice test; open on phone to confirm voice quality
app.get('/tts-test.wav', (_req, res) => {
  try {
    const tmpWav = '/tmp/umbruh-tts-test.wav'
    const piperModel = path.join(os.homedir(), 'Library/Application Support/umbruh-voice/en_US-ryan-high.onnx')
    if (fs.existsSync(piperModel)) {
      execSync(`python3 -m piper --model '${piperModel}' --output_file '${tmpWav}'`, {
        input: 'This is Umbruh, speaking with the Piper Ryan voice. How does this sound?\n',
        timeout: 15000
      })
    } else {
      const tmpAiff = '/tmp/umbruh-tts-test.aiff'
      execFileSync('/usr/bin/say', ['-v', 'Daniel', '-o', tmpAiff, 'Piper not installed yet — run install-piper to activate the neural voice.'])
      execFileSync('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16@22050', tmpAiff, tmpWav])
      try { fs.unlinkSync(tmpAiff) } catch {}
    }
    res.setHeader('Content-Type', 'audio/wav')
    res.send(fs.readFileSync(tmpWav))
    try { fs.unlinkSync(tmpWav) } catch {}
  } catch(e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /voice — mobile voice UI (no-cache so phone always gets fresh code)
app.get('/voice', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.send(VOICE_HTML)
})

// GET /api/voice-context — PIN-protected, returns Umbruh context doc content
app.get('/api/voice-context', (req, res) => {
  if (!voicePinCheck(req, res)) return
  const umbruhModel = (config.models || []).find(m => m.id === 'umbruh')
  const docs = []
  for (const docPath of (umbruhModel?.defaultDocs || [])) {
    const fullPath = path.join(REPO, docPath)
    const content = readFileSafe(fullPath)
    if (content) docs.push({ title: path.basename(docPath, '.md'), content })
  }
  res.json({ docs })
})

// ─── Umbruh tool definitions ──────────────────────────────────────────────────
const UMBRUH_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'run_bash',
      description: 'Execute a bash command on the Director\'s Mac. Use for running scripts, checking system state, managing files, interacting with Ollama, or any terminal task.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The bash command to execute' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file on the Mac.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or ~-relative file path' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write or overwrite a file on the Mac.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetch a web page and return its text content.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_app',
      description: 'Open a macOS application by name.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'App name as it appears in /Applications (e.g. "Spotify", "Safari")' }
        },
        required: ['name']
      }
    }
  }
]

async function executeTool(name, args) {
  console.log(`[Umbruh tool] ${name}:`, JSON.stringify(args).slice(0, 200))
  const safeEnv = { ...process.env, HOME: os.homedir(), PATH: '/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:/usr/sbin' }
  try {
    switch (name) {
      case 'run_bash': {
        const out = execSync(args.command, { timeout: 30000, encoding: 'utf8', env: safeEnv, stdio: ['pipe', 'pipe', 'pipe'] })
        return { success: true, output: out.slice(0, 8000) }
      }
      case 'read_file': {
        const p = args.path.replace(/^~/, os.homedir())
        return { success: true, content: fs.readFileSync(p, 'utf8').slice(0, 10000) }
      }
      case 'write_file': {
        const p = args.path.replace(/^~/, os.homedir())
        fs.mkdirSync(path.dirname(p), { recursive: true })
        fs.writeFileSync(p, args.content, 'utf8')
        return { success: true, message: `Written: ${p}` }
      }
      case 'fetch_url': {
        const r = await fetch(args.url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
        const html = await r.text()
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 8000)
        return { success: true, content: text }
      }
      case 'open_app': {
        execFileSync('/usr/bin/open', ['-a', args.name])
        return { success: true, message: `Opened ${args.name}` }
      }
      default:
        return { success: false, error: `Unknown tool: ${name}` }
    }
  } catch (e) {
    return { success: false, error: e.message, stderr: e.stderr?.toString().slice(0, 1000) }
  }
}

async function runAgentLoop(messages, ollamaUrl, maxSteps = 8, useTools = true) {
  const msgs = [...messages]
  for (let i = 0; i < maxSteps; i++) {
    const body = { model: 'umbruh', messages: msgs, stream: false }
    if (useTools) body.tools = UMBRUH_TOOLS
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!response.ok) throw new Error(`Ollama ${response.status}`)
    const data = await response.json()
    const msg = data.message
    msgs.push(msg)
    if (!msg.tool_calls?.length) return msg.content || ''
    for (const tc of msg.tool_calls) {
      const result = await executeTool(tc.function.name, tc.function.arguments)
      msgs.push({ role: 'tool', content: JSON.stringify(result) })
    }
  }
  return 'I hit my step limit. Try breaking the task into smaller pieces.'
}

const safeJson = (s) => { try { return JSON.parse(s) } catch { return null } }

// Anthropic wants {name, description, input_schema}; UMBRUH_TOOLS is OpenAI-shaped.
const ANTHROPIC_TOOLS = UMBRUH_TOOLS.map(t => ({
  name: t.function.name,
  description: t.function.description,
  input_schema: t.function.parameters,
}))

// ─── Multi-provider agentic loop: any model + Umbruh's tools ─────────────────
// Generalizes the Ollama-only runAgentLoop so ANY backend — Umbruh's persona on
// local or cloud, or any worker model — can call the same tools (run_bash,
// read_file, write_file, fetch_url, open_app). Bounded by maxSteps. Calls
// onTool({tool,args,result}) after each tool call so the Sandbox can show the work.
// Returns the model's final text.
async function callModelAgentic(modelConfig, systemContent, task, onTool = () => {}, maxSteps = 6) {
  const provider = modelConfig.provider
  const persona = loadPersona(modelConfig)
  const system = [persona, systemContent].filter(Boolean).join('\n\n') || undefined

  if (provider === 'ollama') {
    const base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
    const msgs = []
    if (system) msgs.push({ role: 'system', content: system })
    msgs.push({ role: 'user', content: task })
    for (let i = 0; i < maxSteps; i++) {
      const r = await fetch(`${base}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelConfig.model, messages: msgs, stream: false, keep_alive: 0, tools: UMBRUH_TOOLS }),
      })
      if (!r.ok) throw new Error(`Ollama ${r.status}: is Ollama running?`)
      const msg = (await r.json()).message || {}
      msgs.push(msg)
      if (!msg.tool_calls?.length) return (msg.content || '').trim()
      for (const tc of msg.tool_calls) {
        const args = typeof tc.function.arguments === 'string' ? (safeJson(tc.function.arguments) || {}) : (tc.function.arguments || {})
        const result = await executeTool(tc.function.name, args)
        onTool({ tool: tc.function.name, args, result })
        msgs.push({ role: 'tool', content: JSON.stringify(result) })
      }
    }
    return '[reached tool-step limit]'
  }

  if (provider === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set')
    const msgs = [{ role: 'user', content: task }]
    for (let i = 0; i < maxSteps; i++) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: modelConfig.model, max_tokens: 4096, system, tools: ANTHROPIC_TOOLS, messages: msgs }),
      })
      if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`)
      const data = await r.json()
      const blocks = data.content || []
      msgs.push({ role: 'assistant', content: blocks })
      const toolUses = blocks.filter(b => b.type === 'tool_use')
      if (data.stop_reason !== 'tool_use' || !toolUses.length) {
        return blocks.filter(b => b.type === 'text').map(b => b.text).join('').trim()
      }
      const toolResults = []
      for (const tu of toolUses) {
        const result = await executeTool(tu.name, tu.input || {})
        onTool({ tool: tu.name, args: tu.input, result })
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) })
      }
      msgs.push({ role: 'user', content: toolResults })
    }
    return '[reached tool-step limit]'
  }

  if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set')
    const msgs = []
    if (system) msgs.push({ role: 'system', content: system })
    msgs.push({ role: 'user', content: task })
    for (let i = 0; i < maxSteps; i++) {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: modelConfig.model, messages: msgs, tools: UMBRUH_TOOLS }),
      })
      if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`)
      const msg = (await r.json()).choices?.[0]?.message || {}
      msgs.push(msg)
      if (!msg.tool_calls?.length) return (msg.content || '').trim()
      for (const tc of msg.tool_calls) {
        const args = safeJson(tc.function.arguments) || {}
        const result = await executeTool(tc.function.name, args)
        onTool({ tool: tc.function.name, args, result })
        msgs.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
      }
    }
    return '[reached tool-step limit]'
  }

  if (provider === 'claude-code') {
    // Claude Code carries its own tool layer; for the sandbox MVP we use it as a
    // reasoning provider only. Route tool-heavy subtasks to a local model instead.
    return await callModel(modelConfig, systemContent, [{ role: 'user', content: task }])
  }
  throw new Error(`Agentic loop: unsupported provider ${provider}`)
}

// ─── TTS helpers ─────────────────────────────────────────────────────────────

const PIPER_BIN = '/Users/goose/Library/Python/3.9/bin/piper'
const PIPER_MODEL = path.join(os.homedir(), 'Library/Application Support/umbruh-voice/en_US-ryan-high.onnx')

async function generateTTS(text) {
  if (!text || !text.trim()) return null
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const tmpWav = `/tmp/umbruh-tts-${id}.wav`
  try {
    if (fs.existsSync(PIPER_MODEL)) {
      execSync(`${PIPER_BIN} --model '${PIPER_MODEL}' --output_file '${tmpWav}'`, {
        input: text.trim() + '\n',
        timeout: 30000
      })
    } else {
      const tmpAiff = `/tmp/umbruh-tts-${id}.aiff`
      execFileSync('/usr/bin/say', ['-v', 'Daniel', '-o', tmpAiff, text.trim()])
      execFileSync('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16@22050', tmpAiff, tmpWav])
      try { fs.unlinkSync(tmpAiff) } catch {}
    }
    const wav = fs.readFileSync(tmpWav)
    try { fs.unlinkSync(tmpWav) } catch {}
    return wav.toString('base64')
  } catch (e) {
    console.error('[TTS] error for:', text.slice(0, 60), e.message)
    try { fs.unlinkSync(tmpWav) } catch {}
    return null
  }
}

// Split a completed text block into sentences
function splitIntoSentences(text) {
  return text.split(/(?<=[.!?])\s+/).filter(s => s.trim())
}

// Split a streaming buffer: return complete sentences + remaining fragment
function extractCompleteSentences(text) {
  const parts = text.split(/(?<=[.!?])\s+/)
  if (parts.length <= 1) return { complete: [], remaining: text }
  return { complete: parts.slice(0, -1), remaining: parts[parts.length - 1] }
}

// POST /api/voice-relay — PIN-protected, sentence-level streaming TTS
app.post('/api/voice-relay', async (req, res) => {
  if (!voicePinCheck(req, res)) return
  const { messages, contextDocs } = req.body
  if (!messages?.length) return res.status(400).json({ error: 'messages required' })
  const ollamaUrl = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '')

  // Load Umbruh's Modelfile SYSTEM block
  let modelfileSystem = ''
  const modelfilePath = path.join(REPO, 'agents/umbruh/Modelfile')
  if (fs.existsSync(modelfilePath)) {
    const mf = readFileSafe(modelfilePath) || ''
    const sysMatch = mf.match(/SYSTEM\s+"""([\s\S]*?)"""/)
    if (sysMatch) modelfileSystem = sysMatch[1].trim()
  }

  // Load short-term voice memory
  let voiceMemory = ''
  const voiceMemPath = path.join(REPO, 'agents/umbruh/umbruh-voice-memory.md')
  if (fs.existsSync(voiceMemPath)) voiceMemory = (readFileSafe(voiceMemPath) || '').trim()

  // Build system: voice override → personality → memory → context docs
  const voiceModeOverride = `ACTIVE MODE: VOICE SESSION

You are speaking aloud to the Director via a mobile voice interface. Different rules apply here:

1. MEMORY IS AUTOMATIC. The interface handles all memory saving without your involvement. Do NOT mention context patches, propose approval workflows, ask for permission to save, or use phrases like "shall I propose a context patch." When the Director shares something, simply receive it naturally and continue the conversation.
2. BE CONCISE. You are speaking, not writing. Keep responses to 2-4 sentences unless depth is clearly called for. No bullet points. No headers.
3. CONVERSATIONAL TONE. Warm, direct, present. This is a conversation, not a document.`

  const memoryBlock = voiceMemory
    ? `SAVED MEMORIES FROM PREVIOUS SESSIONS:\nQuote these directly and precisely when the Director asks about them.\n\n${voiceMemory}`
    : ''
  const contextContent = (contextDocs || []).map(d => `--- ${d.title} ---\n${d.content}`).join('\n\n')
  const systemContent = [voiceModeOverride, modelfileSystem, memoryBlock, contextContent].filter(Boolean).join('\n\n---\n\n')

  const ollamaMessages = [
    ...(systemContent ? [{ role: 'system', content: systemContent }] : []),
    ...messages
  ]

  // SSE stream setup
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const send = (data) => res.write('data: ' + JSON.stringify(data) + '\n\n')

  try {
    const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content?.toLowerCase() || ''
    const needsTools = /\b(open|run|execute|find|search|write|read|fetch|go to|check|list|create|delete|move|copy|install|launch|browse|look up|show me|get me|update|edit|save)\b/.test(lastUserMsg)

    let fullText = ''

    if (needsTools) {
      // Tool path: run full agent loop, then stream TTS sentence by sentence
      send({ type: 'status', text: 'Working…' })
      const reply = await runAgentLoop(ollamaMessages, ollamaUrl, 8, true)
      fullText = reply
      for (const sentence of splitIntoSentences(reply)) {
        const audio = await generateTTS(sentence)
        if (audio) send({ type: 'audio', text: sentence, audio })
      }
    } else {
      // Conversational path: stream Ollama tokens, TTS each sentence on detection
      const ollamaRes = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'umbruh', messages: ollamaMessages, stream: true })
      })
      if (!ollamaRes.ok) throw new Error(`Ollama ${ollamaRes.status}`)

      const reader = ollamaRes.body.getReader()
      const decoder = new TextDecoder()
      let jsonBuf = ''
      let sentenceBuf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        jsonBuf += decoder.decode(value, { stream: true })
        const lines = jsonBuf.split('\n')
        jsonBuf = lines.pop()

        for (const line of lines) {
          if (!line.trim()) continue
          let chunk
          try { chunk = JSON.parse(line) } catch { continue }

          const token = chunk.message?.content || ''
          sentenceBuf += token
          fullText += token

          const { complete, remaining } = extractCompleteSentences(sentenceBuf)
          for (const sentence of complete) {
            if (sentence.trim()) {
              const audio = await generateTTS(sentence)
              if (audio) send({ type: 'audio', text: sentence, audio })
            }
          }
          sentenceBuf = remaining

          // Flush final fragment when Ollama signals done
          if (chunk.done && sentenceBuf.trim()) {
            const audio = await generateTTS(sentenceBuf.trim())
            if (audio) send({ type: 'audio', text: sentenceBuf.trim(), audio })
          }
        }
      }
    }

    send({ type: 'done', content: fullText })
  } catch (e) {
    console.error('[voice-relay] error:', e.message)
    send({ type: 'error', error: e.message })
  }

  res.end()
})

// ─── Telegram bot (SFS status feed + remote control) ─────────────────────────
// Registered before the SPA fallback so /api/notify resolves correctly.
try {
  const tgOllamaUrl = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '')
  initTelegram({ app, config, REPO, readFileSafe, runAgentLoop, generateTTS, ollamaUrl: tgOllamaUrl })
} catch (e) {
  console.error('[Telegram] init failed:', e.message)
}

// ─── serve built React app in production ─────────────────────────────────────
// In dev, Vite serves on 5173. In production (packaged app), Express serves
// the pre-built dist/ folder on the same port as the API.
const distDir = path.join(__dirname, 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  // SPA fallback — any non-API route serves index.html
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

// ─── start ──────────────────────────────────────────────────────────────────
app.listen(3001, () => {
  console.log('Goose Director API running on http://localhost:3001')
  console.log('Repo path:', REPO, fs.existsSync(REPO) ? '✓ found' : '✗ not found — using static data')
})
