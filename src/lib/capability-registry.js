// Capability truth registry — Phase 1 of the general-use roadmap (GU1).
//
// One source of truth for what Nexus can actually offer, per capability, per
// provider, with verification provenance. Replaces the T13 three-boolean concept
// ({tools, mcp, computerUse}) with extensible records while remaining able to
// read and round-trip the legacy config shape.
//
// SAFETY INVARIANT (inherited from T13, unchanged): nothing in the running
// product consults this registry to decide whether a tool may run. The registry
// is *descriptive truth + inert intent*. The only live tool gate remains
// sandboxEnabled() + requireApproval() in server.mjs. Wiring any check into the
// tool path is gate G8 and is NOT built here.
//
// Four separated concepts (audit Phase 1, task 3). Each has its own accessor and
// none implies another:
//   support      — the provider/surface can do it at all      (providerSupport)
//   grant        — the operator recorded intent to allow it   (isGranted)
//   availability — the runtime dependency is actually present (availability)
//   enforcement  — whether grants are consulted at run time   (isEnforced; G8)

// ---------------------------------------------------------------------------
// Vocabulary (audit Finding 7)
// ---------------------------------------------------------------------------

export const CAP_ORIGINS = Object.freeze([
  'model-native',    // the model performs it through generation/reasoning
  'provider-hosted', // the provider executes it via an exposed API
  'nexus-hosted',    // Nexus executes it locally for an authorized model
  'app-only',        // exists in the provider's consumer app; NOT API-portable
  'unavailable',     // neither Nexus nor the provider can currently provide it
])

export const CAP_EXECUTORS = Object.freeze(['provider', 'nexus', 'user', 'external'])

export const CAP_STATUSES = Object.freeze([
  'live',          // wired and verified in this codebase
  'beta',          // wired, partially verified
  'planned',       // roadmap intent; no runtime exists
  'personal-only', // exists only in the personal lineage; never claim in product
  'app-only',      // provider consumer-app feature; never claim as Nexus capability
  'unavailable',   // known not to exist for this provider/surface
  'unverified',    // claim exists but has not been probed — treated as NOT offerable
])

export const CAP_RISK_TIERS = Object.freeze(['safe', 'low', 'medium', 'high', 'critical'])

export const CAP_EFFECTS = Object.freeze([
  'read', 'write', 'execute', 'spend', 'communicate', 'ui-control',
])

export const CAP_DATA_BOUNDARIES = Object.freeze([
  'local',        // never leaves the machine
  'provider',     // request content reaches the selected provider
  'external-web', // reaches arbitrary third-party hosts
])

export const CAP_APPROVALS = Object.freeze([
  'none',        // no human approval required (read-only, side-effect free)
  'per-action',  // every invocation requires human approval
  'gated',       // a named Director gate must open before this can even be granted
])

// Statuses that make a capability offerable in UI/routing. Everything else —
// including 'unverified' — fails closed to "not offerable".
const OFFERABLE = new Set(['live', 'beta'])

export const KNOWN_PROVIDERS = Object.freeze([
  'anthropic', 'claude-code', 'openai', 'gemini', 'mistral', 'deepseek', 'qwen', 'ollama',
])

// ---------------------------------------------------------------------------
// Record schema + fail-closed normalizer
// ---------------------------------------------------------------------------

const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0 && v.length <= 500
const isDateString = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/**
 * Validate + normalize one support entry: { status, verifiedOn?, source?, note? }.
 * Anything malformed fails closed to { status: 'unverified' }.
 */
export function normalizeSupportEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return { status: 'unverified' }
  const out = {}
  out.status = CAP_STATUSES.includes(entry.status) ? entry.status : 'unverified'
  if (isDateString(entry.verifiedOn)) out.verifiedOn = entry.verifiedOn
  if (isNonEmptyString(entry.source)) out.source = entry.source
  if (isNonEmptyString(entry.note)) out.note = entry.note
  // A status that claims to be offerable without verification provenance is a
  // marketing assumption, not truth — demote it (audit: fail-closed unknowns).
  if (OFFERABLE.has(out.status) && !(out.verifiedOn && out.source)) out.status = 'unverified'
  return out
}

