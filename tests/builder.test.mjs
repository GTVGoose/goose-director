// GU10.1 tests — Agentic System Builder model (pure).
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  BUILDER_STAGES,
  builderProgress, generateStarterPack, newBuilderState, normalizeCreativeIdentity,
  setCreativeIdentity, setEntry, setStage, validateBuilder,
} from '../src/lib/builder.js'

const T0 = '2026-07-13T20:00:00Z'

test('nine stages, each with an ask + a completion PROOF (not slides-viewed)', () => {
  assert.equal(BUILDER_STAGES.length, 9)
  for (const s of BUILDER_STAGES) {
    assert.ok(s.id && s.title && s.ask && s.proof)
  }
  // the audit's key stages exist
  const ids = BUILDER_STAGES.map(s => s.id)
  for (const id of ['purpose', 'first-agent', 'tools', 'workflow', 'verification']) assert.ok(ids.includes(id))
})

test('a fresh state has every stage pending and validates', () => {
  const s = newBuilderState({ id: 'b1', now: T0 })
  assert.ok(validateBuilder(s))
  const p = builderProgress(s)
  assert.equal(p.done, 0)
  assert.equal(p.total, 9)
  assert.equal(p.verified, false)
  assert.equal(p.nextStage, 'purpose')
})

test('setStage is immutable and advances progress; verified only when ALL done', () => {
  let s = newBuilderState({ id: 'b1', now: T0 })
  const before = s
  s = setStage(s, 'purpose', true, 'brief one topic weekly', T0)
  assert.equal(before.stages.purpose.done, false, 'original untouched')
  assert.equal(s.stages.purpose.done, true)
  assert.equal(builderProgress(s).nextStage, 'workspace')
  // complete all
  for (const st of BUILDER_STAGES) s = setStage(s, st.id, true, '', T0)
  const p = builderProgress(s)
  assert.equal(p.done, 9)
  assert.equal(p.verified, true)
  assert.equal(p.nextStage, null)
})

test('setStage rejects unknown stage / invalid state', () => {
  const s = newBuilderState({ id: 'b1', now: T0 })
  assert.equal(setStage(s, 'nope', true, '', T0), null)
  assert.equal(setStage(null, 'purpose', true, '', T0), null)
})

test('entry path is one of use-now/build/connect', () => {
  let s = newBuilderState({ id: 'b1', now: T0 })
  s = setEntry(s, 'build', T0)
  assert.equal(s.entry, 'build')
  assert.equal(setEntry(s, 'telepathy', T0), null)
})

test('starter pack is a portable, product-clean file manifest', () => {
  const pack = generateStarterPack({ purpose: 'Summarize AI news weekly', systemName: 'News Brief', routing: 'private' })
  const paths = pack.map(f => f.path)
  assert.ok(paths.includes('SYSTEM.md'))
  assert.ok(paths.includes('agents/registry.yaml'))
  assert.ok(paths.includes('policies/permissions.yaml'))
  assert.ok(paths.includes('tests/first-run-checklist.md'))
  // read-only + safe by default (audit: no write tool in the first live exercise)
  const perms = pack.find(f => f.path === 'policies/permissions.yaml').content
  assert.match(perms, /writes: disabled/)
  assert.match(perms, /computer_use: disabled/)
  assert.match(perms, /routing: private/)
  // purpose flows into SYSTEM.md
  assert.match(pack.find(f => f.path === 'SYSTEM.md').content, /Summarize AI news weekly/)
  // no Goose/vault/mythology content leaked
  const all = pack.map(f => f.content).join('\n')
  assert.doesNotMatch(all, /Umbruh|Goose|Membrane|Signal|sfs-vault/i)
})

test('Creative Identity is presentation-only and CANNOT carry authority', () => {
  // A hostile identity payload that tries to smuggle tool access / permissions.
  const ci = normalizeCreativeIdentity({
    name: 'The Lantern', archetype: 'seeker', sigil: 'flame', colors: ['#e0a800', 'amber'], voice: 'warm',
    // authority-shaped keys that must be DROPPED:
    tools: ['run_bash'], permissions: { write: true }, grants: { all: true }, routing: 'best', scopes: ['*'], authority: 'admin',
  })
  assert.deepEqual(Object.keys(ci).sort(), ['archetype', 'colors', 'name', 'sigil', 'voice'])
  assert.equal(ci.tools, undefined)
  assert.equal(ci.permissions, undefined)
  assert.equal(ci.grants, undefined)
  assert.equal(ci.routing, undefined)
  assert.equal(ci.authority, undefined)
  assert.deepEqual(ci.colors, ['#e0a800', 'amber'])
})

test('setCreativeIdentity attaches presentation only; null clears it', () => {
  let s = newBuilderState({ id: 'b1', now: T0 })
  s = setCreativeIdentity(s, { name: 'Atlas', tools: ['run_bash'] }, T0)
  assert.equal(s.creativeIdentity.name, 'Atlas')
  assert.equal(s.creativeIdentity.tools, undefined)   // authority never attached
  s = setCreativeIdentity(s, null, T0)
  assert.equal(s.creativeIdentity, null)
})

test('normalizeCreativeIdentity returns null for junk / empty', () => {
  assert.equal(normalizeCreativeIdentity(null), null)
  assert.equal(normalizeCreativeIdentity({ tools: ['x'] }), null)   // only authority → nothing to keep
  assert.equal(normalizeCreativeIdentity('nope'), null)
})

test('starter pack has safe defaults even with empty input', () => {
  const pack = generateStarterPack({})
  assert.ok(pack.length >= 8)
  assert.match(pack.find(f => f.path === 'policies/permissions.yaml').content, /writes: disabled/)
})
