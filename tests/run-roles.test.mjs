// GU2.1 tests — runtime role model + deterministic complexity floors.
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  COMPLEXITY_FLOORS,
  RUN_ROLES,
  brainSatisfiesFloor,
  complexityFloor,
  pickEscalationBrain,
  roleForPhase,
} from '../src/lib/run-roles.js'

test('phase → role mapping attributes authority correctly', () => {
  assert.equal(roleForPhase('plan'), 'brain')
  assert.equal(roleForPhase('synthesize'), 'brain')
  assert.equal(roleForPhase('judge'), 'brain')
  assert.equal(roleForPhase('compose'), 'brain')
  assert.equal(roleForPhase('work'), 'worker')
  assert.equal(roleForPhase('propose'), 'worker')
  assert.equal(roleForPhase('debate'), 'worker')
  assert.equal(roleForPhase('champion'), 'worker')
  assert.equal(roleForPhase('tool'), 'broker')   // tool execution belongs to code, not the model
  assert.equal(roleForPhase('unknown-future-phase'), 'worker')   // fail closed to least model authority
  for (const r of ['brain', 'worker', 'broker']) assert.ok(RUN_ROLES.includes(r))
})

test('trivial task floors local-ok', () => {
  const { floor, reasons } = complexityFloor({ subtaskCount: 1, sourceChars: 500 })
  assert.equal(floor, 'local-ok')
  assert.equal(reasons.length, 0)
})

test('side effects, multi-subtask, sources, and research raise to prefer-cloud-brain', () => {
  assert.equal(complexityFloor({ sideEffects: true }).floor, 'prefer-cloud-brain')
  assert.equal(complexityFloor({ subtaskCount: 3 }).floor, 'prefer-cloud-brain')
  assert.equal(complexityFloor({ sourceChars: 20000 }).floor, 'prefer-cloud-brain')
  assert.equal(complexityFloor({ needsCurrentInfo: true }).floor, 'prefer-cloud-brain')
  assert.equal(complexityFloor({ artifactComplexity: 'structured' }).floor, 'prefer-cloud-brain')
})

test('high-stakes, contradictions, wide plans, huge sources require cloud brain', () => {
  assert.equal(complexityFloor({ highStakes: true }).floor, 'require-cloud-brain')
  assert.equal(complexityFloor({ contradictions: true }).floor, 'require-cloud-brain')
  assert.equal(complexityFloor({ subtaskCount: 5 }).floor, 'require-cloud-brain')
  assert.equal(complexityFloor({ sourceChars: 60000 }).floor, 'require-cloud-brain')
  assert.equal(complexityFloor({ artifactComplexity: 'interactive' }).floor, 'require-cloud-brain')
})

test('floors are monotonic minimums with reasons', () => {
  const r = complexityFloor({ sideEffects: true, highStakes: true, subtaskCount: 2 })
  assert.equal(r.floor, 'require-cloud-brain')
  assert.ok(r.reasons.length >= 3)
})

test('malformed signals fail to the safe default', () => {
  assert.equal(complexityFloor(null).floor, 'local-ok')
  assert.equal(complexityFloor('garbage').floor, 'local-ok')
  assert.equal(complexityFloor({ subtaskCount: 'many', sourceChars: NaN }).floor, 'local-ok')
})

test('brainSatisfiesFloor: cloud satisfies everything, local only local-ok', () => {
  const cloud = { provider: 'anthropic' }
  const local = { provider: 'ollama' }
  assert.equal(brainSatisfiesFloor(cloud, 'require-cloud-brain'), true)
  assert.equal(brainSatisfiesFloor(local, 'local-ok'), true)
  assert.equal(brainSatisfiesFloor(local, 'prefer-cloud-brain'), false)
  assert.equal(brainSatisfiesFloor(local, 'require-cloud-brain'), false)
  assert.equal(brainSatisfiesFloor(null, 'prefer-cloud-brain'), false)      // missing brain = local-ish, fail closed
  assert.equal(brainSatisfiesFloor(local, 'bogus-floor'), false)            // unknown floor requires cloud
})

test('explicit user local-only policy satisfies any floor (visible choice, not hidden fallback)', () => {
  const local = { provider: 'ollama' }
  assert.equal(brainSatisfiesFloor(local, 'require-cloud-brain', true), true)
})

test('pickEscalationBrain: deterministic first cloud, null when already cloud or none exists', () => {
  const local = { id: 'l', provider: 'ollama' }
  const cloudA = { id: 'a', provider: 'anthropic' }
  const cloudB = { id: 'b', provider: 'openai' }
  assert.equal(pickEscalationBrain([local, cloudA, cloudB], local), cloudA)   // ensemble order decides
  assert.equal(pickEscalationBrain([local], local), null)                    // no cloud → proceed local, never refuse
  assert.equal(pickEscalationBrain([local, cloudA], cloudB), null)           // already cloud → no change
  assert.equal(pickEscalationBrain(null, local), null)                       // malformed → no escalation
  assert.equal(pickEscalationBrain([null, { id: 'x' }, cloudA], local), cloudA) // junk entries skipped
})

test('vocabulary is frozen', () => {
  assert.ok(Object.isFrozen(RUN_ROLES))
  assert.ok(Object.isFrozen(COMPLEXITY_FLOORS))
})
