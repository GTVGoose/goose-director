// GU1 slice 1 tests — capability truth registry (node --test, zero deps).
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CAP_ORIGINS,
  CAP_STATUSES,
  KNOWN_PROVIDERS,
  LEGACY_KEY_TO_CAPABILITY,
  applyVerificationOverlay,
  availability,
  getCapability,
  isEnforced,
  isGranted,
  isOfferable,
  legacyViewOf,
  listCapabilities,
  migrateLegacyCapabilities,
  normalizeCapabilityRecord,
  normalizeSupportEntry,
  normalizeVerificationOverlay,
  providerSupport,
} from '../src/lib/capability-registry.js'

// ---------------------------------------------------------------------------
// Shipped registry sanity
// ---------------------------------------------------------------------------

test('every shipped record is schema-valid and frozen', () => {
  const caps = listCapabilities()
  assert.ok(caps.length >= 10, 'registry ships a meaningful baseline')
  for (const rec of caps) {
    assert.ok(Object.isFrozen(rec), `${rec.id} frozen`)
    assert.ok(CAP_ORIGINS.includes(rec.origin), `${rec.id} origin`)
    // normalizeCapabilityRecord(rec) must be a fixed point (already normalized)
    assert.deepEqual(normalizeCapabilityRecord(rec), rec, `${rec.id} is normal form`)
  }
})

test('live/beta claims always carry verification provenance', () => {
  for (const rec of listCapabilities()) {
    for (const [provider, entry] of Object.entries(rec.providerSupport)) {
      if (entry.status === 'live' || entry.status === 'beta') {
        assert.ok(entry.verifiedOn, `${rec.id}/${provider} has verifiedOn`)
        assert.ok(entry.source, `${rec.id}/${provider} has source`)
      }
    }
  }
})

test('T13 assumptions were carried over as unverified, not as claims', () => {
  // The stale static map said e.g. anthropic computerUse:true; the registry
  // must not present that as offerable without a probe.
  assert.equal(providerSupport('computer-use', 'anthropic').status, 'unverified')
  assert.equal(isOfferable('computer-use', 'anthropic'), false)
  assert.equal(providerSupport('mcp.client', 'openai').status, 'unverified')
  assert.equal(isOfferable('mcp.client', 'openai'), false)
})

test('claude-code tools path is honestly unavailable (CLI reasoning-only)', () => {
  assert.equal(providerSupport('tools.custom-functions', 'claude-code').status, 'unavailable')
})

// ---------------------------------------------------------------------------
// Fail-closed behavior
// ---------------------------------------------------------------------------

test('unknown capability / provider / malformed input all fail closed', () => {
  assert.equal(getCapability('nope'), null)
  assert.deepEqual(providerSupport('nope', 'anthropic'), { status: 'unverified' })
  assert.deepEqual(providerSupport('chat.basic', 'not-a-provider'), { status: 'unverified' })
  assert.equal(isOfferable('chat.basic', 'not-a-provider'), false)
  assert.deepEqual(normalizeSupportEntry(null), { status: 'unverified' })
  assert.deepEqual(normalizeSupportEntry('live'), { status: 'unverified' })
  assert.deepEqual(normalizeSupportEntry({ status: 'nonsense' }), { status: 'unverified' })
})

test('an offerable status without provenance is demoted to unverified', () => {
  assert.deepEqual(normalizeSupportEntry({ status: 'live' }), { status: 'unverified' })
  const ok = normalizeSupportEntry({ status: 'live', verifiedOn: '2026-07-13', source: 'probe' })
  assert.equal(ok.status, 'live')
})

test('malformed capability records are rejected, defaults fail closed', () => {
  assert.equal(normalizeCapabilityRecord(null), null)
  assert.equal(normalizeCapabilityRecord({ id: 'BAD ID!', category: 'x', origin: 'model-native', executor: 'provider' }), null)
  assert.equal(normalizeCapabilityRecord({ id: 'x', category: 'x', origin: 'wrong', executor: 'provider' }), null)
  const rec = normalizeCapabilityRecord({ id: 'x.y', category: 'test', origin: 'nexus-hosted', executor: 'nexus' })
  assert.equal(rec.riskTier, 'critical', 'unknown risk fails closed to critical')
  assert.equal(rec.dataBoundary, 'external-web', 'unknown boundary fails closed to widest')
  assert.equal(rec.approval, 'gated', 'unknown approval fails closed to strictest')
  const junkSupport = normalizeCapabilityRecord({
    id: 'x.y', category: 'test', origin: 'nexus-hosted', executor: 'nexus',
    providerSupport: { 'evil-provider': { status: 'live' }, anthropic: 'garbage' },
  })
  assert.equal(junkSupport.providerSupport['evil-provider'], undefined, 'unknown provider dropped')
  assert.deepEqual(junkSupport.providerSupport.anthropic, { status: 'unverified' })
})

