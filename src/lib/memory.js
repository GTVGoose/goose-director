// Memory model — Phase 6 of the general-use roadmap (GU6), implementing the
// audit's "Separate raw sources, durable facts, user preferences, decisions,
// summaries, and ephemeral run context" and "Make memory local-first,
// inspectable, editable, exportable, and deletable. Record origin and last
// verification."
//
// A memory is one typed, scoped note with provenance. Pure model + validation;
// the server owns persistence (userData `memory/<scope>.jsonl`) and the API.

const nonEmpty = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= (max ?? 200)
const isStr = (v, max) => typeof v === 'string' && v.length <= (max ?? 8000)

// The classes the audit calls out — each with a distinct retention meaning.
// Ephemeral run context is deliberately NOT here: it lives in the run record and
// is never promoted to memory automatically.
export const MEMORY_CLASSES = Object.freeze([
  'source',      // a raw source pointer (path/url) the project draws on
  'fact',        // a durable fact learned, with provenance
  'preference',  // a user preference about how to work
  'decision',    // a decision made, so it isn't relitigated
  'summary',     // a compressed summary of prior work
])

/**
 * Build a memory record. `id`/`now` injected by the server (pure/deterministic).
 * Returns the record or null on invalid required fields.
 */
export function createMemory({ id, scope, cls, content, now, origin }) {
  if (!nonEmpty(id, 100)) return null
  if (!nonEmpty(scope, 100)) return null            // e.g. a projectId, or 'global'
  if (!MEMORY_CLASSES.includes(cls)) return null
  if (!isStr(content) || content.length === 0) return null
  const ts = isStr(now, 40) ? now : ''
  return {
    id, scope, cls, content,
    createdAt: ts,
    verifiedAt: ts,                                  // last time a human/agent confirmed it
    origin: normOrigin(origin),                      // where it came from
  }
}

function normOrigin(o) {
  if (!o || typeof o !== 'object') return {}
  const out = {}
  if (nonEmpty(o.runId, 100)) out.runId = o.runId
  if (nonEmpty(o.modelId, 100)) out.modelId = o.modelId
  if (nonEmpty(o.by, 100)) out.by = o.by            // 'user' | model id | 'agent'
  return out
}

/** Edit content and/or re-verify. Returns a NEW record or null. */
export function reviseMemory(mem, { content, now, reverify } = {}) {
  if (!validateMemory(mem)) return null
  const next = { ...mem }
  if (content !== undefined) { if (!isStr(content) || content.length === 0) return null; next.content = content }
  if (reverify) next.verifiedAt = isStr(now, 40) ? now : mem.verifiedAt
  return next
}

/** Staleness helper (audit "record origin and last verification"). */
export function isStale(mem, nowIso, maxAgeDays) {
  if (!validateMemory(mem) || !mem.verifiedAt) return true
  const a = Date.parse(mem.verifiedAt), b = Date.parse(nowIso)
  if (Number.isNaN(a) || Number.isNaN(b)) return true
  return (b - a) / 86400000 > maxAgeDays
}

export function validateMemory(m) {
  return !!m && typeof m === 'object' && nonEmpty(m.id, 100) && nonEmpty(m.scope, 100) &&
    MEMORY_CLASSES.includes(m.cls) && isStr(m.content) && m.content.length > 0
}

/** Group a list of memories by class (for an inspectable view). */
export function groupByClass(memories) {
  const out = Object.fromEntries(MEMORY_CLASSES.map(c => [c, []]))
  for (const m of memories) if (validateMemory(m) && out[m.cls]) out[m.cls].push(m)
  return out
}
