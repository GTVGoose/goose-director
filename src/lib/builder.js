// Agentic System Builder model — Phase 10 of the general-use roadmap (GU10),
// implementing the audit's "Agentic System Builder — training wheels that
// produce a working system". A persistent nine-stage checklist that carries a
// newcomer from "I understand what an agent is" to "I have a small agentic
// system that works", with completion PROOF (not slides-viewed).
//
// Pure model + validation + the generated starter-pack manifest. The server
// owns persistence and the view renders it; nothing here executes.

// The nine stages (audit "Builder stages" table). Each has a completion PROOF
// requirement, not a "viewed" flag — the audit is emphatic that onboarding is
// complete only when one verified workflow produced one durable artifact.
export const BUILDER_STAGES = Object.freeze([
  { id: 'purpose', title: 'Purpose', ask: 'What is one job you want this system to do repeatedly?', proof: 'You can describe the job in one sentence.' },
  { id: 'workspace', title: 'Workspace', ask: 'Choose or create a project folder; what will leave the device?', proof: 'Nexus can read the project and you know where it lives.' },
  { id: 'memory', title: 'Memory', ask: 'What should persist — preferences, facts, decisions?', proof: 'You saved and retrieved one harmless fact.' },
  { id: 'first-agent', title: 'First agent', ask: 'Create ONE agent: purpose, inputs, outputs, boundaries, escalation.', proof: 'The agent passes a plain-language role check.' },
  { id: 'routing', title: 'Model routing', ask: 'Pick an automatic policy — Fast, Best, Private, or Low cost.', proof: 'A provider/local model connection test succeeds.' },
  { id: 'tools', title: 'Tools and permissions', ask: 'Add at most one read-only tool; preview its scope.', proof: 'You correctly predict what the agent may and may not do.' },
  { id: 'workflow', title: 'First workflow', ask: 'Assemble Goal → Context → Agent → Tool → Result → Review; run on a safe sample.', proof: 'A full test completes and produces an artifact.' },
  { id: 'verification', title: 'Verification', ask: 'Review result quality, sources, cost, privacy route, and stop/cancel.', proof: 'You can find the trace, the stop control, and the output.' },
  { id: 'grow', title: 'Grow carefully', ask: 'Add a second agent, a reviewer, an automation, or a creative identity — only now.', proof: 'You choose one next capability or finish.' },
])

const STAGE_IDS = BUILDER_STAGES.map(s => s.id)

/** A fresh builder state: every stage pending, no system generated yet. */
export function newBuilderState({ id, now }) {
  return {
    id: id || 'builder',
    createdAt: typeof now === 'string' ? now : '',
    updatedAt: typeof now === 'string' ? now : '',
    // path chosen at first launch (audit "Entry choice"): use-now / build / connect
    entry: null,
    stages: Object.fromEntries(STAGE_IDS.map(s => [s, { done: false, note: '' }])),
    projectId: null,   // the project this system is built into (GU10.3)
    creativeIdentity: null,   // optional {name, archetype, sigil, colors} — presentation only
  }
}

const ENTRIES = new Set(['use-now', 'build', 'connect'])

/** Mark a stage done/undone with an optional note. Returns a NEW state or null. */
export function setStage(state, stageId, done, note, now) {
  if (!validateBuilder(state)) return null
  if (!STAGE_IDS.includes(stageId)) return null
  return {
    ...state,
    updatedAt: typeof now === 'string' ? now : state.updatedAt,
    stages: { ...state.stages, [stageId]: { done: done === true, note: typeof note === 'string' ? note.slice(0, 2000) : (state.stages[stageId]?.note || '') } },
  }
}

export function setEntry(state, entry, now) {
  if (!validateBuilder(state)) return null
  if (!ENTRIES.has(entry)) return null
  return { ...state, entry, updatedAt: typeof now === 'string' ? now : state.updatedAt }
}

/** Progress summary. `verified` is true only when ALL stages are proven done. */
export function builderProgress(state) {
  if (!validateBuilder(state)) return { done: 0, total: STAGE_IDS.length, verified: false, nextStage: STAGE_IDS[0] }
  const doneIds = STAGE_IDS.filter(s => state.stages[s]?.done)
  const next = STAGE_IDS.find(s => !state.stages[s]?.done) || null
  return { done: doneIds.length, total: STAGE_IDS.length, verified: doneIds.length === STAGE_IDS.length, nextStage: next }
}

