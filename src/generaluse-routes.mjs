// General-use engine routes — ported from the nexus-product general-use build
// (2026-07-14 lineage sync). Self-contained: registers the capability manifest,
// skills, routing policies, artifacts, projects, memory, runs, and Agentic
// System Builder endpoints on the given Express app, using the host server's
// live `config` (passed via deps). Kept in one module so the personal server.mjs
// only needs one import + one call — the personal server body is untouched.
//
// Stores live in userData (NEXUS_USER_DATA || ~/Library/Application Support/Nexus),
// mirroring the personal server's own userData convention.

import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'node:crypto'

import { listCapabilities, applyVerificationOverlay, normalizeVerificationOverlay } from './lib/capability-registry.js'
import { listSkills } from './lib/skill-registry.js'
import { listRoutingPolicies, applyRoutingPolicy } from './lib/routing-policies.js'
import {
  createArtifact, currentContent, reviseArtifact, restoreArtifactVersion,
  setArtifactState, summarize, validateArtifact,
} from './lib/artifacts.js'
import {
  createProject, projectAllowsProvider, summarizeProject, updateProject, validateProject,
} from './lib/projects.js'
import { createMemory, groupByClass, reviseMemory, validateMemory } from './lib/memory.js'
import {
  BUILDER_STAGES, builderProgress, generateStarterPack, newBuilderState,
  setCreativeIdentity, setEntry, setStage, validateBuilder,
} from './lib/builder.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const USER_DATA = process.env.NEXUS_USER_DATA || path.join(os.homedir(), 'Library', 'Application Support', 'Nexus')
const dataDir = (name) => path.join(USER_DATA, name)

// ─── stores ──────────────────────────────────────────────────────────────
const RUNS_DIR = dataDir('runs')
const ARTIFACTS_DIR = dataDir('artifacts')
const PROJECTS_DIR = dataDir('projects')
const MEMORY_DIR = dataDir('memory')
const BUILDER_FILE = dataDir('builder.json')

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }) }

// artifacts
function artifactPath(id) { const s = String(id).replace(/[^a-zA-Z0-9_-]/g, ''); return s ? path.join(ARTIFACTS_DIR, `${s}.json`) : null }
function loadArtifact(id) { const p = artifactPath(id); if (!p || !fs.existsSync(p)) return null; try { const a = JSON.parse(fs.readFileSync(p, 'utf8')); return validateArtifact(a) ? a : null } catch { return null } }
function saveArtifact(a) { if (!validateArtifact(a)) return false; try { ensureDir(ARTIFACTS_DIR); fs.writeFileSync(artifactPath(a.id), JSON.stringify(a, null, 2)); return true } catch (e) { console.warn(`[artifacts] ${e.message}`); return false } }

// projects
function projectFilePath(id) { const s = String(id).replace(/[^a-zA-Z0-9_-]/g, ''); return s ? path.join(PROJECTS_DIR, `${s}.json`) : null }
function loadProject(id) { const p = projectFilePath(id); if (!p || !fs.existsSync(p)) return null; try { const o = JSON.parse(fs.readFileSync(p, 'utf8')); return validateProject(o) ? o : null } catch { return null } }
function saveProject(o) { if (!validateProject(o)) return false; try { ensureDir(PROJECTS_DIR); fs.writeFileSync(projectFilePath(o.id), JSON.stringify(o, null, 2)); return true } catch (e) { console.warn(`[projects] ${e.message}`); return false } }

// memory
function memoryFilePath(scope) { const s = String(scope).replace(/[^a-zA-Z0-9_-]/g, ''); return s ? path.join(MEMORY_DIR, `${s}.jsonl`) : null }
function loadMemories(scope) { const p = memoryFilePath(scope); if (!p || !fs.existsSync(p)) return []; try { return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(m => validateMemory(m)) } catch { return [] } }
function writeMemories(scope, mems) { const p = memoryFilePath(scope); if (!p) return false; try { ensureDir(MEMORY_DIR); fs.writeFileSync(p, mems.map(m => JSON.stringify(m)).join('\n') + (mems.length ? '\n' : '')); return true } catch (e) { console.warn(`[memory] ${e.message}`); return false } }

// runs
function saveRunRecord(record) { try { ensureDir(RUNS_DIR); fs.writeFileSync(path.join(RUNS_DIR, `${record.id}.json`), JSON.stringify(record, null, 2)) } catch (e) { console.warn(`[runs] ${e.message}`) } }

