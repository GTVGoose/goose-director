import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import os from 'os'
import yaml from 'js-yaml'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import { execFileSync, execSync, spawn } from 'child_process'
import { initTelegram } from './telegram.mjs'
import { initSignal } from './signal.mjs'
import { initGate } from './gate.mjs'
import { initBrain } from './brain.mjs'
// General-use engine routes (2026-07-14 lineage sync from the nexus-product
// general-use build): capability manifest, skills, routing policies, artifacts,
// projects, memory, runs, Agentic System Builder. Self-contained module.
import { registerGeneralUseRoutes, generalUseStores } from './src/generaluse-routes.mjs'
import { roleForPhase } from './src/lib/run-roles.js'
import { applyRoutingPolicy } from './src/lib/routing-policies.js'

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
let REPO = config.repoPath

// Local Umbruh model resolution (fix 2026-07-03): the old hardcoded 'umbruh'
// model name died when the 32B host was scratched on 2026-07-01 — Ollama 404'd
// on every agent-loop call, which is why Telegram went one-way (transcript echo,
// then silence). Resolve to what is actually installed; override via UMBRUH_MODEL.
const UMBRUH_MODEL = process.env.UMBRUH_MODEL || config.umbruhLocalModel || 'umbruh-lite'

// Sandbox permission gate (shared core). Personal installs without a sandbox
// block default to ENABLED; product builds ship { enabled: false } and the
// user consents in Settings → Sandbox.
function sandboxEnabled() { return config.sandbox ? !!config.sandbox.enabled : true }
function sandboxModel() { return config.sandbox?.model || config.sandboxModel || UMBRUH_MODEL }

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

// Resolve secrets from the macOS Keychain when a .env didn't provide them — keeps
// API keys/tokens out of any plaintext file. Store one with:
//   security add-generic-password -U -a "$USER" -s ANTHROPIC_API_KEY -w '<value>'
try {
  for (const key of ['ANTHROPIC_API_KEY', 'TELEGRAM_BOT_TOKEN', 'NOTIFY_SECRET', 'NEXUS_MOBILE_PIN']) {
    if (process.env[key]) continue
    try {
      const v = execFileSync('/usr/bin/security',
        ['find-generic-password', '-a', process.env.USER || os.userInfo().username, '-s', key, '-w'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      if (v) { process.env[key] = v; console.log('[ENV] Loaded', key, 'from Keychain') }
    } catch { /* not in Keychain — leave unset */ }
  }
} catch {}


const app = express()
// Reject case-variant paths (/API/sandbox) outright instead of letting them
// match a lowercase route — hardens the remote-access gateway below.
app.set('case sensitive routing', true)

// CORS lock (2026-07-03): the console is only ever reached same-origin (packaged
// app serves the UI from this same port) or via vite's server-side dev proxy —
// a browser never legitimately makes a cross-origin call here. So we reflect ONLY
// same-origin/non-browser requests (no Origin header) and localhost/127.0.0.1
// origins. This kills the drive-by attack where any website you have open runs
// fetch('http://127.0.0.1:3001/api/file?p=...') and reads your private domain
// data out of the response. Pair with the path-traversal guard below.
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
app.use(cors({
  origin(origin, cb) {
    if (!origin || LOCALHOST_ORIGIN.test(origin)) return cb(null, true)
    return cb(null, false) // not an error, just no CORS headers → browser withholds the response
  },
}))
app.use(express.json())

// ─── Remote-access gateway (plan 2026-07-11 §3f) ─────────────────────────────
// `tailscale serve` proxies tailnet traffic to this loopback port and stamps
// X-Forwarded-For / Tailscale-User-Login headers; direct loopback traffic
// (Electron, vite proxy, local curl) has neither. Requests arriving through
// the proxy may ONLY reach the mini-Nexus mobile surface, and every mobile
// API call must carry the PIN — endpoints that assumed "server is loopback-
// only" (relay, sandbox, settings, sync-ui, …) stay loopback-only even if
// serve is configured to expose the whole origin.
const MOBILE_API_ALLOW = [
  /^\/api\/chat(\/|$)/,          // job submit / stream / job / history / reset
  /^\/api\/events$/,
  /^\/api\/domains$/,            // read: domain map
  /^\/api\/domains\/observe$/,   // write: quick-append (idempotent)
  /^\/api\/file$/,               // read: doc content (repo-scoped + traversal-guarded)
  /^\/api\/transcribe$/,
  /^\/api\/voice-(relay|context|memory)$/,
  /^\/api\/health$/,             // reachability probe (no data)
]
app.use((req, res, next) => {
  const proxied = !!(req.headers['x-forwarded-for'] || req.headers['tailscale-user-login'])
  if (!proxied) return next()                          // local traffic: unchanged
  // Express matches routes case-INsensitively by default, so we MUST compare
  // against a lowercased path — otherwise `/API/sandbox` slips past a
  // case-sensitive `/api` prefix test and still hits the real lowercase route
  // with no allowlist and no PIN. (case-sensitive routing is also enabled
  // below as belt-and-suspenders.)
  const p = req.path.toLowerCase()
  if (!p.startsWith('/api')) return next()             // static shell/assets are fine
  const allowed = MOBILE_API_ALLOW.some(re => re.test(p))
  if (!allowed) return res.status(403).json({ error: 'loopback-only endpoint' })
  if (p === '/api/health') return next()               // probe stays PIN-free (returns no data)
  if (!mobileAuthCheck(req, res)) return
  next()
})

// ─── helpers ────────────────────────────────────────────────────────────────

function readFileSafe(filePath) {
  try { return fs.readFileSync(filePath, 'utf8') } catch { return null }
}

// Resolve a caller-supplied relative path against a trusted base and refuse
// anything that escapes it (path traversal). Returns the absolute path, or null
// if `relPath` climbs out of `base` (e.g. '../../etc/passwd') or is absolute.
// This is what keeps /api/file scoped to the connected repo — without it, the
// private, gitignored domain data (health/finance) under REPO could be read by
// walking up and back down anywhere on disk.
function resolveInside(base, relPath) {
  if (!base || typeof relPath !== 'string') return null
  const baseResolved = path.resolve(base)
  const full = path.resolve(baseResolved, relPath)
  if (full !== baseResolved && !full.startsWith(baseResolved + path.sep)) return null
  return full
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

// Split a markdown document into H2 sections: [{ heading, body }]
function splitMdSections(text) {
  const sections = []
  let cur = null
  for (const line of text.split('\n')) {
    const m = line.match(/^##\s+(.+)/)
    if (m) {
      if (cur) sections.push(cur)
      cur = { heading: m[1].trim(), body: '' }
    } else if (cur) {
      cur.body += line + '\n'
    }
  }
  if (cur) sections.push(cur)
  return sections
    .map(s => ({ heading: s.heading, body: s.body.replace(/^---\s*$/gm, '').trim() }))
    .filter(s => s.body)
}

// Parse every pipe table in a markdown string → [{ headers, rows: [{col: val}] }]
function splitTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')
    .map(c => c.trim().replace(/\*\*/g, ''))
}
function parseMdTables(text) {
  const tables = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].trim().startsWith('|')) continue
    if (!/^\s*\|[\s:|-]+\|?\s*$/.test(lines[i + 1] || '')) continue
    const headers = splitTableRow(lines[i])
    const rows = []
    let j = i + 2
    while (j < lines.length && lines[j].trim().startsWith('|')) {
      const cells = splitTableRow(lines[j])
      const row = {}
      headers.forEach((h, k) => { row[h] = (cells[k] || '').trim() })
      rows.push(row)
      j++
    }
    tables.push({ headers, rows })
    i = j - 1
  }
  return tables
}

// ─── vault adapters ──────────────────────────────────────────────────────────
// Nexus can harness different vault layouts. Detection is by marker files:
//   goose   — registry/agent-registry.md or agents/ with AGENT.md charters
//   sfs     — _system/orchestration/agent-registry.md (SFS-Vault-style studio vault)
//   generic — anything else (best-effort scan for an agent registry table)
function detectVaultType(root) {
  if (!root || !fs.existsSync(root)) return null
  if (fs.existsSync(path.join(root, 'registry', 'agent-registry.md'))) return 'goose'
  if (fs.existsSync(path.join(root, '_system', 'orchestration', 'agent-registry.md'))) return 'sfs'
  if (fs.existsSync(path.join(root, config.agentsDir || 'agents'))) return 'goose'
  return 'generic'
}

function vaultDisplayName(root, type) {
  if (!root || !type) return null
  if (type === 'goose') return 'Goose Agent System'
  // Prefer the vault's own H1 (AGENTS.md or README.md), else folder name
  for (const f of ['AGENTS.md', 'README.md']) {
    const text = readFileSafe(path.join(root, f))
    const h1 = text && text.match(/^#\s+(.+)/m)
    if (h1) return h1[1].replace(/—.*$/, '').replace(/\(.*?\)/g, '').trim()
  }
  return path.basename(root)
}

// Recursively collect .md files under a directory (bounded depth)
function collectMdFiles(dir, depth = 3) {
  const out = []
  if (depth < 0 || !fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectMdFiles(full, depth - 1))
    else if (entry.name.endsWith('.md')) out.push(full)
  }
  return out
}


// Fallback posture from type text when no explicit mapping exists
function loosePosture(type) {
  const t = (type || '').toLowerCase()
  if (t.includes('(sub)') || t.includes('archetype')) return 'Passive'
  if (t.includes('meta')) return 'Recursive'
  return null
}

// One-line operational identity from a registry row (used when a charter
// can't be narrowed to this agent, e.g. class-bundle charters)
function composeRegistrySummary(agent) {
  const bits = []
  if (agent.platform || agent.model) bits.push(`Runs on ${[agent.platform, agent.model].filter(Boolean).join(' / ')}.`)
  if (agent.role) bits.push(`Registered role: ${agent.role}.`)
  if (agent.owner) bits.push(`Owned by ${agent.owner} — inherits that member's permission tier${agent.authority ? ` (${agent.authority})` : ''}.`)
  if (agent.canonStatus) bits.push(`Status: ${agent.canonStatus}.`)
  return bits.join(' ')
}

