// Job-first routing policies — Phase 7 of the general-use roadmap (GU7),
// implementing the audit's Finding 4: "most users do not want to decide which
// provider should answer every prompt. They want a fast, good, private, or
// low-cost outcome." One selector maps an intent to a concrete model choice,
// explained after the run.
//
// Pure module: a policy is a deterministic RANKING over the available models
// plus a floor bias. It never calls a provider; the server applies the choice
// and reports it. This complements the Phase-2 complexity floors (which set a
// MINIMUM); a policy expresses the user's PREFERENCE within what the floor
// allows.

export const ROUTING_POLICIES = Object.freeze([
  { id: 'fast',     label: 'Fast',        desc: 'Quickest good answer — prefers low-latency local/small models.' },
  { id: 'best',     label: 'Best answer', desc: 'Highest quality — prefers a strong cloud model.' },
  { id: 'private',  label: 'Private',     desc: 'Local only — nothing leaves the machine.' },
  { id: 'low-cost', label: 'Low cost',    desc: 'Cheapest path — prefers free local, then low-price cloud.' },
  { id: 'compare',  label: 'Compare',     desc: 'Run several models side by side.' },
  { id: 'custom',   label: 'Custom team', desc: 'You choose the models and roles.' },
])

const POLICY_IDS = new Set(ROUTING_POLICIES.map(p => p.id))

export function isRoutingPolicy(id) { return POLICY_IDS.has(id) }
export function listRoutingPolicies() { return ROUTING_POLICIES.map(p => ({ ...p })) }

// A model descriptor for ranking: { id, provider, tier?, pricePerMTokUsd? }.
// `local` derives from provider === 'ollama'. Unknown price → treated as high.
function isLocal(m) { return m?.provider === 'ollama' }
function price(m) { return Number.isFinite(m?.pricePerMTokUsd) ? m.pricePerMTokUsd : Infinity }
// Rough capability rank for "best" — a strong cloud reasoning model outranks a
// small local one. Providers with generally strong flagships rank higher; this
// is advisory ordering, not a quality claim, and ties break by explicit tier.
const PROVIDER_STRENGTH = { anthropic: 5, 'claude-code': 5, openai: 4, gemini: 4, mistral: 3, deepseek: 3, qwen: 3, ollama: 1 }
function strength(m) {
  const base = PROVIDER_STRENGTH[m?.provider] ?? 2
  // 'flagship' (e.g. GPT-5.6 Sol) outranks a normal 'large' cloud model; 'small'
  // (budget/mini, e.g. Luna) ranks below. This keeps the deepest-reasoning tier
  // on top for the "best" policy and pushes budget tiers down.
  const tierBonus = m?.tier === 'flagship' ? 2 : m?.tier === 'large' ? 1 : m?.tier === 'small' ? -1 : 0
  return base + tierBonus
}

/**
 * Apply a policy to the available models. Returns:
 *   { policy, mode, selected: [modelId...], reason, floorBias }
 * - mode 'single' → one model (fast/best/private/low-cost)
 * - mode 'council' → several (compare)
 * - mode 'custom' → caller-provided selection is respected as-is
 * `models` is the resolved, AVAILABLE model list. Pure + deterministic (stable
 * sort by the policy's key, then by id to break ties).
 */
export function applyRoutingPolicy(policyId, models, opts = {}) {
  const list = Array.isArray(models) ? models.filter(m => m && m.id) : []
  const byId = (a, b) => String(a.id).localeCompare(String(b.id))
  const pick = (arr) => (arr[0] ? [arr[0].id] : [])

  if (!isRoutingPolicy(policyId)) {
    return { policy: null, mode: 'single', selected: pick(list), reason: 'no policy — first available model', floorBias: 'none' }
  }
  if (policyId === 'custom') {
    const sel = Array.isArray(opts.customSelection) ? opts.customSelection.filter(Boolean) : []
    return { policy: 'custom', mode: 'custom', selected: sel, reason: 'user-chosen custom team', floorBias: 'none' }
  }
  if (policyId === 'private') {
    const locals = list.filter(isLocal).sort(byId)
    return {
      policy: 'private', mode: 'single', selected: pick(locals),
      reason: locals.length ? 'local-only: nothing leaves the machine' : 'no local model available — private policy cannot run',
      floorBias: 'local-only',
    }
  }
  if (policyId === 'fast') {
    // local first (no network), then by lower price as a latency proxy
    const ranked = [...list].sort((a, b) => (isLocal(b) - isLocal(a)) || (price(a) - price(b)) || byId(a, b))
    return { policy: 'fast', mode: 'single', selected: pick(ranked), reason: 'lowest-latency: local first, then cheapest cloud', floorBias: 'none' }
  }
  if (policyId === 'low-cost') {
    // free local first, then ascending price
    const ranked = [...list].sort((a, b) => (isLocal(b) - isLocal(a)) || (price(a) - price(b)) || byId(a, b))
    return { policy: 'low-cost', mode: 'single', selected: pick(ranked), reason: 'cheapest: free local first, then lowest-price cloud', floorBias: 'prefer-local' }
  }
  if (policyId === 'best') {
    // strongest first; ties by lower price then id
    const ranked = [...list].sort((a, b) => (strength(b) - strength(a)) || (price(a) - price(b)) || byId(a, b))
    return { policy: 'best', mode: 'single', selected: pick(ranked), reason: 'highest-quality: strongest available model', floorBias: 'prefer-cloud' }
  }
  if (policyId === 'compare') {
    // a diverse set: strongest cloud + a local + next-strongest distinct provider
    const seen = new Set()
    const diverse = []
    for (const m of [...list].sort((a, b) => (strength(b) - strength(a)) || byId(a, b))) {
      if (seen.has(m.provider)) continue
      seen.add(m.provider); diverse.push(m.id)
      if (diverse.length >= (opts.max || 3)) break
    }
    return { policy: 'compare', mode: 'council', selected: diverse, reason: 'side-by-side across distinct providers', floorBias: 'none' }
  }
  return { policy: policyId, mode: 'single', selected: pick(list), reason: 'default', floorBias: 'none' }
}