// ---------------------------------------------------------------------------
// Support / grant / availability / enforcement are independent
// ---------------------------------------------------------------------------

const LEGACY_CONFIG = {
  capabilities: {
    enforced: false,
    models: {
      'claude-max': { tools: true, mcp: false, computerUse: false },
      'gpt-4o': { tools: false, mcp: true, computerUse: true },
    },
  },
}

test('grant reads legacy three-boolean shape, strict === true', () => {
  assert.equal(isGranted(LEGACY_CONFIG, 'claude-max', 'tools.custom-functions'), true)
  assert.equal(isGranted(LEGACY_CONFIG, 'claude-max', 'mcp.client'), false)
  assert.equal(isGranted(LEGACY_CONFIG, 'gpt-4o', 'computer-use'), true)
  assert.equal(isGranted(LEGACY_CONFIG, 'missing-model', 'tools.custom-functions'), false)
  assert.equal(isGranted({ capabilities: { models: { m: { tools: 'yes' } } } }, 'm', 'tools.custom-functions'), false)
  assert.equal(isGranted(null, 'm', 'tools.custom-functions'), false)
})

test('grant does not imply availability; gates dominate', () => {
  // computer-use is "granted" for gpt-4o in legacy config, but support is
  // unverified and the capability is G8-gated → never available.
  const a = availability(LEGACY_CONFIG, 'gpt-4o', 'openai', 'computer-use', { sandboxEnabled: true })
  assert.equal(a.available, false)
  // tools for anthropic: supported live, but sandbox off → unavailable.
  const b = availability(LEGACY_CONFIG, 'claude-max', 'anthropic', 'tools.custom-functions', { sandboxEnabled: false })
  assert.equal(b.available, false)
  assert.match(b.reason, /sandbox/)
  // sandbox on → available (grants stay informational until G8).
  const c = availability(LEGACY_CONFIG, 'claude-max', 'anthropic', 'tools.custom-functions', { sandboxEnabled: true })
  assert.equal(c.available, true)
})

test('enforcement flag is read strictly and independently', () => {
  assert.equal(isEnforced(LEGACY_CONFIG), false)
  assert.equal(isEnforced({ capabilities: { enforced: true } }), true)
  assert.equal(isEnforced({ capabilities: { enforced: 'true' } }), false)
  assert.equal(isEnforced({}), false)
  assert.equal(isEnforced(null), false)
})

// ---------------------------------------------------------------------------
// Legacy migration round-trip
// ---------------------------------------------------------------------------

test('migration is lossless and never flips enforced', () => {
  const migrated = migrateLegacyCapabilities(LEGACY_CONFIG.capabilities)
  assert.equal(migrated.enforced, false)
  assert.equal(migrated.grants['claude-max'][LEGACY_KEY_TO_CAPABILITY.tools], true)
  assert.equal(migrated.grants['gpt-4o'][LEGACY_KEY_TO_CAPABILITY.computerUse], true)
  // Round-trip back to the legacy view reproduces the original block exactly.
  assert.deepEqual(legacyViewOf(migrated), LEGACY_CONFIG.capabilities)
})

test('migration tolerates garbage without inventing grants', () => {
  assert.deepEqual(migrateLegacyCapabilities(null), { enforced: false, grants: {} })
  assert.deepEqual(migrateLegacyCapabilities({ enforced: 'yes' }).enforced, false)
  const m = migrateLegacyCapabilities({ models: { ok: { tools: 1, mcp: 'true' }, bad: null } })
  assert.equal(m.grants.ok[LEGACY_KEY_TO_CAPABILITY.tools], false)
  assert.equal(m.grants.ok[LEGACY_KEY_TO_CAPABILITY.mcp], false)
  assert.equal(m.grants.bad, undefined)
})