const TYPE_POSTURE = {
  'Archetype': 'Active',
  'Operational': 'Active',
  'Operational (companion)': 'Active',
  'Operational(meta)': 'Recursive',
  'Meta-Evaluator': 'Passive',
  'Operational(sub)': 'Passive',
}

// goose adapter — registry/agent-registry.md is authoritative; charters enrich
function loadGooseAgents(root) {
  const agents = []
  const agentsRoot = path.join(root, config.agentsDir || 'agents')

  // Map agent IDs → charter file. Priority: id in filename → "**Agent ID:** id"
  // field → first body mention. Index/readme files mention every id — skip them.
  const byFilename = {}
  const byField = {}
  const byMention = {}
  const charterByName = {}
  const scanned = []   // retained for name-based fallback (class bundles have no ids)
  for (const file of collectMdFiles(agentsRoot)) {
    const base = path.basename(file)
    if (/^(INDEX|README)\.md$/i.test(base)) continue
    const head = readFileSafe(file) || ''
    scanned.push({ file, text: head })
    for (const id of base.match(/\b(?:AGT|TRI|SIG)-[A-Z]+-\d+\b/g) || []) {
      if (!byFilename[id]) byFilename[id] = file
    }
    for (const m of head.matchAll(/\*\*Agent(?: ID)?:\*\*\s*((?:AGT|TRI|SIG)-[A-Z]+-\d+)/g)) {
      if (!byField[m[1]]) byField[m[1]] = file
    }
    for (const id of head.match(/\b(?:AGT|TRI|SIG)-[A-Z]+-\d+\b/g) || []) {
      if (!byMention[id]) byMention[id] = file
    }
    const h1 = head.match(/^#\s+(.+)/m)
    if (h1) charterByName[h1[1].replace(/—.*$/, '').trim().toLowerCase()] = file
  }
  const charterById = {}
  for (const map of [byMention, byField, byFilename]) {
    Object.assign(charterById, map)
  }

  const regText = readFileSafe(path.join(root, 'registry', 'agent-registry.md'))
  if (regText) {
    for (const table of parseMdTables(regText)) {
      if (!table.headers.includes('agent_id') || !table.headers.includes('agent_name')) continue
      for (const row of table.rows) {
        const id = row.agent_id
        if (!id || !/^(AGT|TRI|SIG)-/.test(id)) continue
        if (agents.find(a => a.id === id)) continue
        const name = (row.agent_name || id).replace(/\(.*?\)/g, '').trim()
        const type = row.type || 'Unknown'
        const mapEntry = POSTURE_MAP[name]
          || Object.entries(POSTURE_MAP).find(([k]) => name.includes(k))?.[1]
        let charterPath = charterById[id] || charterByName[name.toLowerCase()] || null
        // Class bundles (e.g. the subagent charter) reference members by bold
        // name only — no ids. Fall back to a bold-name content match and mark
        // the charter as shared so the detail view treats it as a class file.
        let charterShared = false
        if (!charterPath) {
          const hit = scanned.find(s => s.text.includes(`**${name}**`))
          if (hit) { charterPath = hit.file; charterShared = true }
        }
        const charterHead = charterPath ? (readFileSafe(charterPath) || '').slice(0, 3000) : ''
        agents.push({
          id,
          name,
          posture: (charterHead && extractMdField(charterHead, 'Operational Posture'))
            || mapEntry?.posture || TYPE_POSTURE[type] || loosePosture(type) || 'Unknown',
          type,
          role: row.role || null,
          authority: row.authority || null,
          owner: row.owner || null,
          platform: row.platform || null,
          model: row.model || null,
          canonStatus: row.status || 'active',
          sigil: (charterHead && extractMdField(charterHead, 'Primary Sigil Alignment')) || 'N/A',
          source: 'live',
          charterShared,
          path: charterPath ? path.relative(root, charterPath) : null,
        })
      }
    }
  }

  // Legacy layout fallback/merge: agents/<dir>/AGENT.md
  if (fs.existsSync(agentsRoot)) {
    for (const dir of fs.readdirSync(agentsRoot, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)) {
      const agentFile = path.join(agentsRoot, dir, 'AGENT.md')
      const text = readFileSafe(agentFile)
      if (!text) continue
      const rawName = extractMdField(text, 'Agent') || extractMdField(text, 'Name') || dir
      const displayName = rawName.replace(/^(AGT-\S+\s+—\s+)/, '').replace(/\sv\d+\.\d+$/, '').trim()
      const legacyId = (extractMdField(text, 'Agent ID') || '').match(/(?:AGT|TRI|SIG)-[A-Z]+-\d+/)?.[0] || null
      if (agents.find(a =>
        a.name.toLowerCase() === displayName.toLowerCase()
        || (legacyId && a.id === legacyId)
        || a.path === path.relative(root, agentFile))) continue
      const mapEntry = POSTURE_MAP[displayName]
        || Object.entries(POSTURE_MAP).find(([k]) => displayName.includes(k))?.[1] || {}
      agents.push({
        id: legacyId,
        name: displayName,
        posture: extractMdField(text, 'Operational Posture') || mapEntry.posture || 'Unknown',
        type: extractMdField(text, 'Agent Type') || mapEntry.type || 'Unknown',
        canonStatus: extractMdField(text, 'Canon Status') || 'Development',
        sigil: extractMdField(text, 'Primary Sigil Alignment') || 'N/A',
        source: 'live',
        path: path.relative(root, agentFile),
      })
    }
  }

  return agents
}

// sfs adapter — _system/orchestration/agent-registry.md live identity table
const SFS_ROLE_POSTURE = {
  orchestrator: 'Recursive',
  dispatcher: 'Recursive',
  builder: 'Active',
  contributor: 'Active',
  integrator: 'Active',
  researcher: 'Passive',
  reviewer: 'Passive',
  librarian: 'Passive',
}
function loadSfsAgents(root) {
  const text = readFileSafe(path.join(root, '_system', 'orchestration', 'agent-registry.md'))
  if (!text) return []
  // Only the live identity directory (has owner + agent_name); skip
  // cascade-temporary tables whose headers differ.
  const table = parseMdTables(text).find(t =>
    t.headers.includes('agent_id') && t.headers.includes('agent_name') && t.headers.includes('owner'))
  if (!table) return []
  return table.rows.filter(r => r.agent_id).map(row => ({
    id: row.agent_id,
    name: row.agent_name || row.agent_id,
    posture: SFS_ROLE_POSTURE[(row.role || '').toLowerCase()] || 'Active',
    type: row.role ? row.role.charAt(0).toUpperCase() + row.role.slice(1) : 'Unknown',
    role: row.role || null,
    authority: row.tier || null,
    owner: row.owner || null,
    platform: row.platform || null,
    model: row.model || null,
    canonStatus: row.status || 'active',
    sigil: 'N/A',
    source: 'live',
    path: '_system/orchestration/agent-registry.md',
  }))
}

// generic adapter — best effort: any *.md under agents/ or an agent-registry table
function loadGenericAgents(root) {
  for (const rel of ['agent-registry.md', 'agents.md', 'AGENTS.md']) {
    const text = readFileSafe(path.join(root, rel))
    if (!text) continue
    const table = parseMdTables(text).find(t => t.headers.some(h => /agent/i.test(h)))
    if (table) {
      return table.rows.map(row => {
        const vals = Object.values(row)
        return {
          id: row.agent_id || row.id || null,
          name: row.agent_name || row.name || row.agent || vals[0],
          posture: 'Unknown',
          type: row.type || row.role || 'Unknown',
          role: row.role || null,
          owner: row.owner || null,
          canonStatus: row.status || 'active',
          sigil: 'N/A',
          source: 'live',
          path: rel,
        }
      }).filter(a => a.name)
    }
  }
  return []
}

function loadAgents(root = REPO) {
  const type = detectVaultType(root)
  if (type === 'goose') return loadGooseAgents(root)
  if (type === 'sfs') return loadSfsAgents(root)
  if (type === 'generic') return loadGenericAgents(root)
  return []
}

// ─── mounted repos (multi-repo, personal Nexus) ──────────────────────────────
// The PRIMARY repo (config.repoPath / REPO) is always mounted and is the default
// working directory for actions. config.repos holds ADDITIONAL repos, each
// { id, name, path, role }. role: 'reference' (read-only — indexed for discovery)
// or 'workspace' (may become an action target, Phase 3). Discovery endpoints
// union across all mounted repos and tag each result with its repoId; the
// traversal guard (resolveInside) is applied against the SPECIFIC repo root, so
// multi-root never widens the file-read surface. Product build ships no
// config.repos, so this is a no-op there (single primary repo).
function primaryRepo() {
  const type = detectVaultType(REPO)
  return { id: 'primary', name: vaultDisplayName(REPO, type) || path.basename(REPO || '') || 'Primary', path: REPO, role: 'workspace', primary: true }
}
function mountedRepos() {
  const out = [primaryRepo()]
  for (const r of (Array.isArray(config.repos) ? config.repos : [])) {
    if (!r || !r.path) continue
    out.push({ id: r.id, name: r.name || path.basename(r.path), path: r.path, role: r.role === 'workspace' ? 'workspace' : 'reference', primary: false })
  }
  return out
}
function repoById(id) {
  if (!id || id === 'primary') return primaryRepo()
  return mountedRepos().find(r => r.id === id) || null
}
function repoSlug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'repo' }


// ─── routes ─────────────────────────────────────────────────────────────────

// GET /api/config — current harness state (token values never leave the server)
app.get('/api/config', (req, res) => {
  const type = detectVaultType(REPO)
  res.json({
    repoPath: REPO,
    exists: !!REPO && fs.existsSync(REPO),
    vaultType: type,
    vaultName: vaultDisplayName(REPO, type),
    ui: config.ui || {},
    telegram: {
      enabled: !!config.telegram?.enabled,
      directorChatId: config.telegram?.directorChatId || '',
      tokenSet: !!process.env.TELEGRAM_BOT_TOKEN,
    },
    sandbox: {
      enabled: sandboxEnabled(),
      model: sandboxModel(),
    },
  })
})