// builder
function loadBuilder() { try { if (fs.existsSync(BUILDER_FILE)) { const o = JSON.parse(fs.readFileSync(BUILDER_FILE, 'utf8')); if (validateBuilder(o)) return o } } catch { /* fresh */ } return newBuilderState({ id: 'builder', now: new Date().toISOString() }) }
function saveBuilder(o) { if (!validateBuilder(o)) return false; try { fs.writeFileSync(BUILDER_FILE, JSON.stringify(o, null, 2)); return true } catch (e) { console.warn(`[builder] ${e.message}`); return false } }

// ─── route registration ──────────────────────────────────────────────────
// deps: { getConfig(): config, sandboxEnabled(): bool, sanitizeCapabilities(input, prior): obj, priceFor(modelString): number|undefined }
export function registerGeneralUseRoutes(app, deps = {}) {
  const getConfig = deps.getConfig || (() => ({}))
  const sandboxEnabled = deps.sandboxEnabled || (() => false)
  const sanitizeCapabilities = deps.sanitizeCapabilities || ((x) => x || { enforced: false, models: {} })
  const priceFor = deps.priceFor || (() => undefined)

  // load capability verification overlay (userData) — fail closed
  let capVerifications = {}
  try {
    const f = dataDir('capability-verifications.json')
    if (fs.existsSync(f)) capVerifications = normalizeVerificationOverlay(JSON.parse(fs.readFileSync(f, 'utf8')))
  } catch { capVerifications = {} }

  // ── capabilities manifest ──
  app.get('/api/capabilities', (req, res) => {
    const config = getConfig()
    res.json({
      capabilities: applyVerificationOverlay(listCapabilities(), capVerifications, new Date().toISOString()),
      enforced: config.capabilities?.enforced === true,
      grants: sanitizeCapabilities(config.capabilities, { enforced: false, models: {} }),
      runtime: { sandboxEnabled: sandboxEnabled(), generatedAt: new Date().toISOString() },
    })
  })

  // ── skills ──
  app.get('/api/skills', (req, res) => res.json({ skills: listSkills() }))

  // ── routing policies (+ preview) ──
  app.get('/api/routing-policies', (req, res) => {
    const config = getConfig()
    const policies = listRoutingPolicies()
    const policy = req.query.policy
    if (!policy) return res.json({ policies })
    const models = (config.models || []).map(m => ({ id: m.id, provider: m.provider, tier: m.tier, pricePerMTokUsd: m.provider === 'ollama' ? 0 : priceFor(m.model) }))
    res.json({ policies, preview: applyRoutingPolicy(String(policy), models) })
  })

  // ── artifacts ──
  app.get('/api/artifacts', (req, res) => {
    if (!fs.existsSync(ARTIFACTS_DIR)) return res.json({ artifacts: [] })
    const artifacts = fs.readdirSync(ARTIFACTS_DIR).filter(f => f.endsWith('.json')).map(f => { const a = loadArtifact(f.replace('.json', '')); return a ? summarize(a) : null }).filter(Boolean).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    res.json({ artifacts })
  })
  app.get('/api/artifacts/:id', (req, res) => { const a = loadArtifact(req.params.id); if (!a) return res.status(404).json({ error: 'not found' }); res.json(a) })
  app.post('/api/artifacts', (req, res) => {
    const { type, title, content, provenance, projectId } = req.body || {}
    const a = createArtifact({ id: `art_${Date.now()}_${randomUUID().slice(0, 8)}`, type, title, content: content ?? '', now: new Date().toISOString(), provenance })
    if (!a) return res.status(400).json({ error: 'invalid artifact (need type, title, string content)' })
    if (projectId && typeof projectId === 'string') a.projectId = projectId
    if (!saveArtifact(a)) return res.status(500).json({ error: 'could not save' })
    res.json(a)
  })
  app.post('/api/artifacts/:id/revise', (req, res) => { const a = loadArtifact(req.params.id); if (!a) return res.status(404).json({ error: 'not found' }); const n = reviseArtifact(a, { content: req.body?.content, now: new Date().toISOString(), provenance: req.body?.provenance }); if (!n) return res.status(400).json({ error: 'invalid content' }); saveArtifact(n); res.json(n) })
  app.post('/api/artifacts/:id/restore', (req, res) => { const a = loadArtifact(req.params.id); if (!a) return res.status(404).json({ error: 'not found' }); const n = restoreArtifactVersion(a, Number(req.body?.version), new Date().toISOString()); if (!n) return res.status(400).json({ error: 'no such version' }); saveArtifact(n); res.json(n) })
  app.post('/api/artifacts/:id/state', (req, res) => { const a = loadArtifact(req.params.id); if (!a) return res.status(404).json({ error: 'not found' }); const n = setArtifactState(a, req.body?.state, new Date().toISOString()); if (!n) return res.status(400).json({ error: `illegal state transition from ${a.state} to ${req.body?.state}` }); saveArtifact(n); res.json(n) })
  app.get('/api/artifacts/:id/export', (req, res) => {
    const a = loadArtifact(req.params.id); if (!a) return res.status(404).json({ error: 'not found' })
    const ext = { document: 'md', code: 'txt', table: 'csv', report: 'md', presentation: 'md', image: 'txt', tool: 'txt' }[a.type] || 'txt'
    res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${a.id}.${ext}"`); res.send(currentContent(a) ?? '')
  })

  // ── projects ──
  app.get('/api/projects', (req, res) => {
    if (!fs.existsSync(PROJECTS_DIR)) return res.json({ projects: [] })
    const projects = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.json')).map(f => { const o = loadProject(f.replace('.json', '')); return o ? summarizeProject(o) : null }).filter(Boolean).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    res.json({ projects })
  })
  app.get('/api/projects/:id', (req, res) => { const o = loadProject(req.params.id); if (!o) return res.status(404).json({ error: 'not found' }); res.json(o) })
  app.post('/api/projects', (req, res) => { const { name, instructions, sources, routing, providerRestrictions } = req.body || {}; const o = createProject({ id: `proj_${Date.now()}_${randomUUID().slice(0, 8)}`, name, now: new Date().toISOString(), instructions, sources, routing, providerRestrictions }); if (!o) return res.status(400).json({ error: 'invalid project (need a name)' }); if (!saveProject(o)) return res.status(500).json({ error: 'could not save' }); res.json(o) })
  app.post('/api/projects/:id', (req, res) => { const o = loadProject(req.params.id); if (!o) return res.status(404).json({ error: 'not found' }); const n = updateProject(o, req.body || {}, new Date().toISOString()); if (!n) return res.status(400).json({ error: 'invalid update' }); saveProject(n); res.json(n) })
  app.get('/api/projects/:id/items', (req, res) => {
    const id = req.params.id; if (!loadProject(id)) return res.status(404).json({ error: 'not found' })
    const runs = fs.existsSync(RUNS_DIR) ? fs.readdirSync(RUNS_DIR).filter(f => f.endsWith('.json')).map(f => { try { const r = JSON.parse(fs.readFileSync(path.join(RUNS_DIR, f), 'utf8')); return r.projectId === id ? { id: r.id, mode: r.mode, task: (r.task || '').slice(0, 120), startedAt: r.startedAt } : null } catch { return null } }).filter(Boolean) : []
    const artifacts = fs.existsSync(ARTIFACTS_DIR) ? fs.readdirSync(ARTIFACTS_DIR).filter(f => f.endsWith('.json')).map(f => { const a = loadArtifact(f.replace('.json', '')); return a && a.projectId === id ? summarize(a) : null }).filter(Boolean) : []
    res.json({ runs, artifacts })
  })

  // ── memory ──
  app.get('/api/memory/:scope', (req, res) => { const mems = loadMemories(req.params.scope); res.json({ scope: req.params.scope, grouped: groupByClass(mems), count: mems.length }) })
  app.post('/api/memory/:scope', (req, res) => { const { cls, content, origin } = req.body || {}; const m = createMemory({ id: `mem_${Date.now()}_${randomUUID().slice(0, 8)}`, scope: req.params.scope, cls, content, now: new Date().toISOString(), origin }); if (!m) return res.status(400).json({ error: 'invalid memory' }); const mems = loadMemories(req.params.scope); mems.push(m); writeMemories(req.params.scope, mems); res.json(m) })
  app.post('/api/memory/:scope/:id', (req, res) => { const mems = loadMemories(req.params.scope); const i = mems.findIndex(m => m.id === req.params.id); if (i < 0) return res.status(404).json({ error: 'not found' }); const n = reviseMemory(mems[i], { content: req.body?.content, now: new Date().toISOString(), reverify: req.body?.reverify }); if (!n) return res.status(400).json({ error: 'invalid edit' }); mems[i] = n; writeMemories(req.params.scope, mems); res.json(n) })
  app.delete('/api/memory/:scope/:id', (req, res) => { const mems = loadMemories(req.params.scope); const kept = mems.filter(m => m.id !== req.params.id); if (kept.length === mems.length) return res.status(404).json({ error: 'not found' }); writeMemories(req.params.scope, kept); res.json({ ok: true, remaining: kept.length }) })

  // ── runs (read) ──
  app.get('/api/runs', (req, res) => {
    if (!fs.existsSync(RUNS_DIR)) return res.json([])
    const runs = fs.readdirSync(RUNS_DIR).filter(f => f.endsWith('.json')).map(f => { try { const r = JSON.parse(fs.readFileSync(path.join(RUNS_DIR, f), 'utf8')); const fin = (r.events || []).find(e => e.type === 'final'); return { id: r.id, mode: r.mode, task: (r.task || '').slice(0, 200), startedAt: r.startedAt, finishedAt: r.finishedAt, costUSD: r.costUSD, events: (r.events || []).length, hasFinal: !!fin, routing: fin?.routing || null } } catch { return null } }).filter(Boolean).sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))
    res.json(runs.slice(0, 200))
  })
  app.get('/api/runs/:id', (req, res) => { const safe = String(req.params.id).replace(/[^a-zA-Z0-9_-]/g, ''); const p = path.join(RUNS_DIR, `${safe}.json`); if (!fs.existsSync(p)) return res.status(404).json({ error: 'not found' }); try { res.json(JSON.parse(fs.readFileSync(p, 'utf8'))) } catch (e) { res.status(500).json({ error: e.message }) } })

  // ── Agentic System Builder ──
  app.get('/api/builder', (req, res) => { const state = loadBuilder(); res.json({ stages: BUILDER_STAGES, state, progress: builderProgress(state) }) })
  app.post('/api/builder', (req, res) => {
    let state = loadBuilder()
    const { stageId, done, note, entry, creativeIdentity } = req.body || {}
    if (entry !== undefined) { const n = setEntry(state, entry, new Date().toISOString()); if (!n) return res.status(400).json({ error: 'invalid entry' }); state = n }
    if (stageId !== undefined) { const n = setStage(state, stageId, done, note, new Date().toISOString()); if (!n) return res.status(400).json({ error: 'invalid stage' }); state = n }
    if (creativeIdentity !== undefined) { const n = setCreativeIdentity(state, creativeIdentity, new Date().toISOString()); if (n) state = n }
    saveBuilder(state); res.json({ state, progress: builderProgress(state) })
  })
  app.post('/api/builder/generate', (req, res) => {
    const { purpose, systemName, routing } = req.body || {}
    const pack = generateStarterPack({ purpose, systemName, routing })
    const pid = `proj_${Date.now()}_${randomUUID().slice(0, 8)}`
    const project = createProject({ id: pid, name: (systemName || 'My First System').slice(0, 120), now: new Date().toISOString(), instructions: (purpose || '').slice(0, 2000), routing, sources: pack.map(f => f.path) })
    if (!project || !saveProject(project)) return res.status(500).json({ error: 'could not create project' })
    const art = createArtifact({ id: `art_${Date.now()}_${randomUUID().slice(0, 8)}`, type: 'document', title: `${project.name} — starter pack`, content: pack.map(f => `## ${f.path}\n\n${f.content}`).join('\n\n---\n\n'), now: new Date().toISOString(), provenance: { by: 'agentic-system-builder' } })
    if (art) { art.projectId = pid; saveArtifact(art) }
    let state = loadBuilder(); state = { ...state, projectId: pid, updatedAt: new Date().toISOString() }; saveBuilder(state)
    res.json({ projectId: pid, artifactId: art?.id || null, files: pack.map(f => f.path), progress: builderProgress(state) })
  })
}

// Exported for the Council/sandbox handler (Phase B): write run records + mint
// artifacts + read project restrictions using the SAME stores.
export const generalUseStores = {
  RUNS_DIR, ARTIFACTS_DIR, PROJECTS_DIR, MEMORY_DIR,
  saveRunRecord, saveArtifact, createArtifact, loadProject, projectAllowsProvider,
}
