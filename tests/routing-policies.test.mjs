// GU7.1 tests — job-first routing policies (pure).
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ROUTING_POLICIES,
  applyRoutingPolicy, isRoutingPolicy, listRoutingPolicies,
} from '../src/lib/routing-policies.js'

const MODELS = [
  { id: 'claude-sonnet', provider: 'anthropic', tier: 'large', pricePerMTokUsd: 9 },
  { id: 'claude-haiku', provider: 'anthropic', tier: 'small', pricePerMTokUsd: 1 },
  { id: 'gpt-4o', provider: 'openai', pricePerMTokUsd: 5 },
  { id: 'deepseek-chat', provider: 'deepseek', pricePerMTokUsd: 0.3 },
  { id: 'ollama-local', provider: 'ollama', pricePerMTokUsd: 0 },
]

test('policy catalog is stable and queryable', () => {
  assert.equal(listRoutingPolicies().length, 6)
  for (const p of ROUTING_POLICIES) assert.ok(isRoutingPolicy(p.id))
  assert.equal(isRoutingPolicy('telepathy'), false)
})

test('private → local only, nothing leaves the machine', () => {
  const r = applyRoutingPolicy('private', MODELS)
  assert.deepEqual(r.selected, ['ollama-local'])
  assert.equal(r.floorBias, 'local-only')
  assert.equal(r.mode, 'single')
})

test('private with no local model reports it cannot run (fail honest)', () => {
  const r = applyRoutingPolicy('private', MODELS.filter(m => m.provider !== 'ollama'))
  assert.deepEqual(r.selected, [])
  assert.match(r.reason, /no local model/)
})

test('best → strongest available (a strong cloud model, not the local one)', () => {
  const r = applyRoutingPolicy('best', MODELS)
  assert.equal(r.selected[0], 'claude-sonnet')   // anthropic strength + large tier
  assert.equal(r.floorBias, 'prefer-cloud')
})

test('fast → local first (no network), then cheapest cloud', () => {
  const r = applyRoutingPolicy('fast', MODELS)
  assert.equal(r.selected[0], 'ollama-local')
})

test('low-cost → free local first, then ascending price', () => {
  const r = applyRoutingPolicy('low-cost', MODELS)
  assert.equal(r.selected[0], 'ollama-local')
  // without a local model, the cheapest cloud (deepseek) wins
  const noLocal = applyRoutingPolicy('low-cost', MODELS.filter(m => m.provider !== 'ollama'))
  assert.equal(noLocal.selected[0], 'deepseek-chat')
})

test('compare → diverse set across distinct providers', () => {
  const r = applyRoutingPolicy('compare', MODELS, { max: 3 })
  assert.equal(r.mode, 'council')
  assert.equal(r.selected.length, 3)
  // distinct providers only (no two anthropic models)
  const providers = r.selected.map(id => MODELS.find(m => m.id === id).provider)
  assert.equal(new Set(providers).size, providers.length)
})

test('custom → respects the user selection verbatim', () => {
  const r = applyRoutingPolicy('custom', MODELS, { customSelection: ['gpt-4o', 'ollama-local'] })
  assert.deepEqual(r.selected, ['gpt-4o', 'ollama-local'])
  assert.equal(r.mode, 'custom')
})

test('deterministic — same inputs give the same ranking', () => {
  const a = applyRoutingPolicy('best', MODELS)
  const b = applyRoutingPolicy('best', [...MODELS].reverse())
  assert.deepEqual(a.selected, b.selected)   // stable sort, order-independent
})

test('unknown policy falls back to first available with a reason', () => {
  const r = applyRoutingPolicy('nope', MODELS)
  assert.equal(r.policy, null)
  assert.equal(r.selected.length, 1)
  assert.match(r.reason, /no policy/)
})