// POST /api/config — vault path (setup / first run), UI personalization,
// telegram wiring. All persist to goose.config.json; the bot token itself
// goes through /api/settings into .env, never into config.
app.post('/api/config', (req, res) => {
  let { repoPath, ui, telegram, sandbox } = req.body

  if (repoPath !== undefined) {
    if (!repoPath || typeof repoPath !== 'string') {
      return res.status(400).json({ ok: false, error: 'repoPath must be a non-empty string' })
    }
    repoPath = repoPath.trim().replace(/^~(?=\/|$)/, os.homedir())
    if (!fs.existsSync(repoPath)) {
      return res.status(400).json({ ok: false, error: `That folder doesn't exist — check the path and try again. (${repoPath})` })
    }
    config.repoPath = repoPath
    REPO = repoPath
  }

  if (ui && typeof ui === 'object') {
    config.ui = { ...(config.ui || {}) }
    if (ui.consoleName !== undefined) config.ui.consoleName = String(ui.consoleName).slice(0, 60)
    if (ui.accent !== undefined) config.ui.accent = String(ui.accent).slice(0, 20)
    // Full-UI theme (T23) — string key into THEMES; absent ⇒ 'studio' ⇒ today's
    // look. String-coerced + undefined-guarded so an unrelated save can't drop it.
    if (ui.theme !== undefined) config.ui.theme = String(ui.theme).slice(0, 40)
    // General-use engine surface flags (2026-07-14 sync). Bool-coerced, undefined-guarded.
    for (const f of ['library', 'runInspector', 'projects', 'visibility', 'builder']) {
      if (ui[f] !== undefined) config.ui[f] = !!ui[f]
    }
  }

  if (telegram && typeof telegram === 'object') {
    config.telegram = { ...(config.telegram || {}) }
    if (telegram.enabled !== undefined) config.telegram.enabled = !!telegram.enabled
    if (telegram.directorChatId !== undefined) config.telegram.directorChatId = String(telegram.directorChatId).trim()
  }

  if (sandbox && typeof sandbox === 'object') {
    config.sandbox = {
      enabled: sandbox.enabled !== undefined ? !!sandbox.enabled : sandboxEnabled(),
      model: sandbox.model !== undefined ? String(sandbox.model).trim() : sandboxModel(),
    }
  }

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
  } catch (e) {
    return res.status(500).json({ ok: false, error: `Could not save config: ${e.message}` })
  }

  const type = detectVaultType(REPO)
  res.json({
    ok: true,
    repoPath: REPO,
    vaultType: type,
    vaultName: vaultDisplayName(REPO, type),
    agentCount: loadAgents(REPO).length,
    ui: config.ui || {},
    telegramRestartNeeded: !!telegram,
  })
})

// GET /api/repos — all mounted repos (primary + additional), with liveness.
app.get('/api/repos', (req, res) => {
  res.json(mountedRepos().map(r => {
    const exists = !!r.path && fs.existsSync(r.path)
    return { ...r, exists, vaultType: exists ? detectVaultType(r.path) : null }
  }))
})

