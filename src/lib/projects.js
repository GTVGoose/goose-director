// Project model — Phase 6 of the general-use roadmap (GU6), implementing the
// audit's "Projects as a first-class object" (P1) and Finding: the durable
// context boundary. A Project groups instructions, sources, routing
// preferences, provider restrictions, and (by reference) the runs and artifacts
// produced under it — one scoped context so work keeps its memory.
//
// Pure model + validation; the server owns persistence (userData `projects/`)
// and the API. No fs/network here.

const nonEmpty = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= (max ?? 200)
const isStr = (v, max) => typeof v === 'string' && v.length <= (max ?? 20000)

// Routing policy names a Project may prefer (aligns with the audit's job-first
// policies; 'auto' defers to the runtime default).
export const PROJECT_ROUTING = Object.freeze(['auto', 'fast', 'best', 'private', 'low-cost'])

/**
 * Build a new project. `id`/`now` injected by the server (pure/deterministic).
 * Returns the record or null on invalid required fields.
 */
export function createProject({ id, name, now, instructions, sources, routing, providerRestrictions }) {
  if (!nonEmpty(id, 100)) return null
  if (!nonEmpty(name, 200)) return null
  const ts = isStr(now, 40) ? now : ''
  return {
    id,
    name,
    createdAt: ts,
    updatedAt: ts,
    instructions: isStr(instructions) ? instructions : '',
    sources: normStrArray(sources, 500, 256),
    routing: PROJECT_ROUTING.includes(routing) ? routing : 'auto',
    // provider ids this project may NOT use (audit "never send this project to
    // provider X" — a privacy/cost boundary). Stored as a denylist.
    providerRestrictions: normStrArray(providerRestrictions, 50, 32),
  }
}

function normStrArray(v, itemMax, cap) {
  if (!Array.isArray(v)) return []
  return [...new Set(v.filter(x => nonEmpty(x, itemMax)))].slice(0, cap)
}

/** Apply a partial update. Returns a NEW project (never mutates) or null if invalid. */
export function updateProject(project, patch, now) {
  if (!validateProject(project)) return null
  if (!patch || typeof patch !== 'object') return project
  const next = { ...project, updatedAt: isStr(now, 40) ? now : project.updatedAt }
  if (patch.name !== undefined) { if (!nonEmpty(patch.name, 200)) return null; next.name = patch.name }
  if (patch.instructions !== undefined) next.instructions = isStr(patch.instructions) ? patch.instructions : ''
  if (patch.sources !== undefined) next.sources = normStrArray(patch.sources, 500, 256)
  if (patch.routing !== undefined) next.routing = PROJECT_ROUTING.includes(patch.routing) ? patch.routing : next.routing
  if (patch.providerRestrictions !== undefined) next.providerRestrictions = normStrArray(patch.providerRestrictions, 50, 32)
  return next
}

/** Is a provider allowed for this project? (privacy/cost boundary check) */
export function projectAllowsProvider(project, provider) {
  if (!validateProject(project)) return true   // no project → no restriction
  return !project.providerRestrictions.includes(provider)
}

export function validateProject(p) {
  return !!p && typeof p === 'object' && nonEmpty(p.id, 100) && nonEmpty(p.name, 200) &&
    typeof p.instructions === 'string' && Array.isArray(p.sources) &&
    PROJECT_ROUTING.includes(p.routing) && Array.isArray(p.providerRestrictions)
}

export function summarizeProject(p) {
  if (!validateProject(p)) return null
  return {
    id: p.id, name: p.name, routing: p.routing,
    sourceCount: p.sources.length, hasInstructions: p.instructions.length > 0,
    providerRestrictions: p.providerRestrictions,
    createdAt: p.createdAt, updatedAt: p.updatedAt,
  }
}
