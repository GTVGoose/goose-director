// Artifact model — Phase 6 of the general-use roadmap (GU6), implementing the
// audit's Finding 3 ("Nexus lacks a first-class durable output surface" — the
// most important missing table-stakes feature after the IA change).
//
// An Artifact is the durable, editable RESULT of work, with a stable identity
// INDEPENDENT of the chat that made it: type, versioned content, provenance
// (which run/model produced it), an approval state (draft → approved →
// published), and export. This module is the PURE model + validation; the
// server owns persistence (userData `artifacts/`, like runs/) and the API.
//
// No fs, no network here — pure functions over plain objects so the store and
// the tests share one source of truth.

export const ARTIFACT_TYPES = Object.freeze([
  'document', 'code', 'table', 'report', 'image', 'presentation', 'tool',
])

export const ARTIFACT_STATES = Object.freeze(['draft', 'approved', 'published'])

const isStr = (v, max) => typeof v === 'string' && v.length <= (max ?? 200000)
const nonEmpty = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= (max ?? 200)

/**
 * Build a NEW artifact record (version 1). `now` and `id` are injected by the
 * caller (the server stamps time/uuid — this module stays pure/deterministic).
 * Returns the record or null if required fields are invalid.
 */
export function createArtifact({ id, type, title, content, now, provenance }) {
  if (!nonEmpty(id, 100)) return null
  if (!ARTIFACT_TYPES.includes(type)) return null
  if (!nonEmpty(title, 300)) return null
  if (!isStr(content)) return null
  const ts = isStr(now, 40) ? now : ''
  const prov = normalizeProvenance(provenance)
  return {
    id,
    type,
    title,
    state: 'draft',
    createdAt: ts,
    updatedAt: ts,
    currentVersion: 1,
    versions: [{ version: 1, content, createdAt: ts, provenance: prov }],
  }
}

function normalizeProvenance(p) {
  if (!p || typeof p !== 'object') return {}
  const out = {}
  if (nonEmpty(p.runId, 100)) out.runId = p.runId
  if (nonEmpty(p.modelId, 100)) out.modelId = p.modelId
  if (nonEmpty(p.skillId, 100)) out.skillId = p.skillId
  if (Array.isArray(p.sources)) out.sources = p.sources.filter(s => nonEmpty(s, 500)).slice(0, 64)
  return out
}

/**
 * Append a new version with edited content. Returns a NEW artifact object (never
 * mutates the input) or null if content is invalid. Provenance is per-version.
 */
export function reviseArtifact(artifact, { content, now, provenance }) {
  if (!validateArtifact(artifact)) return null
  if (!isStr(content)) return null
  const version = artifact.currentVersion + 1
  const ts = isStr(now, 40) ? now : ''
  return {
    ...artifact,
    updatedAt: ts,
    currentVersion: version,
    versions: [...artifact.versions, { version, content, createdAt: ts, provenance: normalizeProvenance(provenance) }],
  }
}

/**
 * Restore a prior version by appending it as a NEW version (non-destructive —
 * history is never rewritten). Returns a new artifact or null if the target
 * version doesn't exist.
 */
export function restoreArtifactVersion(artifact, targetVersion, now) {
  if (!validateArtifact(artifact)) return null
  const target = artifact.versions.find(v => v.version === targetVersion)
  if (!target) return null
  const version = artifact.currentVersion + 1
  const ts = isStr(now, 40) ? now : ''
  return {
    ...artifact,
    updatedAt: ts,
    currentVersion: version,
    versions: [...artifact.versions, {
      version, content: target.content, createdAt: ts,
      provenance: { restoredFrom: targetVersion },
    }],
  }
}

/** Transition approval state with a legal-move check. Returns new artifact or null. */
export function setArtifactState(artifact, state, now) {
  if (!validateArtifact(artifact)) return null
  if (!ARTIFACT_STATES.includes(state)) return null
  // draft ↔ approved freely; published is forward-only from approved (publishing
  // is consequential — the audit's "clear boundary between draft, approved,
  // published"). Un-publishing requires an explicit new revision, not a toggle.
  const from = artifact.state
  const legal = {
    draft: ['draft', 'approved'],
    approved: ['approved', 'draft', 'published'],
    published: ['published'],
  }
  if (!legal[from]?.includes(state)) return null
  return { ...artifact, state, updatedAt: isStr(now, 40) ? now : artifact.updatedAt }
}

/** The current content (latest version). */
export function currentContent(artifact) {
  if (!validateArtifact(artifact)) return null
  const v = artifact.versions.find(x => x.version === artifact.currentVersion)
  return v ? v.content : null
}

/** Structural validation of a stored artifact (defensive load). */
export function validateArtifact(a) {
  if (!a || typeof a !== 'object') return false
  if (!nonEmpty(a.id, 100) || !ARTIFACT_TYPES.includes(a.type)) return false
  if (!ARTIFACT_STATES.includes(a.state)) return false
  if (!Array.isArray(a.versions) || a.versions.length === 0) return false
  if (!Number.isInteger(a.currentVersion) || a.currentVersion < 1) return false
  return a.versions.some(v => v.version === a.currentVersion)
}

/** A compact summary for the Library list (no full content). */
export function summarize(a) {
  if (!validateArtifact(a)) return null
  return {
    id: a.id, type: a.type, title: a.title, state: a.state,
    currentVersion: a.currentVersion, versionCount: a.versions.length,
    createdAt: a.createdAt, updatedAt: a.updatedAt,
    provenance: a.versions.find(v => v.version === a.currentVersion)?.provenance || {},
  }
}