export function validateBuilder(s) {
  if (!s || typeof s !== 'object' || !s.stages || typeof s.stages !== 'object') return false
  return STAGE_IDS.every(id => s.stages[id] && typeof s.stages[id] === 'object')
}

// ---------------------------------------------------------------------------
// Creative Identity (audit P3 "Optional mythology and identity system") — a
// presentation-only layer: name, archetype, sigil, colors, voice. The audit is
// emphatic: "A strict separation between symbolic identity and operational
// authority." So this normalizer accepts ONLY presentation fields and DROPS any
// smuggled authority (tools, permissions, grants, routing, scopes). The
// symbolic layer may shape motivation/language; it never changes tool access.
// ---------------------------------------------------------------------------

const IDENTITY_FIELDS = ['name', 'archetype', 'sigil', 'colors', 'voice']

/** Normalize a Creative Identity to presentation-only fields. Never carries authority. */
export function normalizeCreativeIdentity(raw) {
  if (!raw || typeof raw !== 'object') return null
  const out = {}
  for (const f of IDENTITY_FIELDS) {
    if (f === 'colors') {
      if (Array.isArray(raw.colors)) out.colors = raw.colors.filter(c => typeof c === 'string' && /^#?[0-9a-zA-Z ]{1,24}$/.test(c)).slice(0, 6)
    } else if (typeof raw[f] === 'string' && raw[f].length <= 200) {
      out[f] = raw[f]
    }
  }
  // Explicitly refuse to carry any authority-shaped key, even if the caller
  // tries — the symbolic layer NEVER changes tool access or permissions.
  // (We simply never copy tools/permissions/grants/routing/scopes/authority.)
  return Object.keys(out).length ? out : null
}

/** Attach a Creative Identity (presentation only). Returns a NEW state or null. */
export function setCreativeIdentity(state, identity, now) {
  if (!validateBuilder(state)) return null
  const ci = identity === null ? null : normalizeCreativeIdentity(identity)
  return { ...state, creativeIdentity: ci, updatedAt: typeof now === 'string' ? now : state.updatedAt }
}

// ---------------------------------------------------------------------------
// Generated starter pack (audit "Generated starter pack") — a portable, generic
// structure adapted to the user's purpose. Returned as an in-memory manifest of
// { path, content } files; the server writes them into the chosen project
// (GU10.3). No secrets, product-clean, no Goose/vault content.
// ---------------------------------------------------------------------------
export function generateStarterPack({ purpose, systemName, routing }) {
  const name = (typeof systemName === 'string' && systemName.trim()) ? systemName.trim().slice(0, 80) : 'My First System'
  const job = (typeof purpose === 'string' && purpose.trim()) ? purpose.trim().slice(0, 300) : 'Research and brief one topic each week'
  const route = ['auto', 'fast', 'best', 'private', 'low-cost'].includes(routing) ? routing : 'private'
  return [
    { path: 'SYSTEM.md', content: `# ${name}\n\n## Purpose\n${job}\n\n## Non-goals\n- Not a general chatbot.\n- No write/spend/publish actions in the starter loop.\n\n## First use case\n${job}\n` },
    { path: 'agents/registry.yaml', content: `agents:\n  - id: starter-agent\n    name: Starter Agent\n    role: read-only researcher\n    status: active\n` },
    { path: 'agents/starter-agent.md', content: `# Starter Agent\n\n- **Role:** read sources and brief the topic.\n- **Boundaries:** read-only. No writes, no shell, no spending.\n- **Escalation:** if unsure, ask; never improvise with tools.\n` },
    { path: 'memory/README.md', content: `# Memory\n\nClasses: source · fact · preference · decision · summary.\nLocal-first, inspectable, editable, deletable. Record origin + last verification.\n` },
    { path: 'memory/project-context.md', content: `# Project context\n\n(Starter — add durable facts your system should remember.)\n` },
    { path: 'policies/permissions.yaml', content: `routing: ${route}\ntools:\n  - id: read_file\n    scope: mounted repo only\n    approval: none\nwrites: disabled\ncomputer_use: disabled\n` },
    { path: 'workflows/first-workflow.md', content: `# First workflow\n\nGoal → Context → Agent (starter-agent) → Tool (read_file) → Result → Review.\nRun on a safe sample before real data.\n` },
    { path: 'tests/first-run-checklist.md', content: `# First-run checklist\n\n- [ ] The workflow completed on a safe sample.\n- [ ] It produced one durable artifact.\n- [ ] You found the run trace, the stop control, and the output.\n- [ ] You know which provider (if any) received data.\n` },
  ]
}
