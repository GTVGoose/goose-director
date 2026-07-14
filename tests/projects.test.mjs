// GU6.3 tests — Project model (pure).
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PROJECT_ROUTING,
  createProject, projectAllowsProvider, summarizeProject, updateProject, validateProject,
} from '../src/lib/projects.js'

const T0 = '2026-07-13T20:00:00Z'
const mk = (over = {}) => createProject({ id: 'proj_1', name: 'Research', now: T0, ...over })

test('create yields a valid project with defaults', () => {
  const p = mk()
  assert.ok(validateProject(p))
  assert.equal(p.routing, 'auto')
  assert.deepEqual(p.sources, [])
  assert.deepEqual(p.providerRestrictions, [])
  assert.equal(p.instructions, '')
})

test('create rejects missing name/id and normalizes fields', () => {
  assert.equal(createProject({ id: 'x', now: T0 }), null)
  assert.equal(createProject({ name: 'n', now: T0 }), null)
  const p = mk({ sources: ['a.md', 'a.md', '', 42, 'b.md'], routing: 'best', providerRestrictions: ['deepseek', 'deepseek'] })
  assert.deepEqual(p.sources, ['a.md', 'b.md'])   // dedup + drop junk
  assert.equal(p.routing, 'best')
  assert.deepEqual(p.providerRestrictions, ['deepseek'])
  for (const r of PROJECT_ROUTING) assert.ok(typeof r === 'string')
})

test('unknown routing falls back to auto', () => {
  assert.equal(mk({ routing: 'telepathy' }).routing, 'auto')
})

test('update is immutable and validated', () => {
  const p = mk()
  const q = updateProject(p, { name: 'Renamed', routing: 'private', instructions: 'be brief' }, '2026-07-13T21:00:00Z')
  assert.equal(p.name, 'Research', 'original untouched')
  assert.equal(q.name, 'Renamed')
  assert.equal(q.routing, 'private')
  assert.equal(q.instructions, 'be brief')
  assert.equal(updateProject(p, { name: '' }, T0), null)   // invalid name rejected
})

test('provider restriction is a privacy/cost boundary', () => {
  const p = mk({ providerRestrictions: ['deepseek', 'qwen'] })
  assert.equal(projectAllowsProvider(p, 'anthropic'), true)
  assert.equal(projectAllowsProvider(p, 'deepseek'), false)
  assert.equal(projectAllowsProvider(p, 'qwen'), false)
  assert.equal(projectAllowsProvider(null, 'deepseek'), true)   // no project → no restriction
})

test('validate rejects malformed projects', () => {
  assert.equal(validateProject(null), false)
  assert.equal(validateProject({ id: 'x', name: 'n' }), false)   // missing arrays/routing
  assert.equal(validateProject({ id: 'x', name: 'n', instructions: '', sources: [], routing: 'nope', providerRestrictions: [] }), false)
})

test('summarize gives counts without full content', () => {
  const p = mk({ instructions: 'hi', sources: ['a', 'b'], providerRestrictions: ['qwen'] })
  const s = summarizeProject(p)
  assert.equal(s.sourceCount, 2)
  assert.equal(s.hasInstructions, true)
  assert.deepEqual(s.providerRestrictions, ['qwen'])
  assert.equal(s.instructions, undefined)
})