// POST /api/repos — add / remove / update an ADDITIONAL repo (never the primary;
// the primary is set via /api/config repoPath). Personal-Nexus feature.
//   { action:'add', path, name?, role? } | { action:'remove', id } | { action:'update', id, name?, role? }
app.post('/api/repos', (req, res) => {
  const { action } = req.body || {}
  config.repos = Array.isArray(config.repos) ? config.repos : []

  if (action === 'add') {
    let { path: p, name, role } = req.body
    if (!p || typeof p !== 'string') return res.status(400).json({ ok: false, error: 'path required' })
    const abs = path.resolve(p.trim().replace(/^~(?=\/|$)/, os.homedir()))
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return res.status(400).json({ ok: false, error: `Not a folder: ${abs}` })
    // Safety: repos must live under the user's home, and must NOT nest with any
    // already-mounted repo (nesting makes the per-repo traversal guard ambiguous).
    const home = path.resolve(os.homedir())
    if (abs !== home && !abs.startsWith(home + path.sep)) return res.status(400).json({ ok: false, error: 'A repo must live under your home folder.' })
    for (const r of mountedRepos()) {
      const rp = path.resolve(r.path)
      if (abs === rp || abs.startsWith(rp + path.sep) || rp.startsWith(abs + path.sep)) {
        return res.status(400).json({ ok: false, error: `That folder overlaps a connected repo (${r.name}). Pick a folder that isn't inside or containing another.` })
      }
    }
    let id = repoSlug(name || path.basename(abs))
    const taken = new Set(mountedRepos().map(r => r.id)); const base = id; let n = 2
    while (taken.has(id)) id = `${base}-${n++}`
    config.repos.push({ id, name: (name && name.trim()) || path.basename(abs), path: abs, role: role === 'workspace' ? 'workspace' : 'reference' })
  } else if (action === 'remove') {
    const { id } = req.body
    if (!id || id === 'primary') return res.status(400).json({ ok: false, error: 'Cannot remove the primary repo.' })
    config.repos = config.repos.filter(r => r.id !== id)
  } else if (action === 'update') {
    const { id, name, role } = req.body
    if (!id || id === 'primary') return res.status(400).json({ ok: false, error: 'The primary repo is managed in Vault connection.' })
    const r = config.repos.find(x => x.id === id)
    if (!r) return res.status(404).json({ ok: false, error: 'repo not found' })
    if (name !== undefined) r.name = String(name).trim().slice(0, 60)
    if (role !== undefined) r.role = role === 'workspace' ? 'workspace' : 'reference'
  } else {
    return res.status(400).json({ ok: false, error: 'action must be add | remove | update' })
  }

  try { fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n') }
  catch (e) { return res.status(500).json({ ok: false, error: `Could not save config: ${e.message}` }) }
  res.json({ ok: true, repos: mountedRepos() })
})

// GET /api/agents — full fleet from the registry (authoritative), enriched
// with canon status + sigil from charter files. Falls back to the legacy
// scan + static POSTURE_MAP only if the registry can't be read.
app.get('/api/agents', (req, res) => {
  // Foreign vault layouts route through the shared adapters
  const vt = detectVaultType(REPO)
  if (vt === 'sfs') return res.json(loadSfsAgents(REPO))
  if (vt === 'generic') return res.json(loadGenericAgents(REPO))
  if (!vt) return res.json(Object.entries(POSTURE_MAP).map(([name, data]) =>
    ({ name, ...data, canonStatus: 'Development', sigil: 'N/A', source: 'static' })))

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
        id: row.agent_id,
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

// GET /api/agent-detail?id=…&name=… — operational + mythological layers
app.get('/api/agent-detail', (req, res) => {
  const { id, name } = req.query
  if (!id && !name) return res.status(400).json({ error: 'id or name required' })

  const vaultType = detectVaultType(REPO)
  const agents = loadAgents()
  const agent = agents.find(a => (id && a.id === id) || (name && a.name === name))
  if (!agent) return res.status(404).json({ error: 'agent not found' })

  const MYTH_RE = /sigil|myth|resonan|symbol|archetype|persona|invocation|constellation|lore|epithet|voice of|alignment|triad/i
  const SKIP_RE = /^(open parameters|design record|registry|deployment)/i

  let operational = null
  let mythology = null

  // Class-bundle charters hold several agents in one file — narrow to the
  // requested agent's block where per-agent blocks exist.
  function narrowToAgent(text, agentId) {
    if (!text || !agentId) return text
    const headings = [...text.matchAll(/^#{1,3}\s.*?\b((?:AGT|TRI|SIG)-[A-Z-]+-\d+)\b.*$/gm)]
    if (new Set(headings.map(m => m[1])).size > 1) {
      const mine = headings.find(m => m[1] === agentId)
      if (mine) {
        const next = headings.find(m => m.index > mine.index && m[1] !== agentId)
        return text.slice(mine.index, next ? next.index : text.length)
      }
    }
    const decls = [...text.matchAll(/\*\*Agent(?: ID)?:\*\*\s*((?:AGT|TRI|SIG)-[A-Z-]+-\d+)/g)]
    if (new Set(decls.map(m => m[1])).size > 1) {
      const mine = decls.find(m => m[1] === agentId)
      if (mine) {
        const start = Math.max(text.lastIndexOf('\n#', mine.index), 0)
        const next = decls.find(m => m.index > mine.index && m[1] !== agentId)
        let end = next ? text.lastIndexOf('\n#', next.index) : text.length
        if (end <= start) end = text.length
        return text.slice(start, end)
      }
    }
    return text
  }

  const charterPath = agent.path && vaultType === 'goose'
    ? (path.isAbsolute(agent.path) ? agent.path : path.join(REPO, agent.path))
    : null
  const rawCharter = charterPath ? readFileSafe(charterPath) : null
  const charterText = rawCharter ? narrowToAgent(rawCharter, agent.id) : null

  // Bundle residue check: if the narrowed text still describes several agents,
  // treat it as a CLASS charter — identity comes from the registry row plus the
  // bundle's parameter tables, not from whole-file prose.
  const residualIds = charterText
    ? new Set([...charterText.matchAll(/\b(?:AGT|TRI|SIG)-[A-Z-]+-\d+\b/g)].map(m => m[0]))
    : new Set()
  const isBundle = charterText
    && (agent.charterShared || (agent.id && residualIds.size > 2))
    && !charterText.trim().startsWith(`# ${agent.name}`)

  if (charterText && !isBundle) {
    const sections = splitMdSections(charterText)
    const opSections = []
    const mythSections = []
    for (const s of sections) {
      if (SKIP_RE.test(s.heading)) continue
      if (MYTH_RE.test(s.heading)) mythSections.push(s)
      else opSections.push(s)
    }

    const fnSection = opSections.find(s => /function|purpose|what .* is|mandate/i.test(s.heading))
    const paras = (fnSection?.body || charterText.replace(/^#.*$/m, ''))
      .split(/\n\s*\n/).map(p => p.trim())
    const firstPara = paras.find(p => /^\*\*Domain:/i.test(p))
      || paras.find(p => p && !p.startsWith('**') && !p.startsWith('|') && !p.startsWith('#') && !/^\d+\./.test(p))
      || paras.find(p => p && !p.startsWith('|') && !p.startsWith('#'))

    operational = {
      summary: (fnSection ? fnSection.body : firstPara || '').split(/\n\s*\n/)[0]?.trim() || composeRegistrySummary(agent),
      posture: agent.posture,
      authority: extractMdField(charterText, 'Authority Tier') || agent.authority,
      cascadeLayer: extractMdField(charterText, 'Cascade Layer'),
      reviews: extractMdField(charterText, 'Reviews'),
      sections: opSections.slice(0, 8).map(s => ({ heading: s.heading, body: s.body.slice(0, 2400) })),
    }

    // Mythological layer: sigils, and triad alignments (Kairos-style charters
    // use "Primary Alignment" + "Triad Roles" instead of a sigil)
    const sigil = extractMdField(charterText, 'Primary Sigil Alignment') || (agent.sigil !== 'N/A' ? agent.sigil : null)
    const alignment = extractMdField(charterText, 'Primary Alignment')
    const triadRoles = extractMdField(charterText, 'Triad Roles')
    if (sigil || alignment || mythSections.length) {
      mythology = {
        sigil: sigil || alignment || null,
        triadRoles: triadRoles || null,
        summary: mythSections[0]?.body.split(/\n\s*\n/)[0]?.trim() || null,
        sections: mythSections.slice(0, 6).map(s => ({ heading: s.heading, body: s.body.slice(0, 2400) })),
      }
    }
  } else if (charterText && isBundle) {
    // Class charter (e.g. the six subagents): registry identity + this agent's
    // row from the bundle's parameter tables + the shared contract sections.
    const paramRows = []
    for (const table of parseMdTables(rawCharter)) {
      for (const row of table.rows) {
        const cells = Object.values(row).join(' | ')
        if ((agent.id && cells.includes(agent.id)) || cells.includes(agent.name)) {
          paramRows.push(Object.entries(row)
            .filter(([k, v]) => v && v !== '—')
            .map(([k, v]) => `${k}: ${v}`).join('\n'))
        }
      }
    }
    const sections = splitMdSections(rawCharter)
      .filter(s => !SKIP_RE.test(s.heading))
      .slice(0, 4)
      .map(s => ({ heading: `Shared class contract — ${s.heading}`, body: s.body.slice(0, 1800) }))
    operational = {
      summary: composeRegistrySummary(agent),
      posture: agent.posture,
      authority: agent.authority,
      sections: [
        ...(paramRows.length ? [{ heading: 'Charter parameters (this agent)', body: paramRows.join('\n\n') }] : []),
        ...sections,
      ],
    }
    // Class members share the class's symbolic identity only if they carry a sigil
    if (agent.sigil && agent.sigil !== 'N/A') {
      mythology = { sigil: agent.sigil, summary: null, sections: [] }
    }
  } else {
    // No charter file (sfs/generic vaults, or unmapped): registry row + the
    // vault's role definitions where available.
    let roleDoc = null
    if (vaultType === 'sfs' && agent.role) {
      const rolesText = readFileSafe(path.join(REPO, '_system', 'orchestration', 'agent-roles.md'))
      if (rolesText) {
        const roleSection = splitMdSections(rolesText).find(s => s.heading.toLowerCase().includes(agent.role.toLowerCase()))
        if (roleSection) roleDoc = { heading: roleSection.heading, body: roleSection.body.slice(0, 2400) }
      }
    }
    operational = {
      summary: composeRegistrySummary(agent),
      posture: agent.posture,
      authority: agent.authority,
      sections: roleDoc ? [roleDoc] : [],
    }
  }

  res.json({ ...agent, vaultType, operational, mythology })
})

// GET /api/status — parse DIRECTOR_STATUS.md entries
app.get('/api/status', (req, res) => {
  // Try repo first; the goose-workspace fallback never leaks into other vaults
  const svt = detectVaultType(REPO)
  const repoPaths = [
    path.join(REPO, config.statusLayerFile),
    ...(svt !== 'sfs' && svt !== 'generic' ? [path.join(__dirname, '..', 'DIRECTOR_STATUS.md')] : []),
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
    // Skip unfilled template blocks (e.g. "[Agent Name]" / "YYYY-MM-DD")
    if (/\[.*\]|YYYY-MM-DD/.test(`${entry.date} ${entry.agent}`)) continue
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
      const rawStatus = extractMdField(text, 'Canon Status')
      const canonStatus = rawStatus ? rawStatus.split(/[—(/]/)[0].trim() : 'Unknown'
      const canonBoundary = extractMdField(text, 'Canon Boundary') || 'N/A'
      const title = file.replace(/\.md$/, '').replace(/_/g, ' ').replace(/v\d+$/, '').trim()
      const lastMod = fs.statSync(path.join(dir, file)).mtime.toISOString().slice(0, 10)
      docs.push({ file, title, canonStatus, canonStatusRaw: rawStatus || null, canonBoundary, lastMod, source: label })
    }
  }

  readDir(sotDir, 'live')
  const cvt = detectVaultType(REPO)
  if (docs.length === 0 && cvt !== 'sfs' && cvt !== 'generic') readDir(fallbackDir, 'workspace')

  // Also scan contextDirs (e.g. agents/umbruh) for context/session files
  for (const relDir of (config.contextDirs || [])) {
    const dir = path.join(REPO, relDir)
    if (!fs.existsSync(dir)) continue
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'))
    for (const file of files) {
      const fullPath = path.join(dir, file)
      const text = readFileSafe(fullPath)
      if (!text) continue
      const rawStatus = extractMdField(text, 'Canon Status')
      const canonStatus = rawStatus ? rawStatus.split(/[—(/]/)[0].trim() : 'Development'
      const canonBoundary = extractMdField(text, 'Canon Boundary') || 'Internal'
      const h1 = text.match(/^#\s+(.+)/m)
      const title = h1 ? h1[1].trim() : file.replace(/\.md$/, '')
      const lastMod = fs.statSync(fullPath).mtime.toISOString().slice(0, 10)
      docs.push({ file, title, canonStatus, canonStatusRaw: rawStatus || null, canonBoundary, lastMod, source: relDir, path: path.join(relDir, file) })
    }
  }

  // Sort: Canon first, then Dev, then others
  const statusOrder = { Canon: 0, Development: 1, Candidate: 2, Unknown: 3 }
  docs.sort((a, b) => (statusOrder[a.canonStatus] ?? 9) - (statusOrder[b.canonStatus] ?? 9))

  res.json(docs)
})

// GET /api/health
app.get('/api/health', (req, res) => {
  const type = detectVaultType(REPO)
  res.json({
    ok: true,
    repoFound: !!REPO && fs.existsSync(REPO),
    vaultType: type,
    vaultName: vaultDisplayName(REPO, type),
  })
})

// Cloud key fields: [status/UI id, /api/settings body field, .env var]
const CLOUD_KEYS = [
  ['anthropic', 'anthropicKey', 'ANTHROPIC_API_KEY'],
  ['openai',    'openaiKey',    'OPENAI_API_KEY'],
  ['gemini',    'geminiKey',    'GEMINI_API_KEY'],
  ['deepseek',  'deepseekKey',  'DEEPSEEK_API_KEY'],
  ['mistral',   'mistralKey',   'MISTRAL_API_KEY'],
  ['qwen',      'qwenKey',      'DASHSCOPE_API_KEY'],
]

// GET /api/key-status — tells the UI which keys are set (without revealing them)
app.get('/api/key-status', (req, res) => {
  res.json({
    ...Object.fromEntries(CLOUD_KEYS.map(([id, , envVar]) => [id, !!process.env[envVar]])),
    telegram: !!process.env.TELEGRAM_BOT_TOKEN,
  })
})

// POST /api/settings — write API keys to the user data .env file
app.post('/api/settings', (req, res) => {
  const { telegramToken } = req.body
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

    for (const [, field, envVar] of CLOUD_KEYS) set(envVar, req.body[field])
    set('TELEGRAM_BOT_TOKEN', telegramToken)
    // New keys apply to the live process — drop cached availability-probe
    // results so the model pickers go green immediately, not after 5 min.
    for (const k of Object.keys(_keyCache)) delete _keyCache[k]
    if (!lines.find(l => l.startsWith('OLLAMA_BASE_URL=')))
      lines.push('OLLAMA_BASE_URL=http://localhost:11434')

    fs.writeFileSync(envPath, lines.join('\n') + '\n')
    res.json({
      ok: true,
      keyStatus: {
        ...Object.fromEntries(CLOUD_KEYS.map(([id, , envVar]) => [id, !!process.env[envVar]])),
        telegram: !!process.env.TELEGRAM_BOT_TOKEN,
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

// ─── OpenAI-compatible cloud providers ──────────────────────────────────────
// Most non-Anthropic clouds speak the OpenAI chat/completions protocol, so one
// engine serves them all. Each entry: default endpoint + the .env key that
// unlocks it. A model entry may also override `baseUrl` / `apiKeyEnv` directly
// to reach any other compatible host (OpenRouter, Together, a corporate
// proxy…) under its own provider name.
const OPENAI_COMPAT = {
  openai:   { label: 'OpenAI',         base: 'https://api.openai.com/v1',                               keyEnv: 'OPENAI_API_KEY' },
  gemini:   { label: 'Google Gemini',  base: 'https://generativelanguage.googleapis.com/v1beta/openai', keyEnv: 'GEMINI_API_KEY' },
  deepseek: { label: 'DeepSeek',       base: 'https://api.deepseek.com/v1',                             keyEnv: 'DEEPSEEK_API_KEY' },
  mistral:  { label: 'Mistral',        base: 'https://api.mistral.ai/v1',                               keyEnv: 'MISTRAL_API_KEY' },
  qwen:     { label: 'Qwen (Alibaba)', base: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',  keyEnv: 'DASHSCOPE_API_KEY' },
}

// Resolve a model's OpenAI-compatible wiring, or null if it isn't one.
// Registry providers work out of the box; any other provider name works when
// the model entry carries its own baseUrl (+ optionally apiKeyEnv).
function compatFor(modelConfig) {
  if (!modelConfig) return null
  if (['anthropic', 'ollama', 'claude-code'].includes(modelConfig.provider)) return null
  const preset = OPENAI_COMPAT[modelConfig.provider]
  if (!preset && !modelConfig.baseUrl) return null
  const base = String(modelConfig.baseUrl || preset.base).replace(/\/+$/, '')
  const keyEnv = modelConfig.apiKeyEnv || preset?.keyEnv || 'OPENAI_API_KEY'
  return { base, keyEnv, key: process.env[keyEnv], label: preset?.label || modelConfig.provider }
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
    } else if (OPENAI_COMPAT[provider] || (config.models || []).some(m => m.provider === provider && m.baseUrl)) {
      // Any OpenAI-compatible cloud (OpenAI, Gemini, DeepSeek, Mistral, Qwen,
      // or a custom-baseUrl host) — probe with a 1-token real call.
      const probeModel = (config.models || []).find(m => m.provider === provider)
      const compat = compatFor(probeModel || { provider })
      if (!compat) { result.error = 'Unknown provider' }
      else if (!compat.key) { result.error = `No API key set (${compat.keyEnv})` }
      else {
        const model = probeModel?.model || 'gpt-4o'
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 8000)
        // Real OpenAI's newer models (GPT-5 / o-series) reject `max_tokens` and
        // require `max_completion_tokens`; the other OpenAI-compat clones
        // (Gemini/DeepSeek/Mistral/Qwen) still expect `max_tokens`. A reasoning
        // model can spend the whole budget on hidden reasoning, so give the probe
        // a little headroom (a 200 with empty content still proves the key works).
        const tokenCap = provider === 'openai' ? { max_completion_tokens: 16 } : { max_tokens: 1 }
        const r = await fetch(`${compat.base}/chat/completions`, {
          method: 'POST', signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${compat.key}` },
          body: JSON.stringify({ model, ...tokenCap, messages: [{ role: 'user', content: 'hi' }] }),
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
    } else {
      result.error = 'Unknown provider'
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
  // Probe every distinct cloud provider present in config (anthropic,
  // claude-code, and any OpenAI-compatible name), plus local Ollama.
  const cloudProviders = [...new Set((config.models || []).map(m => m.provider).filter(p => p && p !== 'ollama'))]
  const [installed, ...cloudResults] = await Promise.all([
    getOllamaTags(),                 // array, or null if down
    ...cloudProviders.map(p => validateProvider(p)),
  ])
  const cloudCheck = Object.fromEntries(cloudProviders.map((p, i) => [p, cloudResults[i]]))
  const ollamaRunning = installed !== null
  const installedNorm = new Set((installed || []).map(normTag))
  const isOllamaInstalled = (modelStr) =>
    ollamaRunning && installedNorm.has(normTag(modelStr))

  const models = (config.models || []).map(m => {
    if (m.provider === 'ollama') {
      const ok = isOllamaInstalled(m.model)
      return { ...m, available: ok, unavailableReason: ok ? null : (ollamaRunning ? 'Not installed in Ollama' : 'Ollama not running') }
    }
    const check = cloudCheck[m.provider]
    return {
      ...m,
      available: !!check?.ok,
      // Why a model is unavailable (shown on hover) — honest, not just "no key".
      unavailableReason: check ? (check.ok ? null : check.error) : 'Unknown provider',
    }
  })

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

  const brain = await resolveBrain(null)
  res.json({ models, agentRoles: config.agentRoles || [], ollamaRunning, brainId: brain?.id || null })
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
  const { p, repo } = req.query
  if (!p) return res.status(400).json({ error: 'p param required' })
  const r = repoById(repo)                              // defaults to primary
  if (!r || !r.path) return res.status(404).json({ error: 'unknown repo' })
  const filePath = resolveInside(r.path, p)             // guard against THIS repo's root
  if (!filePath) return res.status(403).json({ error: 'path outside repo' })
  const text = readFileSafe(filePath)
  if (!text) return res.status(404).json({ error: 'file not found' })
  res.json({ path: p, repo: r.id, content: text })
})

// GET /api/domains — auto-discover life/work domains under <repo>/domains and
// surface their plans, goals, records, and data streams for the Domains view.
// Config-driven: any folder dropped into domains/ shows up — nothing about
// health/finance is hardcoded, so this stays product-safe (the section itself
// is personal-only, wired in personal-extensions.jsx). Reads are local + the
// server is loopback-only; the .ndjson observation streams are summarized
// (record count + last date), not dumped, so the view stays fast.
app.get('/api/domains', (req, res) => {
  const titleOf = (text, fallback) => {
    const h1 = text.match(/^#\s+(.+)/m)
    return h1 ? h1[1].trim() : fallback
  }
  const humanize = (s) => s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  // Scan one repo's domains/ dir. Every doc/stream is tagged with repoId so the
  // client fetches content via /api/file?repo=<id>, keeping the guard per-repo.
  const scanRepo = (repo) => {
    const domainsRoot = resolveInside(repo.path, 'domains')
    if (!domainsRoot || !fs.existsSync(domainsRoot)) return []
    const domains = []
    for (const dirent of fs.readdirSync(domainsRoot, { withFileTypes: true })) {
      if (!dirent.isDirectory() || dirent.name.startsWith('.')) continue
      const domainId = dirent.name
      const domainDir = path.join(domainsRoot, domainId)
      const docs = []
      const streams = []

      const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.name.startsWith('.') || e.name === 'node_modules') continue
          const full = path.join(dir, e.name)
          const rel = path.relative(repo.path, full).replace(/\\/g, '/')   // repo-relative → feeds /api/file
          const inDomain = path.relative(domainDir, full).replace(/\\/g, '/')
          if (e.isDirectory()) { walk(full); continue }

          if (e.name.endsWith('.md') || e.name.endsWith('.markdown')) {
            const text = readFileSafe(full) || ''
            const stat = fs.statSync(full)
            const parts = inDomain.split('/')
            const category = parts.length > 1 ? humanize(parts[parts.length - 2]) : 'Overview'
            docs.push({ path: rel, repoId: repo.id, title: titleOf(text, e.name), category, lastMod: stat.mtime.toISOString().slice(0, 10) })
          } else if (e.name.endsWith('.ndjson') && !e.name.includes('.template.')) {
            const text = readFileSafe(full) || ''
            const lines = text.split('\n').filter(l => l.trim())
            let lastDate = null
            for (let i = lines.length - 1; i >= 0; i--) {
              try {
                const rec = JSON.parse(lines[i])
                lastDate = rec.date || rec.timestamp || rec.effectiveDateTime || rec.t || null
                if (lastDate) { lastDate = String(lastDate).slice(0, 10); break }
              } catch { /* skip malformed */ }
            }
            streams.push({ name: e.name.replace(/\.ndjson$/, ''), path: rel, repoId: repo.id, records: lines.length, lastDate })
          }
        }
      }
      walk(domainDir)

      // Sort docs so plans/overview float up, then by recency.
      const catRank = { 'Overview': 0, 'Goals': 1, 'Records': 2 }
      docs.sort((a, b) => (catRank[a.category] ?? 5) - (catRank[b.category] ?? 5) || b.lastMod.localeCompare(a.lastMod))
      streams.sort((a, b) => a.name.localeCompare(b.name))

      // key disambiguates same-named domains across repos (e.g. two "health").
      domains.push({ key: `${repo.id}:${domainId}`, id: domainId, label: humanize(domainId), repoId: repo.id, repoName: repo.name, docs, streams })
    }
    return domains
  }

  const out = []
  for (const repo of mountedRepos()) out.push(...scanRepo(repo))
  out.sort((a, b) => a.label.localeCompare(b.label) || a.repoName.localeCompare(b.repoName))
  res.json(out)
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

    } else if (compatFor(modelConfig)) {
      // Any OpenAI-compatible cloud: OpenAI, Gemini, DeepSeek, Mistral, Qwen,
      // or a custom-baseUrl host. Same wire protocol, same streaming parse.
      const compat = compatFor(modelConfig)
      if (!compat.key) return sendError(`${compat.keyEnv} not set in .env`)

      const oaiMessages = []
      if (systemContent) oaiMessages.push({ role: 'system', content: systemContent })
      oaiMessages.push(...messages.map(m => ({ role: m.role, content: m.content })))

      const response = await fetch(`${compat.base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${compat.key}`,
        },
        body: JSON.stringify({
          model: modelConfig.model,
          stream: true,
          messages: oaiMessages,
        }),
      })

      if (!response.ok) {
        const err = await response.text()
        return sendError(`${compat.label} API error: ${err}`)
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
      sendDone({ model: modelConfig.model, provider: modelConfig.provider })

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

    } else if (modelConfig.provider === 'claude-code') {
      // Claude via the Claude Code CLI — billed to the Max subscription, NOT API
      // credits (recordUsage meters it $0). One non-interactive turn with
      // stream-json output so Invoke gets real token deltas. cliEnv() strips
      // ANTHROPIC_API_KEY so the CLI uses the Max OAuth login; no --bare for the
      // same reason (bare mode skips the keychain read).
      const model = modelConfig.model || 'sonnet'
      const prompt = [systemContent, ...messages.map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))].filter(Boolean).join('\n\n')
      const child = spawn('claude', ['-p', prompt, '--output-format', 'stream-json', '--include-partial-messages', '--verbose', '--model', model], {
        cwd: os.homedir(), env: cliEnv(),
      })
      let buf = ''
      let streamed = false
      let finalResult = null
      let stderr = ''
      let finished = false
      const finish = (fn) => { if (!finished) { finished = true; fn() } }
      child.stdout.on('data', (d) => {
        buf += d
        let nl
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line) continue
          let evt
          try { evt = JSON.parse(line) } catch { continue }
          const delta = evt?.event?.delta
          if (evt.type === 'stream_event' && delta?.type === 'text_delta' && delta.text) {
            streamed = true
            sendChunk(delta.text)
          } else if (evt.type === 'result') {
            finalResult = evt
          }
        }
      })
      child.stderr.on('data', (d) => { stderr += d })
      const timer = setTimeout(() => child.kill('SIGKILL'), 300000)
      child.on('error', (e) => {
        clearTimeout(timer)
        finish(() => sendError(`Claude Code CLI not found: ${e.message}`))
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        finish(() => {
          if (code !== 0 && !streamed && !finalResult) {
            return sendError(`Claude Code CLI failed (exit ${code}): ${stderr.replace(/\s+/g, ' ').slice(0, 400) || 'is the claude CLI installed and logged in?'}`)
          }
          if (!streamed && finalResult?.result) sendChunk(String(finalResult.result))
          recordUsage(modelConfig, finalResult?.usage?.input_tokens, finalResult?.usage?.output_tokens)
          sendDone({ model, provider: 'claude-code' })
        })
      })
      return // async streaming — the child's close handler ends the response

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

// The Director-mode BRAIN: one designated model plans, delegates, and
// synthesizes; the rest of the ensemble is the worker unit. Doctrine, not a
// per-run choice — config.sandbox.brainModel overrides; otherwise the
// strongest available Anthropic path (Max CLI, then API), then any cloud,
// then local. An explicit preferredId (legacy directorId) still wins.
async function resolveBrain(preferredId) {
  const models = config.models || []
  if (preferredId) {
    const m = await resolveModelConfig(preferredId)
    if (m) return m
  }
  if (config.sandbox?.brainModel) {
    const m = await resolveModelConfig(config.sandbox.brainModel)
    if (m) return m
  }
  return models.find(m => m.provider === 'claude-code')
    || models.find(m => m.provider === 'anthropic')
    || models.find(m => m.provider !== 'ollama')
    || models[0]
    || null
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
  // GPT-5.6 family (2026-07): Sol flagship / Terra balanced / Luna budget.
  'gpt-5.6-sol': [5, 30],
  'gpt-5.6-terra': [2.5, 15],
  'gpt-5.6-luna': [1, 6],
}
const usage = { calls: 0, inTok: 0, outTok: 0, costUSD: 0, byModel: {}, since: new Date().toISOString() }
// Soft daily ceiling on *paid* spend (USD). 0 disables. Override via NEXUS_DAILY_BUDGET_USD.
// Note: this governs PAID-API providers only. The Claude Max CLI path (provider
// 'claude-code', incl. the Telegram cloud-Director handoff) is metered $0 and does
// NOT count against this — so remote phone use leans on the subscription freely.
// Raised 5 → 25 (2026-07-04): Director does heavy Claude work and isn't optimizing
// tokens from the phone; the breaker stays as a runaway backstop, not a leash.
let budgetUSD = Number(process.env.NEXUS_DAILY_BUDGET_USD || 25)

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
  const compat = compatFor(modelConfig)
  if (compat) {
    // Any OpenAI-compatible cloud (OpenAI, Gemini, DeepSeek, Mistral, Qwen, custom baseUrl).
    if (!compat.key) throw new Error(`${compat.keyEnv} not set`)
    const msgs = []
    if (systemContent) msgs.push({ role: 'system', content: systemContent })
    msgs.push(...messages.map(m => ({ role: m.role, content: m.content })))
    const r = await fetch(`${compat.base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${compat.key}` },
      body: JSON.stringify({ model: modelConfig.model, messages: msgs }),
    })
    if (!r.ok) throw new Error(`${compat.label} ${r.status}: ${(await r.text()).slice(0, 200)}`)
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
  let {
    task, participantIds = [], mode = 'roundtable',
    aggregatorId, rounds = 2, sourceDocs = [], roleAssignments = {},
    backendId, championFile, challengerFile,   // A/B (champion vs challenger) mode
    directorId, tools = true,                  // Umbruh-Director mode
    // Phase B (2026-07-14 general-use sync):
    routingPolicy = null, customSelection = null, skillId = null,
    saveAsArtifact = null, projectId = null,
  } = req.body
  if (!task) return res.status(400).json({ error: 'task required' })

  // Phase B: a routing policy (fast/best/private/low-cost) picks the models from
  // the available list, overriding participants/director; explained below.
  let routingChoice = null
  if (!routingPolicy && projectId) { const pj = generalUseStores.loadProject(projectId); if (pj && pj.routing && pj.routing !== 'auto') routingPolicy = pj.routing }
  if (routingPolicy) {
    const avail = (config.models || []).map(m => ({ id: m.id, provider: m.provider, tier: m.tier, pricePerMTokUsd: m.provider === 'ollama' ? 0 : (PRICE[m.model] ? PRICE[m.model][0] : undefined) }))
    routingChoice = applyRoutingPolicy(String(routingPolicy), avail, { customSelection })
    if (routingChoice.selected.length) {
      participantIds = routingChoice.selected
      if (routingChoice.mode !== 'council' && routingChoice.mode !== 'custom') directorId = routingChoice.selected[0]
    }
  }
  if (mode !== 'ab' && !participantIds.length) {
    return res.status(400).json({ error: routingChoice && !routingChoice.selected.length ? `routing policy "${routingPolicy}" selected no model (${routingChoice.reason})` : 'task and participantIds required' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  // Phase B: durable run record + role-tagged trace. Every emitted event is
  // captured so /api/runs + the Run Inspector populate, and phased events carry
  // the runtime role (brain/worker/broker) for the trace.
  const runRecord = {
    id: `run_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
    startedAt: new Date().toISOString(), mode, task,
    projectId: projectId || null, participantIds,
    directorId: directorId || null, aggregatorId: aggregatorId || null,
    routingPolicy: routingChoice ? { policy: routingChoice.policy, selected: routingChoice.selected } : null,
    events: [],
  }
  const emit = (obj) => {
    if (obj && obj.phase && !obj.role) obj.role = roleForPhase(obj.phase)
    if (runRecord.events.length < 1000) runRecord.events.push(obj)
    res.write(`data: ${JSON.stringify(obj)}\n\n`)
  }
  if (routingChoice && routingChoice.policy) {
    emit({ type: 'status', role: 'control-plane', message: `Routing policy "${routingChoice.policy}" — ${routingChoice.reason}`, routing: { policy: routingChoice.policy, selected: routingChoice.selected } })
  }

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
      const director = (await resolveBrain(directorId || aggregatorId)) || participants[0]
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

        // The worker unit. Cloud API workers fan out in PARALLEL — they're
        // independent HTTP calls, and the unit should act as one. Two lanes
        // stay SEQUENTIAL: local Ollama (RAM-bound — two large models won't
        // co-reside on a 24GB Mac) and anything using tools or the Claude
        // Code CLI (tool steps can race on files; the CLI call blocks).
        const results = new Array(plan.length).fill(null)
        const staged = []
        for (let i = 0; i < plan.length; i++) {
          const step = plan[i]
          let worker = (await resolveModelConfig(step.modelId)) || director
          // Budget breaker: at the paid-spend ceiling, downgrade paid workers to free/local.
          if (overBudget() && worker.provider !== 'ollama' && worker.provider !== 'claude-code') {
            const local = ensemble.find(m => m.provider === 'ollama') || director
            emit({ type: 'status', message: `Budget ceiling — routing "${step.task.slice(0, 40)}…" to ${local.name} (free) instead of ${worker.name}` })
            worker = local
          }
          staged.push({ step, idx: i, worker, wantTools: tools && step.needsTools })
        }
        const runStep = async ({ step, idx, worker, wantTools }) => {
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
            results[idx] = { subtask: step.task, worker: worker.name, text }
            emit({ type: 'turn', model: worker.name, modelId: worker.id, phase: 'work', subtask: step.task, text })
          } catch (e) {
            emit({ type: 'turn-error', model: worker.name, phase: 'work', subtask: step.task, error: e.message })
          }
        }
        const parallelLane = staged.filter(s => !s.wantTools && s.worker.provider !== 'ollama' && s.worker.provider !== 'claude-code')
        const sequentialLane = staged.filter(s => !parallelLane.includes(s))
        if (parallelLane.length > 1) emit({ type: 'status', message: `Dispatching ${parallelLane.length} cloud subtasks in parallel` })
        await Promise.all([
          Promise.all(parallelLane.map(s => runStep(s))),
          (async () => { for (const s of sequentialLane) await runStep(s) })(),
        ])
        const done = results.filter(Boolean)
        emit({ type: 'status', message: `${director.name} composing as Director` })
        const compose = `You are Umbruh, the Director. Compose the ensemble's work below into one coherent, high-quality deliverable for the task. Keep the strongest reasoning, reconcile any conflicts, note anything still unresolved, and speak in your own voice.\n\nTASK:\n"""${task}"""\n\n${done.map(r => `### ${r.subtask}\n(by ${r.worker})\n${r.text}`).join('\n\n')}`
        try {
          const finalText = await callModel(director, docContext || undefined, [{ role: 'user', content: compose }])
          // Phase B: opt-in artifact minting from the run (Library populates).
          let artifactId = null
          if (saveAsArtifact && typeof saveAsArtifact === 'object') {
            const art = generalUseStores.createArtifact({ id: `art_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`, type: saveAsArtifact.type || 'report', title: saveAsArtifact.title || (task || 'Untitled').slice(0, 120), content: finalText, now: new Date().toISOString(), provenance: { runId: runRecord.id, modelId: director.id, skillId: skillId || undefined } })
            if (art) { if (projectId) art.projectId = projectId; if (generalUseStores.saveArtifact(art)) { artifactId = art.id; runRecord.artifactId = art.id } }
          }
          emit({ type: 'final', model: director.name, modelId: director.id, text: finalText, artifactId })
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
  // Phase B: persist the run record (feeds /api/runs + the Run Inspector).
  runRecord.finishedAt = new Date().toISOString()
  generalUseStores.saveRunRecord(runRecord)
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

  function walkDir(dir, baseDir, repo) {
    if (!fs.existsSync(dir)) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      const relPath = path.relative(baseDir, fullPath)
      if (entry.isDirectory()) {
        // Skip node_modules, .git, hidden dirs
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walkDir(fullPath, baseDir, repo)
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
          repoId: repo.id,
          repoName: repo.name,
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

  // Union across all mounted repos; each entry is tagged with its repoId/repoName.
  for (const r of mountedRepos()) {
    if (r.path && fs.existsSync(r.path)) walkDir(r.path, r.path, r)
  }

  // Also include workspace governance docs as fallback
  const kvt = detectVaultType(REPO)
  const workspaceDir = path.join(__dirname, '..')
  const wsFiles = (kvt === 'sfs' || kvt === 'generic') ? [] : ['Goose_Agent_Type_Classification_v1.md', 'Goose_Sigil_Mode_Standard_v1.md',
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
        model: UMBRUH_MODEL,
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
// Mobile/voice auth — hardened 2026-07-11 (plan §3f). The chat pipeline ends in
// full-tool execution on this Mac, so this fails CLOSED: no access while the
// PIN is unset or still the factory default, rate-limited attempts, constant-
// time compare, and an optional Tailscale identity second factor.
const PIN_FAILS = new Map() // ip -> { count, resetAt }
function mobileAuthCheck(req, res) {
  // The PIN is a SECRET, so it lives with the other secrets: NEXUS_MOBILE_PIN
  // in the single ~/Library/Application Support/Nexus/.env (or the Keychain) —
  // NOT in one of the many git-tracked goose.config.json files. The legacy
  // config.voicePin is still honored as a fallback for older installs.
  const configPin = String(process.env.NEXUS_MOBILE_PIN || config.voicePin || '')
  if (!configPin || configPin === '1234') {
    res.status(403).json({ error: 'Mobile access disabled: set NEXUS_MOBILE_PIN in your Nexus .env (the factory "1234" is refused). See install-mini-nexus.command.' })
    return false
  }
  // Behind `tailscale serve` every request connects from loopback, so req.ip
  // is a single shared bucket. Prefer the tailnet identity, then the first
  // X-Forwarded-For hop, so throttling is per-caller (and one attacker can't
  // lock out the legit phone by exhausting a global counter).
  const ip = String(req.headers['tailscale-user-login']
    || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.ip || req.socket?.remoteAddress || '?')
  const now = Date.now()
  const rec = PIN_FAILS.get(ip) || { count: 0, resetAt: now + 60_000 }
  if (now > rec.resetAt) { rec.count = 0; rec.resetAt = now + 60_000 }
  if (rec.count >= 5) { res.status(429).json({ error: 'Too many PIN attempts — wait a minute.' }); return false }
  // Query-param fallback exists because EventSource/GET streams can't set headers.
  const supplied = String(req.headers['x-voice-pin'] || req.query?.pin || '').trim()
  const a = crypto.createHash('sha256').update(supplied).digest()
  const b = crypto.createHash('sha256').update(configPin).digest()
  if (!crypto.timingSafeEqual(a, b)) {
    rec.count += 1
    PIN_FAILS.set(ip, rec)
    res.status(401).json({ error: 'Invalid PIN' })
    return false
  }
  // Optional second factor: when fronted by `tailscale serve`, the proxy injects
  // the caller's tailnet identity; pin mobile access to one login if configured.
  const wantUser = config.mobile?.tailscaleUser
  if (wantUser) {
    const got = String(req.headers['tailscale-user-login'] || '')
    if (got.toLowerCase() !== String(wantUser).toLowerCase()) {
      res.status(403).json({ error: 'Tailscale identity mismatch' })
      return false
    }
  }
  return true
}
const voicePinCheck = mobileAuthCheck

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
        model: UMBRUH_MODEL,
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
  const umbruhModel = (config.models || []).find(m => m.id === 'umbruh-lite' || m.id === 'umbruh')
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
  if (!sandboxEnabled()) {
    return { success: false, error: 'Sandbox is disabled. Enable it in Settings → Sandbox to allow local tools.' }
  }
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
  const toolsAllowed = useTools && sandboxEnabled()
  const msgs = [...messages]
  for (let i = 0; i < maxSteps; i++) {
    const body = { model: UMBRUH_MODEL, messages: msgs, stream: false }
    if (toolsAllowed) body.tools = UMBRUH_TOOLS
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

  const agenticCompat = compatFor(modelConfig)
  if (agenticCompat) {
    // Any OpenAI-compatible cloud — the function-calling protocol is shared too.
    if (!agenticCompat.key) throw new Error(`${agenticCompat.keyEnv} not set`)
    const msgs = []
    if (system) msgs.push({ role: 'system', content: system })
    msgs.push({ role: 'user', content: task })
    for (let i = 0; i < maxSteps; i++) {
      const r = await fetch(`${agenticCompat.base}/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${agenticCompat.key}` },
        body: JSON.stringify({ model: modelConfig.model, messages: msgs, tools: UMBRUH_TOOLS }),
      })
      if (!r.ok) throw new Error(`${agenticCompat.label} ${r.status}: ${(await r.text()).slice(0, 200)}`)
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
  const userText = [...messages].reverse().find(m => m.role === 'user')?.content || ''
  if (!String(userText).trim()) return res.status(400).json({ error: 'no user message' })

  // SSE stream setup
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const send = (data) => res.write('data: ' + JSON.stringify(data) + '\n\n')

  // 2026-07-11 fold (plan A7): voice runs through the shared brain — the same
  // tiered routing as Telegram and the mini Nexus (including the Claude
  // escalation this endpoint previously lacked) and the ONE canonical director
  // thread, so a voice session continues the same conversation as every other
  // surface. Sentence-level TTS streams off the brain's token deltas; TTS calls
  // ride a promise chain so audio arrives in order.
  let sentenceBuf = ''
  let spokeAny = false
  let ttsChain = Promise.resolve()
  const speak = (sentence) => {
    const s = (sentence || '').trim()
    if (!s) return
    ttsChain = ttsChain.then(async () => {
      const audio = await generateTTS(s)
      if (audio) { spokeAny = true; send({ type: 'audio', text: s, audio }) }
    }).catch(e => console.error('[voice-relay] tts failed:', e.message))
  }

  try {
    const { reply } = await brain.runTask('director', String(userText), {
      channel: 'voice',
      contextDocs,
      preferStreaming: true,
      onDelta: (d) => {
        if (d.type === 'token') {
          sentenceBuf += d.text
          const { complete, remaining } = extractCompleteSentences(sentenceBuf)
          sentenceBuf = remaining
          for (const s of complete) speak(s)
        } else if (d.type === 'status') {
          send({ type: 'status', text: d.text })
        }
      },
    })
    if (sentenceBuf.trim()) speak(sentenceBuf)
    await ttsChain
    // Tool-loop and escalated replies arrive whole (no token deltas) — speak them now.
    if (!spokeAny && reply) {
      for (const s of splitIntoSentences(reply)) speak(s)
      await ttsChain
    }
    send({ type: 'done', content: reply })
  } catch (e) {
    console.error('[voice-relay] error:', e.message)
    send({ type: 'error', error: e.message })
  }

  res.end()
})

// ─── The shared tiered brain (plan 2026-07-11) ───────────────────────────────
// ONE brain for every transport: Telegram, the mini Nexus PWA (/m), and /voice.
// Owns routing (local umbruh-lite → Claude escalation), the canonical persisted
// director thread, the chat job model, and the event log. Telegram's notify()
// is injected after initTelegram so escalated mobile jobs can push completions.
const brain = initBrain({
  config,
  REPO,
  readFileSafe,
  runAgentLoop,
  ollamaUrl: (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, ''),
  userDataDir: process.env.NEXUS_USER_DATA || __dirname,
})

// ─── Mini Nexus mobile API (plan 2026-07-11, Phase A) ────────────────────────
// PIN-gated (hardened mobileAuthCheck) routes backing the /m PWA: job-model
// chat that survives a locked phone, canonical history, the status-feed event
// log, and idempotent domain quick-appends for the offline outbox.

// POST /api/chat { text } → { job } — returns immediately; work continues even
// if this socket (or the phone's screen) dies. Stream/poll the job to follow.
app.post('/api/chat', (req, res) => {
  if (!mobileAuthCheck(req, res)) return
  const text = String(req.body?.text || '').trim()
  if (!text) return res.status(400).json({ error: 'text required' })
  const job = brain.submitJob('director', text, { channel: 'pwa', preferStreaming: true })
  res.json({ job: { id: job.id, status: job.status, createdAt: job.createdAt } })
})

// GET /api/chat/job/:id — the job's persisted state; survives any disconnect.
app.get('/api/chat/job/:id', (req, res) => {
  if (!mobileAuthCheck(req, res)) return
  const job = brain.getJob(req.params.id)
  if (!job) return res.status(404).json({ error: 'job not found' })
  res.json(job)
})

// GET /api/chat/stream/:id — reconnectable SSE view onto a job. Replays all
// prior deltas so a phone waking from screen lock catches up, then follows
// live. Heartbeat comments keep the proxy and mobile radio from reaping it.
app.get('/api/chat/stream/:id', (req, res) => {
  if (!mobileAuthCheck(req, res)) return
  const job = brain.getJob(req.params.id)
  if (!job) return res.status(404).json({ error: 'job not found' })
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()
  const send = (d) => res.write('data: ' + JSON.stringify(d) + '\n\n')
  for (const d of (job.deltas || [])) send(d)
  if (job.status === 'done' || job.status === 'error') return res.end()
  const hb = setInterval(() => res.write(': ping\n\n'), 20000)
  const unsub = brain.subscribeJob(req.params.id, (d) => {
    send(d)
    if (d.type === 'done' || d.type === 'error') { clearInterval(hb); unsub?.(); res.end() }
  })
  if (!unsub) { clearInterval(hb); return res.end() } // finished between getJob and subscribe
  req.on('close', () => { clearInterval(hb); unsub() })
})

// GET /api/chat/history?n=50 — tail of the canonical director thread.
app.get('/api/chat/history', (req, res) => {
  if (!mobileAuthCheck(req, res)) return
  const n = Math.min(Number(req.query.n) || 50, 500)
  res.json(brain.history('director', n))
})

// POST /api/chat/reset — same as Telegram's /reset, from any surface.
app.post('/api/chat/reset', (req, res) => {
  if (!mobileAuthCheck(req, res)) return
  brain.resetThread('director')
  res.json({ ok: true })
})

// GET /api/events?n=100 — the status feed (everything notify() pushed, plus
// chat-job and observation events), newest first.
app.get('/api/events', (req, res) => {
  if (!mobileAuthCheck(req, res)) return
  const n = Math.min(Number(req.query.n) || 100, 500)
  res.json(brain.listEvents(n))
})

// POST /api/domains/observe — append a structured observation to a domain's
// stream. Body: { id, domain, note, repoId?, type?, source?, transcript? }.
// `id` is a client-generated UUID: the offline outbox retries after flaky
// wakes, and NDJSON appends aren't idempotent, so the server dedupes on it.
app.post('/api/domains/observe', (req, res) => {
  if (!mobileAuthCheck(req, res)) return
  const { id, domain, repoId, note, type, source, transcript } = req.body || {}
  if (!id || !domain || !note) return res.status(400).json({ error: 'id, domain, note required' })
  const repos = mountedRepos()
  const repo = repoId ? repos.find(r => r.id === repoId) : repos[0]
  if (!repo) return res.status(404).json({ error: 'repo not found' })
  const domainsRoot = resolveInside(repo.path, 'domains')
  const domainDir = domainsRoot ? resolveInside(domainsRoot, String(domain)) : null
  if (!domainDir || !fs.existsSync(domainDir)) return res.status(404).json({ error: `domain not found: ${domain}` })
  const file = path.join(domainDir, 'observations.ndjson')
  const cleanId = String(id).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64)
  if (!cleanId) return res.status(400).json({ error: 'invalid id' })
  const existing = readFileSafe(file) || ''
  if (existing.includes(`"id":"${cleanId}"`)) return res.json({ ok: true, deduped: true })
  const ts = new Date().toISOString()
  const rec = {
    id: cleanId, ts, date: ts.slice(0, 10),
    type: String(type || 'note').slice(0, 40),
    note: String(note).slice(0, 4000),
    source: String(source || 'mini-nexus').slice(0, 60),
    ...(transcript ? { transcript: String(transcript).slice(0, 8000) } : {}),
  }
  try { fs.appendFileSync(file, JSON.stringify(rec) + '\n') }
  catch (e) { return res.status(500).json({ error: 'write failed: ' + e.message }) }
  brain.appendEvent({ kind: 'observation', text: `${domain}: ${rec.note.slice(0, 100)}`, domain, repoId: repo.id })
  res.json({ ok: true, record: rec })
})

// POST /api/transcribe — raw audio body (webm/opus from MediaRecorder) →
// whisper on the Mac → { text }. Same ffmpeg→whisper.cpp→openai-whisper
// chain the Telegram bot uses for voice notes; degrades to a clear error
// when whisper isn't installed.
app.post('/api/transcribe', express.raw({ type: 'audio/*', limit: '25mb' }), (req, res) => {
  if (!mobileAuthCheck(req, res)) return
  if (!req.body?.length) return res.status(400).json({ error: 'audio body required' })
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const srcPath = `/tmp/mnx-stt-${id}.webm`
  const wavPath = `/tmp/mnx-stt-${id}.wav`
  const env = { ...process.env, PATH: '/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:/usr/sbin' }
  const rm = (paths) => { for (const p of paths) { try { fs.unlinkSync(p) } catch {} } }
  try {
    fs.writeFileSync(srcPath, req.body)
    execSync(`ffmpeg -y -i '${srcPath}' -ar 16000 -ac 1 '${wavPath}'`, { stdio: 'ignore', timeout: 30000, env })
  } catch (e) {
    rm([srcPath, wavPath])
    return res.status(500).json({ error: 'audio decode failed (is ffmpeg installed?)' })
  }
  // 1) whisper.cpp
  const cppBin = process.env.WHISPER_CPP_BIN
  const cppModel = process.env.WHISPER_CPP_MODEL
  if (cppBin && cppModel && fs.existsSync(cppBin) && fs.existsSync(cppModel)) {
    try {
      const outBase = `/tmp/mnx-stt-${id}`
      execSync(`'${cppBin}' -m '${cppModel}' -f '${wavPath}' -nt -otxt -of '${outBase}'`, { stdio: 'ignore', timeout: 120000, env })
      const txt = readFileSafe(`${outBase}.txt`)
      rm([srcPath, wavPath, `${outBase}.txt`])
      if (txt) return res.json({ text: txt.trim() })
    } catch (e) { console.error('[transcribe] whisper.cpp failed:', e.message) }
  }
  // 2) openai-whisper CLI
  try {
    const model = process.env.WHISPER_MODEL || 'base.en'
    const outDir = `/tmp/mnx-stt-out-${id}`
    fs.mkdirSync(outDir, { recursive: true })
    execSync(`whisper '${wavPath}' --model ${model} --language en --output_format txt --output_dir '${outDir}' --fp16 False`, { stdio: 'ignore', timeout: 180000, env })
    const files = fs.readdirSync(outDir).filter(f => f.endsWith('.txt'))
    const txt = files.length ? readFileSafe(path.join(outDir, files[0])) : ''
    rm([srcPath, wavPath])
    try { fs.rmSync(outDir, { recursive: true, force: true }) } catch {}
    if (txt) return res.json({ text: txt.trim() })
  } catch (e) { console.error('[transcribe] openai-whisper failed:', e.message) }
  rm([srcPath, wavPath])
  res.status(503).json({ error: 'no transcriber available — run install-telegram.command to set up whisper' })
})

// ─── Signal fleet delivery (fork watcher + daily brief + Signal Desk API) ────
// Personal (C lineage). Boots before Telegram so its endpoints exist even when
// the bot is disabled; Telegram's notify() is injected after initTelegram.
let signalApi = null
try {
  signalApi = initSignal({ app, config, REPO, readFileSafe })
} catch (e) {
  console.error('[Signal] init failed:', e.message)
}

// ─── Telegram bot (SFS status feed + remote control) ─────────────────────────
// Registered before the SPA fallback so /api/notify resolves correctly.
try {
  if (process.env.NEXUS_DISABLE_TELEGRAM) throw new Error('disabled by NEXUS_DISABLE_TELEGRAM (dev run)')
  const tgOllamaUrl = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '')
  const tgApi = initTelegram({ app, config, REPO, readFileSafe, generateTTS, signal: signalApi, brain })
  if (signalApi && tgApi?.notify) signalApi.setNotify(tgApi.notify)
  if (signalApi && tgApi?.notifyDocument) signalApi.setNotifyDocument(tgApi.notifyDocument)
  // Give the brain its push channel: escalated mini-Nexus jobs notify the phone
  // through Telegram, and Director-path files default to a Telegram document.
  if (tgApi?.notify) brain.setNotify(tgApi.notify)
  if (tgApi?.notifyDocument) brain.setNotifyDocument(tgApi.notifyDocument)

  // ─── Umbruh ingress gate (vault → Goose system → Director's Telegram) ──────
  // Inside the Telegram try block on purpose: without notify() the gate cannot
  // deliver, so a disabled/dev run must not claim vault messages it can't send.
  const gateApi = initGate({ config, ollamaUrl: tgOllamaUrl })
  if (gateApi && tgApi?.notify) gateApi.setNotify(tgApi.notify)
} catch (e) {
  console.error('[Telegram] init failed:', e.message)
}

// ─── personal (Goose-only): pull shared UI updates from the product console ───
// Runs sync-nexus-ui.command (dry-run, or --apply). On apply, rebuilds this Nexus
// and swaps the fresh frontend into the running app; the UI then reloads itself.
// Localhost-only + fixed paths (no user input) → safe to shell out. NOT present in
// the product build. See NEXUS-lineage-and-sync-map.md.
app.post('/api/sync-ui', (req, res) => {
  const apply = !!(req.body && req.body.apply)
  const SYNC = '/Users/goose/Documents/sfs-vault/GitHub/goose-system/System Development/sync-nexus-ui.command'
  const SRC = '/Users/goose/Documents/goose-director'
  const DIST_TARGET = path.join(__dirname, 'dist')
  if (!fs.existsSync(SYNC)) {
    return res.status(404).json({ ok: false, error: 'Sync tool not found:\n' + SYNC })
  }
  const sameTree = path.resolve(DIST_TARGET) === path.resolve(SRC, 'dist')
  // When running from the packaged app, __dirname is the bundle's app/ dir. The
  // built UI (dist) gets copied here — but historically the SERVER files did NOT,
  // so a "sync" shipped new UI against a stale server (e.g. new /api/domains UI
  // calling a route the old server lacked → "No domains found"). Carry the server
  // files (server/telegram/signal .mjs) too, so a sync actually deploys the whole
  // app. These take effect on the NEXT LAUNCH (the running node process keeps the
  // old code in memory), so we flag serverSynced and the UI prompts a relaunch.
  const APP_DIR = path.dirname(DIST_TARGET)
  const SERVER_FILES = ['server.mjs', 'telegram.mjs', 'signal.mjs', 'gate.mjs']
  const syncServerCmd = SERVER_FILES.map(f => `cp "${SRC}/${f}" "${APP_DIR}/${f}"`).join(' && ')
  // login shell (-l) so npm/node resolve on PATH inside the packaged app.
  const cmd = !apply
    ? `"${SYNC}"`
    : sameTree
      ? `"${SYNC}" --apply && cd "${SRC}" && npm run build`
      : `"${SYNC}" --apply && cd "${SRC}" && npm run build && rm -rf "${DIST_TARGET}" && cp -R "${SRC}/dist" "${DIST_TARGET}" && ${syncServerCmd}`
  // strip ANSI colour codes + stray control chars so the panel shows clean text
  const clean = (s) => (s || '').toString()
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
  try {
    const output = execFileSync('/bin/bash', ['-lc', cmd], {
      encoding: 'utf8',
      timeout: apply ? 240000 : 60000,
      maxBuffer: 8 * 1024 * 1024,
    })
    // serverSynced ⇒ server files changed on disk but the live process is stale:
    // the UI reloads the webview for UI changes AND tells the Director to relaunch.
    res.json({ ok: true, output: clean(output), reload: apply, serverSynced: apply && !sameTree })
  } catch (e) {
    res.json({ ok: false, output: clean(e.stdout), error: clean(e.stderr || e.message) })
  }
})

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
// Register the general-use engine routes just before listen, so they see the
// fully-initialized `config`. Read-only/additive; personal routes are untouched.
registerGeneralUseRoutes(app, {
  getConfig: () => config,
  sandboxEnabled,
  sanitizeCapabilities: (typeof sanitizeCapabilities === 'function' ? sanitizeCapabilities : undefined),
  priceFor: (modelString) => (PRICE[modelString] ? PRICE[modelString][0] : undefined),
})

const PORT = Number(process.env.NEXUS_PORT) || 3001
// Bind loopback-only by default so the API/UI is never exposed to the LAN.
// Override with NEXUS_HOST only if you deliberately need remote access (+ firewall).
const HOST = process.env.NEXUS_HOST || '127.0.0.1'
app.listen(PORT, HOST, () => {
  console.log(`Nexus API on ${HOST}:${PORT}`)
  console.log('Goose Director API running on http://localhost:3001')
  console.log('Repo path:', REPO, fs.existsSync(REPO) ? '✓ found' : '✗ not found — using static data')
})