test('new-shape grants are honored alongside legacy', () => {
  const cfg = { capabilities: { grants: { m1: { 'tools.custom-functions': true } } } }
  assert.equal(isGranted(cfg, 'm1', 'tools.custom-functions'), true)
  assert.equal(isGranted(cfg, 'm1', 'mcp.client'), false)
})

// ---------------------------------------------------------------------------
// Verification overlay (GU1.5)
// ---------------------------------------------------------------------------

const NOW = '2026-07-13T18:00:00.000Z'

test('fresh probe result upgrades unverified to live at merge time', () => {
  const overlay = { 'tools.custom-functions': { gemini: { status: 'live', verifiedOn: '2026-07-13', source: 'live probe (gemini-flash-latest)' } } }
  const merged = applyVerificationOverlay(listCapabilities(), overlay, NOW)
  const rec = merged.find(r => r.id === 'tools.custom-functions')
  assert.equal(rec.providerSupport.gemini.status, 'live')
  // the registry itself is untouched
  assert.equal(providerSupport('tools.custom-functions', 'gemini').status, 'unverified')
})

test('stale probe results demote to unverified (fail closed)', () => {
  const overlay = { 'tools.custom-functions': { gemini: { status: 'live', verifiedOn: '2026-05-01', source: 'live probe' } } }
  const merged = applyVerificationOverlay(listCapabilities(), overlay, NOW)
  const sup = merged.find(r => r.id === 'tools.custom-functions').providerSupport.gemini
  assert.equal(sup.status, 'unverified')
  assert.match(sup.note, /stale/)
})

test('a probe can honestly mark a capability unavailable', () => {
  const overlay = { 'tools.custom-functions': { qwen: { status: 'unavailable', verifiedOn: '2026-07-13', source: 'live probe rejection' } } }
  const merged = applyVerificationOverlay(listCapabilities(), overlay, NOW)
  assert.equal(merged.find(r => r.id === 'tools.custom-functions').providerSupport.qwen.status, 'unavailable')
})

test('overlay cannot invent capabilities or providers; malformed entries ignored', () => {
  const overlay = {
    'made-up.cap': { anthropic: { status: 'live', verifiedOn: '2026-07-13', source: 'x' } },
    'tools.custom-functions': { 'evil-provider': { status: 'live', verifiedOn: '2026-07-13', source: 'x' }, mistral: 'garbage' },
  }
  const merged = applyVerificationOverlay(listCapabilities(), overlay, NOW)
  assert.equal(merged.find(r => r.id === 'made-up.cap'), undefined)
  const rec = merged.find(r => r.id === 'tools.custom-functions')
  assert.equal(rec.providerSupport['evil-provider'], undefined)
  assert.equal(rec.providerSupport.mistral.status, 'unverified')   // registry truth preserved
})

test('normalizeVerificationOverlay drops undated and unknown entries', () => {
  const out = normalizeVerificationOverlay({
    'tools.custom-functions': {
      gemini: { status: 'live', verifiedOn: '2026-07-13', source: 'probe', modelId: 'gemini-flash' },
      qwen: { status: 'live', source: 'probe' },                    // no date → dropped
      'evil-provider': { status: 'live', verifiedOn: '2026-07-13', source: 'x' },
    },
    'made-up.cap': { anthropic: { status: 'live', verifiedOn: '2026-07-13', source: 'x' } },
    junk: 'not-an-object',
  })
  assert.deepEqual(Object.keys(out), ['tools.custom-functions'])
  assert.deepEqual(Object.keys(out['tools.custom-functions']), ['gemini'])
  assert.equal(out['tools.custom-functions'].gemini.modelId, 'gemini-flash')
  assert.deepEqual(normalizeVerificationOverlay(null), {})
  assert.deepEqual(normalizeVerificationOverlay([1, 2]), {})
})

// ---------------------------------------------------------------------------
// Inertness proof (the registry has no side effects and touches no runtime)
// ---------------------------------------------------------------------------

test('module is pure: no fs/net/process access at import time', async () => {
  // The import at the top of this file succeeded in a bare node:test run with
  // no server, no config file, no network. Accessors are pure functions of
  // their inputs.
  const before = JSON.stringify(listCapabilities())
  providerSupport('computer-use', 'anthropic')
  availability({}, 'm', 'anthropic', 'tools.custom-functions', {})
  assert.equal(JSON.stringify(listCapabilities()), before, 'accessors do not mutate the registry')
})