/**
 * Validate + normalize one capability record. Returns the normalized record, or
 * null when the record is unusable (missing id/category/origin/executor).
 * Every optional field is dropped rather than passed through when malformed.
 */
export function normalizeCapabilityRecord(rec) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return null
  if (!isNonEmptyString(rec.id) || !/^[a-z0-9][a-z0-9.-]{0,99}$/.test(rec.id)) return null
  if (!isNonEmptyString(rec.category)) return null
  if (!CAP_ORIGINS.includes(rec.origin)) return null
  if (!CAP_EXECUTORS.includes(rec.executor)) return null

  const out = {
    id: rec.id,
    category: rec.category,
    origin: rec.origin,
    executor: rec.executor,
    riskTier: CAP_RISK_TIERS.includes(rec.riskTier) ? rec.riskTier : 'critical', // fail closed: unknown risk = highest
    effects: Array.isArray(rec.effects) ? rec.effects.filter((e) => CAP_EFFECTS.includes(e)) : [],
    dataBoundary: CAP_DATA_BOUNDARIES.includes(rec.dataBoundary) ? rec.dataBoundary : 'external-web', // fail closed: widest boundary
    approval: CAP_APPROVALS.includes(rec.approval) ? rec.approval : 'gated', // fail closed: strictest consent
    providerSupport: {},
    explanation: isNonEmptyString(rec.explanation) ? rec.explanation : '',
  }
  if (isNonEmptyString(rec.gate)) out.gate = rec.gate
  if (isNonEmptyString(rec.surface)) out.surface = rec.surface
  if (isNonEmptyString(rec.costNotes)) out.costNotes = rec.costNotes
  if (isNonEmptyString(rec.fallback)) out.fallback = rec.fallback
  if (Array.isArray(rec.scopes)) out.scopes = rec.scopes.filter(isNonEmptyString).slice(0, 32)

  const support = rec.providerSupport
  if (support && typeof support === 'object' && !Array.isArray(support)) {
    for (const provider of Object.keys(support)) {
      if (!KNOWN_PROVIDERS.includes(provider)) continue // unknown provider: dropped, reads back as unverified
      out.providerSupport[provider] = normalizeSupportEntry(support[provider])
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Shipped registry — the truthful 2026-07-13 baseline.
//
// Verification discipline: `live`/`beta` requires a verifiedOn date and a
// source. Claims inherited from the T13 static map that were never probed are
// recorded as `unverified` — which is NOT offerable — rather than deleted, so
// the intent survives without becoming a false claim. Code-inspection sources
// cite server.mjs as of commit 4b66a38.
// ---------------------------------------------------------------------------

const INSPECTED = { verifiedOn: '2026-07-13', source: 'code inspection server.mjs@4b66a38' }
const T13_ASSUMED = { source: 'T13 static PROVIDER_CAPABILITIES map (assumed, never probed)' }

/** @type {Array<object>} */
const SHIPPED_RECORDS = [
  {
    id: 'chat.basic',
    category: 'conversation',
    origin: 'model-native',
    executor: 'provider',
    riskTier: 'safe',
    effects: [],
    dataBoundary: 'provider',
    approval: 'none',
    explanation: 'Ordinary text conversation with the selected model.',
    providerSupport: Object.fromEntries(KNOWN_PROVIDERS.map((p) => [
      p,
      { status: 'live', ...INSPECTED, note: p === 'ollama' ? 'local; dataBoundary local in practice' : undefined },
    ])),
  },
  {
    id: 'chat.streaming',
    category: 'conversation',
    origin: 'provider-hosted',
    executor: 'provider',
    riskTier: 'safe',
    effects: [],
    dataBoundary: 'provider',
    approval: 'none',
    explanation: 'Token streaming into the chat surface (SSE relay).',
    providerSupport: Object.fromEntries(KNOWN_PROVIDERS.map((p) => [p, { status: 'live', ...INSPECTED }])),
  },
  {
    id: 'chat.cancellation',
    category: 'conversation',
    origin: 'nexus-hosted',
    executor: 'nexus',
    riskTier: 'safe',
    effects: [],
    dataBoundary: 'local',
    approval: 'none',
    explanation: 'Stop an in-flight model response mid-stream.',
    // Honest gap (audit shared floor): no user-facing mid-stream abort exists yet.
    providerSupport: Object.fromEntries(KNOWN_PROVIDERS.map((p) => [
      p, { status: 'planned', note: 'no user-facing mid-stream abort; AbortController used only for health probes' },
    ])),
  },
  {
    id: 'tools.custom-functions',
    category: 'tools',
    origin: 'nexus-hosted',
    executor: 'nexus',
    riskTier: 'medium',
    effects: ['read'],
    dataBoundary: 'provider',
    approval: 'per-action',
    gate: 'sandbox',
    explanation: 'Model may request Nexus-defined tools via function calling; Nexus executes behind the sandbox gate.',
    fallback: 'reasoning-only response without tools',
    providerSupport: {
      anthropic: { status: 'live', ...INSPECTED, note: 'native tool blocks, callModelAgentic' },
      openai: { status: 'live', ...INSPECTED, note: 'OpenAI-compat agentic path' },
      ollama: { status: 'live', ...INSPECTED, note: 'runAgentLoop; model-dependent' },
      gemini: { status: 'unverified', ...T13_ASSUMED },
      mistral: { status: 'unverified', ...T13_ASSUMED },
      deepseek: { status: 'unverified', ...T13_ASSUMED },
      qwen: { status: 'unverified', ...T13_ASSUMED },
      'claude-code': { status: 'unavailable', note: 'CLI path falls back to reasoning-only (server.mjs:4077)' },
    },
  },
  {
    id: 'tools.file-read',
    category: 'tools',
    origin: 'nexus-hosted',
    executor: 'nexus',
    riskTier: 'low',
    effects: ['read'],
    dataBoundary: 'provider',
    approval: 'none',
    gate: 'sandbox',
    scopes: ['mounted repo roots only (resolveInsideAnyRepo)'],
    explanation: 'Read a file inside a mounted repository.',
    providerSupport: { anthropic: { status: 'live', ...INSPECTED }, openai: { status: 'live', ...INSPECTED }, ollama: { status: 'live', ...INSPECTED } },
  },
  {
    id: 'tools.file-write',
    category: 'tools',
    origin: 'nexus-hosted',
    executor: 'nexus',
    riskTier: 'high',
    effects: ['write'],
    dataBoundary: 'local',
    approval: 'per-action',
    gate: 'sandbox+approval',
    scopes: ['mounted repo roots only (resolveInsideAnyRepo)'],
    explanation: 'Write a file inside a mounted repository; every write requires human approval.',
    providerSupport: { anthropic: { status: 'live', ...INSPECTED }, openai: { status: 'live', ...INSPECTED }, ollama: { status: 'live', ...INSPECTED } },
  },
  {
    id: 'tools.bash',
    category: 'tools',
    origin: 'nexus-hosted',
    executor: 'nexus',
    riskTier: 'critical',
    effects: ['read', 'write', 'execute'],
    dataBoundary: 'local',
    approval: 'per-action',
    gate: 'sandbox+approval',
    explanation: 'Run a shell command; every command requires human approval.',
    costNotes: 'documented risk: not path-confined once sandbox is enabled (server.mjs:3865)',
    providerSupport: { anthropic: { status: 'live', ...INSPECTED }, openai: { status: 'live', ...INSPECTED }, ollama: { status: 'live', ...INSPECTED } },
  },
  {
    id: 'tools.fetch-url',
    category: 'tools',
    origin: 'nexus-hosted',
    executor: 'nexus',
    riskTier: 'medium',
    effects: ['read'],
    dataBoundary: 'external-web',
    approval: 'none',
    gate: 'sandbox',
    scopes: ['http(s) only; SSRF guard blocks private/loopback ranges'],
    explanation: 'Fetch a public web page for the model to read.',
    providerSupport: { anthropic: { status: 'live', ...INSPECTED }, openai: { status: 'live', ...INSPECTED }, ollama: { status: 'live', ...INSPECTED } },
  },
  {
    id: 'tools.open-app',
    category: 'tools',
    origin: 'nexus-hosted',
    executor: 'nexus',
    riskTier: 'high',
    effects: ['ui-control'],
    dataBoundary: 'local',
    approval: 'per-action',
    gate: 'sandbox',
    explanation: 'Open a local application.',
    providerSupport: { anthropic: { status: 'live', ...INSPECTED }, openai: { status: 'live', ...INSPECTED }, ollama: { status: 'live', ...INSPECTED } },
  },
  {
    id: 'mcp.client',
    category: 'connectors',
    origin: 'nexus-hosted',
    executor: 'nexus',
    riskTier: 'high',
    effects: ['read', 'write', 'communicate'],
    dataBoundary: 'external-web',
    approval: 'gated',
    gate: 'G8',
    explanation: 'Reach MCP servers on behalf of a model. Not wired; recorded as intent only.',
    providerSupport: {
      anthropic: { status: 'unverified', ...T13_ASSUMED },
      'claude-code': { status: 'unverified', ...T13_ASSUMED },
      openai: { status: 'unverified', ...T13_ASSUMED },
      gemini: { status: 'unverified', ...T13_ASSUMED },
      mistral: { status: 'unverified', ...T13_ASSUMED },
      deepseek: { status: 'unverified', ...T13_ASSUMED },
      qwen: { status: 'unverified', ...T13_ASSUMED },
      ollama: { status: 'unverified', ...T13_ASSUMED },
    },
  },
  {
    id: 'computer-use',
    category: 'automation',
    origin: 'provider-hosted',
    executor: 'nexus',
    riskTier: 'critical',
    effects: ['read', 'write', 'execute', 'ui-control'],
    dataBoundary: 'provider',
    approval: 'gated',
    gate: 'G8',
    explanation: 'A model proposing UI actions. Hard-off; enabling it is the substance of gate G8.',
    providerSupport: {
      anthropic: { status: 'unverified', ...T13_ASSUMED, note: 'Anthropic-first path per T13; never probed' },
      'claude-code': { status: 'unverified', ...T13_ASSUMED },
      openai: { status: 'unverified', note: 'T13 marked unsupported; audit says current API supports it — needs a real probe before any claim' },
      gemini: { status: 'unverified', note: 'T13 marked unsupported; needs a real probe' },
      mistral: { status: 'unavailable' },
      deepseek: { status: 'unavailable' },
      qwen: { status: 'unverified', note: 'needs a real probe' },
      ollama: { status: 'unavailable' },
    },
  },
  // Provider-hosted lanes Nexus does not reach yet (Phase 4 scope). Recorded so
  // routing/UI can say "exists at the provider, not wired in Nexus" instead of
  // silently flattening (audit: capability collapse).
  {
    id: 'provider.web-search',
    category: 'research',
    origin: 'provider-hosted',
    executor: 'provider',
    riskTier: 'low',
    effects: ['read'],
    dataBoundary: 'provider',
    approval: 'none',
    explanation: 'Provider-hosted web search grounding. Not wired in Nexus yet.',
    providerSupport: Object.fromEntries(KNOWN_PROVIDERS.map((p) => [
      p, { status: p === 'ollama' ? 'unavailable' : 'unverified', note: 'Phase 4 adapter lane' },
    ])),
  },
  {
    id: 'provider.code-interpreter',
    category: 'analysis',
    origin: 'provider-hosted',
    executor: 'provider',
    riskTier: 'medium',
    effects: ['execute'],
    dataBoundary: 'provider',
    approval: 'none',
    explanation: 'Provider-hosted code execution. Not wired in Nexus yet.',
    providerSupport: Object.fromEntries(KNOWN_PROVIDERS.map((p) => [
      p, { status: p === 'ollama' ? 'unavailable' : 'unverified', note: 'Phase 4 adapter lane' },
    ])),
  },
  // App-only honesty entries (audit Finding 7: never present these as Nexus
  // capabilities merely because the provider's model answers in Nexus).
  {
    id: 'app.provider-projects',
    category: 'app-only',
    origin: 'app-only',
    executor: 'external',
    riskTier: 'safe',
    effects: [],
    dataBoundary: 'provider',
    approval: 'none',
    explanation: 'Provider consumer-app Projects/memory/Canvas/Artifacts are app experiences, not API capabilities; Nexus provides its own equivalents (Phase 6).',
    providerSupport: Object.fromEntries(KNOWN_PROVIDERS.map((p) => [p, { status: 'app-only' }])),
  },
]

const REGISTRY = new Map()
for (const raw of SHIPPED_RECORDS) {
  const rec = normalizeCapabilityRecord(raw)
  if (rec) REGISTRY.set(rec.id, Object.freeze(rec))
}

// ---------------------------------------------------------------------------
// Accessors — the four separated concepts
// ---------------------------------------------------------------------------

export function listCapabilities() {
  return [...REGISTRY.values()]
}

export function getCapability(id) {
  return REGISTRY.get(id) || null
}

/** SUPPORT: what the provider can do at all. Fail-closed to 'unverified'. */
export function providerSupport(capId, provider) {
  const rec = REGISTRY.get(capId)
  if (!rec) return { status: 'unverified' }
  return rec.providerSupport[provider] || { status: 'unverified' }
}

/** Whether support is strong enough to offer in UI/routing. 'unverified' is NOT. */
export function isOfferable(capId, provider) {
  return OFFERABLE.has(providerSupport(capId, provider).status)
}

// Legacy three-boolean key → registry capability id.
export const LEGACY_KEY_TO_CAPABILITY = Object.freeze({
  tools: 'tools.custom-functions',
  mcp: 'mcp.client',
  computerUse: 'computer-use',
})
const CAPABILITY_TO_LEGACY_KEY = Object.freeze(
  Object.fromEntries(Object.entries(LEGACY_KEY_TO_CAPABILITY).map(([k, v]) => [v, k])),
)

/**
 * GRANT: operator intent recorded in config. Reads BOTH shapes:
 * new `config.capabilities.grants[modelId][capId]` and legacy
 * `config.capabilities.models[modelId][legacyKey]`. Strict === true; anything
 * else is not granted. Grants are inert until G8 (enforcement) exists.
 */
export function isGranted(config, modelId, capId) {
  const caps = config?.capabilities
  if (!caps || typeof caps !== 'object') return false
  if (caps.grants?.[modelId]?.[capId] === true) return true
  const legacyKey = CAPABILITY_TO_LEGACY_KEY[capId]
  if (legacyKey && caps.models?.[modelId]?.[legacyKey] === true) return true
  return false
}

/**
 * AVAILABILITY: support + grant + runtime dependency, combined read-only.
 * `runtime` carries live facts the registry cannot know statically
 * (e.g. { sandboxEnabled: false }). Fail-closed on every axis.
 */
export function availability(config, modelId, provider, capId, runtime = {}) {
  const rec = REGISTRY.get(capId)
  if (!rec) return { available: false, reason: 'unknown capability' }
  if (!isOfferable(capId, provider)) {
    return { available: false, reason: `provider support is ${providerSupport(capId, provider).status}` }
  }
  if (rec.gate && rec.gate.startsWith('G')) {
    return { available: false, reason: `gate ${rec.gate} closed` }
  }
  if (rec.gate && rec.gate.startsWith('sandbox') && runtime.sandboxEnabled !== true) {
    return { available: false, reason: 'sandbox disabled' }
  }
  if (!isGranted(config, modelId, capId) && rec.origin === 'nexus-hosted' && rec.category === 'tools' && capId !== 'chat.basic') {
    // Grant checks stay descriptive-only until G8; report, never enforce.
    return { available: true, reason: 'supported; grant not recorded (informational until G8)' }
  }
  return { available: true, reason: 'supported' }
}

/** ENFORCEMENT: G8 flag. Nothing consults this at run time yet, by design. */
export function isEnforced(config) {
  return config?.capabilities?.enforced === true
}

// ---------------------------------------------------------------------------
// Legacy migration (audit Phase 1, task 1: support migration from existing config)
// ---------------------------------------------------------------------------

/**
 * Convert the legacy `{ enforced, models: {id: {tools,mcp,computerUse}} }` block
 * into the new shape `{ enforced, grants: {id: {capId: bool}}, legacyMigratedOn }`.
 * Lossless: every legacy boolean maps to exactly one registry capability id and
 * `legacyViewOf()` reproduces the original block. Never flips `enforced`.
 */
export function migrateLegacyCapabilities(capabilities) {
  const src = capabilities && typeof capabilities === 'object' ? capabilities : {}
  const out = { enforced: src.enforced === true, grants: {} }
  const models = src.models && typeof src.models === 'object' ? src.models : {}
  for (const [modelId, caps] of Object.entries(models)) {
    if (typeof modelId !== 'string' || !modelId || modelId.length > 200) continue
    if (!caps || typeof caps !== 'object') continue
    const grants = {}
    for (const [legacyKey, capId] of Object.entries(LEGACY_KEY_TO_CAPABILITY)) {
      grants[capId] = caps[legacyKey] === true
    }
    out.grants[modelId] = grants
  }
  return out
}

// ---------------------------------------------------------------------------
// Verification overlay (GU1.5 — audit Phase 1, task 4)
//
// Live probe results are runtime data, not code. They are stored outside the
// registry (userData `capability-verifications.json`) as an OVERLAY:
//   { [capabilityId]: { [provider]: { status, verifiedOn, source, note?, modelId? } } }
// applyVerificationOverlay() merges them over the static records. Fail-closed
// rules: malformed entries are ignored; entries older than `maxAgeDays` are
// DEMOTED to 'unverified' (a stale probe is not truth); an overlay can never
// invent a capability or provider the registry doesn't know.
// ---------------------------------------------------------------------------

export const VERIFICATION_MAX_AGE_DAYS = 30

function daysBetween(aIso, bIso) {
  const a = Date.parse(aIso)
  const b = Date.parse(bIso)
  if (Number.isNaN(a) || Number.isNaN(b)) return Infinity
  return Math.abs(b - a) / 86400000
}

/**
 * Merge a runtime verification overlay over the registry records.
 * Returns NEW record objects; never mutates the registry. `nowIso` is the
 * clock for staleness (callers pass new Date().toISOString()).
 */
export function applyVerificationOverlay(records, overlay, nowIso, maxAgeDays = VERIFICATION_MAX_AGE_DAYS) {
  if (!overlay || typeof overlay !== 'object' || Array.isArray(overlay)) return records
  return records.map((rec) => {
    const capOverlay = overlay[rec.id]
    if (!capOverlay || typeof capOverlay !== 'object' || Array.isArray(capOverlay)) return rec
    let changed = false
    const providerSupport = { ...rec.providerSupport }
    for (const [provider, raw] of Object.entries(capOverlay)) {
      if (!KNOWN_PROVIDERS.includes(provider)) continue           // overlay can't invent providers
      const entry = normalizeSupportEntry(raw)
      if (entry.status === 'unverified' && !raw?.verifiedOn) continue // malformed → ignore, keep registry truth
      const stale = !entry.verifiedOn || daysBetween(entry.verifiedOn, nowIso) > maxAgeDays
      providerSupport[provider] = stale
        ? { status: 'unverified', note: `probe result stale (>${maxAgeDays}d): was ${entry.status} on ${entry.verifiedOn || 'unknown'}` }
        : entry
      changed = true
    }
    return changed ? Object.freeze({ ...rec, providerSupport }) : rec
  })
}

/** Fail-closed normalizer for the overlay file as a whole (defensive load). */
export function normalizeVerificationOverlay(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const out = {}
  for (const [capId, providers] of Object.entries(input)) {
    if (!REGISTRY.has(capId)) continue
    if (!providers || typeof providers !== 'object' || Array.isArray(providers)) continue
    const capOut = {}
    for (const [provider, entry] of Object.entries(providers)) {
      if (!KNOWN_PROVIDERS.includes(provider)) continue
      const norm = normalizeSupportEntry(entry)
      if (!norm.verifiedOn) continue                              // a verification without a date is not a verification
      if (entry && typeof entry === 'object' && typeof entry.modelId === 'string' && entry.modelId.length <= 200) {
        norm.modelId = entry.modelId
      }
      capOut[provider] = norm
    }
    if (Object.keys(capOut).length) out[capId] = capOut
  }
  return out
}

/** Project the new shape back to the legacy three-boolean view (round-trip proof). */
export function legacyViewOf(migrated) {
  const out = { enforced: migrated?.enforced === true, models: {} }
  const grants = migrated?.grants && typeof migrated.grants === 'object' ? migrated.grants : {}
  for (const [modelId, capGrants] of Object.entries(grants)) {
    const m = {}
    for (const [legacyKey, capId] of Object.entries(LEGACY_KEY_TO_CAPABILITY)) {
      m[legacyKey] = capGrants?.[capId] === true
    }
    out.models[modelId] = m
  }
  return out
}
