// GU6.1 tests — Artifact model (pure).
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ARTIFACT_STATES, ARTIFACT_TYPES,
  createArtifact, currentContent, reviseArtifact, restoreArtifactVersion,
  setArtifactState, summarize, validateArtifact,
} from '../src/lib/artifacts.js'

const T0 = '2026-07-13T20:00:00.000Z'
const mk = (over = {}) => createArtifact({ id: 'art_1', type: 'document', title: 'Notes', content: 'v1 body', now: T0, ...over })

test('create yields a valid v1 draft with provenance', () => {
  const a = mk({ provenance: { runId: 'run_9', modelId: 'claude-haiku', sources: ['README.md'] } })
  assert.ok(validateArtifact(a))
  assert.equal(a.state, 'draft')
  assert.equal(a.currentVersion, 1)
  assert.equal(currentContent(a), 'v1 body')
  assert.deepEqual(a.versions[0].provenance, { runId: 'run_9', modelId: 'claude-haiku', sources: ['README.md'] })
})

test('create rejects bad type/title/content', () => {
  assert.equal(createArtifact({ id: 'x', type: 'nope', title: 't', content: '', now: T0 }), null)
  assert.equal(createArtifact({ id: 'x', type: 'document', title: '', content: '', now: T0 }), null)
  assert.equal(createArtifact({ id: '', type: 'document', title: 't', content: '', now: T0 }), null)
  assert.equal(createArtifact({ id: 'x', type: 'document', title: 't', content: 42, now: T0 }), null)
})

test('revise appends a version without mutating the original', () => {
  const a = mk()
  const b = reviseArtifact(a, { content: 'v2 body', now: '2026-07-13T21:00:00Z' })
  assert.equal(a.currentVersion, 1, 'original untouched')
  assert.equal(b.currentVersion, 2)
  assert.equal(currentContent(b), 'v2 body')
  assert.equal(b.versions.length, 2)
  assert.equal(reviseArtifact(a, { content: 99 }), null)   // bad content
})

test('restore is non-destructive — appends the old content as a new version', () => {
  let a = mk()
  a = reviseArtifact(a, { content: 'v2', now: T0 })
  a = reviseArtifact(a, { content: 'v3', now: T0 })
  const restored = restoreArtifactVersion(a, 1, T0)
  assert.equal(restored.currentVersion, 4)               // history grows, never rewritten
  assert.equal(currentContent(restored), 'v1 body')
  assert.equal(restored.versions[3].provenance.restoredFrom, 1)
  assert.equal(restoreArtifactVersion(a, 99, T0), null)  // no such version
})

test('state machine: draft↔approved free, publish forward-only from approved', () => {
  const a = mk()
  assert.equal(setArtifactState(a, 'published', T0), null, 'cannot publish a draft directly')
  const approved = setArtifactState(a, 'approved', T0)
  assert.equal(approved.state, 'approved')
  const published = setArtifactState(approved, 'published', T0)
  assert.equal(published.state, 'published')
  assert.equal(setArtifactState(published, 'draft', T0), null, 'published is terminal (un-publish = new revision)')
  assert.equal(setArtifactState(a, 'bogus', T0), null)
  for (const s of ARTIFACT_STATES) assert.ok(typeof s === 'string')
})

test('validate rejects malformed stored artifacts', () => {
  assert.equal(validateArtifact(null), false)
  assert.equal(validateArtifact({ id: 'x', type: 'document', state: 'draft', versions: [], currentVersion: 1 }), false)
  assert.equal(validateArtifact({ id: 'x', type: 'document', state: 'draft', versions: [{ version: 1 }], currentVersion: 5 }), false)
  assert.equal(validateArtifact({ id: 'x', type: 'nope', state: 'draft', versions: [{ version: 1 }], currentVersion: 1 }), false)
})

test('summarize omits full content but keeps provenance + counts', () => {
  let a = mk({ provenance: { modelId: 'm' } })
  a = reviseArtifact(a, { content: 'v2', now: T0 })
  const s = summarize(a)
  assert.equal(s.versionCount, 2)
  assert.equal(s.currentVersion, 2)
  assert.equal(s.content, undefined, 'no content in summary')
  assert.ok(ARTIFACT_TYPES.includes(s.type))
})
