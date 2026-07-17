// Skill Registry + capability-kit assembly — Phase 5 of the general-use roadmap
// (GU5), implementing the audit's "Capability kit assembled per assignment".
//
// A Skill is a DECLARATIVE manifest: purpose, instructions, the capabilities it
// needs, and the least-privilege tool scopes it may use. A skill may REQUEST
// capabilities but cannot grant them and cannot contain secrets. The assembler
// turns (skill + requester + run) into an immutable capability kit that exposes
// only the tools the skill declared — replacing the current "hand every worker
// the full SANDBOX_TOOLS list" exposure (audit: "The Orchestrator should not
// hand every tool to every model").
//
// Pure module: no fs, no network, no config mutation, no execution. Enforcement
// of the kit at tool time still rides the Phase-3 broker + sandbox gate; this
// module only decides WHICH tools a skill's kit contains.

import { createHash } from 'node:crypto'
import { TOOL_REGISTRY, getTool } from './tool-registry.js'

const isStr = (v, max = 4000) => typeof v === 'string' && v.length > 0 && v.length <= max

export const SKILL_RISK = Object.freeze(['read-only', 'low', 'medium', 'high'])

/**
 * Normalize a skill manifest. Returns the normalized skill or null when the
 * manifest is unusable. Every tool referenced must exist in the Tool Registry
 * (unknown tools are DROPPED, fail closed); a skill declaring no valid tools is
 * a read-only reasoning skill (allowed).
 */
export function normalizeSkill(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (!isStr(raw.id, 100) || !/^[a-z0-9][a-z0-9.-]{0,99}$/.test(raw.id)) return null
  if (!isStr(raw.purpose, 500)) return null
  const version = Number.isInteger(raw.version) && raw.version >= 1 ? raw.version : 1
  const tools = Array.isArray(raw.tools)
    ? [...new Set(raw.tools.filter(t => typeof t === 'string' && getTool(t)))]
    : []
  // A skill's tools imply the capabilities they ride; a skill can't invent a
  // capability its tools don't carry.
  const capabilities = [...new Set(tools.map(t => getTool(t).capability))]
  return Object.freeze({
    id: raw.id,
    version,
    purpose: raw.purpose,
    instructions: isStr(raw.instructions) ? raw.instructions : '',
    tools: Object.freeze(tools),
    capabilities: Object.freeze(capabilities),
    risk: SKILL_RISK.includes(raw.risk) ? raw.risk : (tools.every(t => getTool(t).readOnly) ? 'read-only' : 'high'),
    providers: Array.isArray(raw.providers) ? Object.freeze(raw.providers.filter(p => typeof p === 'string')) : null, // null = any
    outputSchema: isStr(raw.outputSchema, 200) ? raw.outputSchema : null,
  })
}

// ---------------------------------------------------------------------------
// Starter library — a small, verified, GENERIC set (audit: "a small verified
// starter library"). No Goose/Umbruh/vault/mythology content — product-clean.
// ---------------------------------------------------------------------------
const STARTER = [
  {
    id: 'research.source-check',
    version: 1,
    purpose: 'Research a question and verify claims against sources.',
    instructions: 'Gather information, cite sources for each claim, and flag anything unverified. Prefer primary sources.',
    tools: ['fetch_url', 'read_file'],   // read-only
    risk: 'read-only',
    outputSchema: 'report',
  },
  {
    id: 'writing.edit',
    version: 1,
    purpose: 'Draft or revise prose to a brief.',
    instructions: 'Write or edit toward the stated goal and audience. Keep the author\'s voice. Show what changed.',
    tools: [],   // pure reasoning, no tools
    risk: 'read-only',
    outputSchema: 'document',
  },
  {
    id: 'project.organize',
    version: 1,
    purpose: 'Read a project folder and propose an organization.',
    instructions: 'Read the files, summarize what is there, and propose a structure. Do not move or write files.',
    tools: ['read_file'],   // read-only
    risk: 'read-only',
    outputSchema: 'plan',
  },
  {
    id: 'code.review',
    version: 1,
    purpose: 'Review code in a repository for issues.',
    instructions: 'Read the relevant files and report correctness, clarity, and safety issues with file:line references. Do not edit.',
    tools: ['read_file'],   // read-only
    risk: 'read-only',
    outputSchema: 'findings',
  },
]

const REGISTRY = new Map()
for (const raw of STARTER) {
  const s = normalizeSkill(raw)
  if (s) REGISTRY.set(s.id, s)
}

export function listSkills() { return [...REGISTRY.values()] }
export function getSkill(id) { return REGISTRY.get(id) || null }

// ---------------------------------------------------------------------------
// Capability-kit assembly (audit "Capability kit assembled per assignment")
// ---------------------------------------------------------------------------

/**
 * Assemble an immutable, least-privilege capability kit for one assignment.
 * The kit exposes ONLY the tools the skill declared — NOT the full tool list.
 * `allTools` defaults to the whole registry (used to compute what was withheld).
 * Returns { kitId, skillId, requesterId, runId, tools, withheld, capabilities,
 *           risk, hash }. Pure; grants/enforcement are unchanged (broker + sandbox).
 */
export function assembleKit({ skill, requesterId, runId }, allTools = Object.keys(TOOL_REGISTRY)) {
  const s = typeof skill === 'string' ? getSkill(skill) : normalizeSkill(skill)
  const tools = s ? [...s.tools] : []
  const allowed = new Set(tools)
  const withheld = allTools.filter(t => !allowed.has(t))
  const hash = createHash('sha256')
    .update(`${s?.id || 'none'}@${s?.version || 0}|${String(requesterId)}|${String(runId)}|${[...tools].sort().join(',')}`)
    .digest('hex').slice(0, 12)
  return Object.freeze({
    kitId: `kit_${hash}`,
    skillId: s?.id || null,
    skillVersion: s?.version || null,
    requesterId: requesterId ?? null,
    runId: runId ?? null,
    tools: Object.freeze(tools),
    withheld: Object.freeze(withheld),
    capabilities: Object.freeze(s ? [...s.capabilities] : []),
    risk: s?.risk || 'read-only',
    hash,
  })
}

/**
 * Does a kit permit a given tool? The single question the worker-dispatch path
 * asks before exposing a tool schema to a model. A kit with no skill exposes
 * nothing (fail closed) — a caller must opt into a skill to get tools.
 */
export function kitAllowsTool(kit, toolName) {
  return !!kit && Array.isArray(kit.tools) && kit.tools.includes(toolName)
}
