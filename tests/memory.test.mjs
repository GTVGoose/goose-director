// GU6.4 tests — Memory model (pure).
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MEMORY_CLASSES,
  createMemory, groupByClass, isStale, reviseMemory, validateMemory,
} from '../src/lib/memory.js'

const T0 = '2026-07-13T20:00:00Z'
const mk = (over = {}) => createMemory({ id: 'mem_1', scope: 'proj_1', cls: 'fact', content: 'geese migrate', now: T0, ...over })

test('create yields a valid record with origin + verification', () => {
  const m = mk({ origin: { by: 'user', runId: 'run_9' } })
  assert.ok(validateMemory(m))
  assert.equal(m.cls, 'fact')
  assert.equal(m.verifiedAt, T0)
  assert.deepEqual(m.origin, { by: 'user', runId: 'run_9' })
})

test('create rejects bad class / empty content / missing scope', () => {
  assert.equal(createMemory({ id: 'x', scope: 's', cls: 'nope', content: 'c', now: T0 }), null)
  assert.equal(createMemory({ id: 'x', scope: 's', cls: 'fact', content: '', now: T0 }), null)
  assert.equal(createMemory({ id: 'x', cls: 'fact', content: 'c', now: T0 }), null)
  for (const c of MEMORY_CLASSES) assert.ok(createMemory({ id: 'x', scope: 's', cls: c, content: 'c', now: T0 }))
})

test('revise edits content and re-verifies immutably', () => {
  const m = mk()
  const n = reviseMemory(m, { content: 'geese fly south', now: '2026-08-01T00:00:00Z', reverify: true })
  assert.equal(m.content, 'geese migrate', 'original untouched')
  assert.equal(n.content, 'geese fly south')
  assert.equal(n.verifiedAt, '2026-08-01T00:00:00Z')
  assert.equal(reviseMemory(m, { content: '' }), null)
})

test('staleness compares against last verification', () => {
  const m = mk()
  assert.equal(isStale(m, '2026-07-20T00:00:00Z', 30), false)   // 7 days < 30
  assert.equal(isStale(m, '2026-09-20T00:00:00Z', 30), true)    // >30 days
  assert.equal(isStale(null, T0, 30), true)
})

test('groupByClass buckets memories and ignores junk', () => {
  const mems = [
    mk({ id: 'a', cls: 'fact' }),
    mk({ id: 'b', cls: 'decision' }),
    mk({ id: 'c', cls: 'fact' }),
    { id: 'bad', scope: 's', cls: 'nope', content: 'x' },
  ]
  const g = groupByClass(mems)
  assert.equal(g.fact.length, 2)
  assert.equal(g.decision.length, 1)
  assert.equal(g.summary.length, 0)
  assert.ok(!('nope' in g))
})

test('ephemeral run context is NOT a memory class (never auto-promoted)', () => {
  assert.ok(!MEMORY_CLASSES.includes('run'))
  assert.ok(!MEMORY_CLASSES.includes('ephemeral'))
})
