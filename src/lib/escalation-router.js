// escalation-router.js — when a task outgrows the local model, decide which
// cloud model handles it. Two axes:
//   • COMPLEXITY (simple/medium/hard)  → the GPT-5.6 tier (Luna/Terra/Sol)
//   • BANK HEADROOM                    → GPT tier vs the Claude Max conductor
//
// Policy (default): Claude Max is the preferred heavy conductor because it is
// $0 on the Max subscription. As Claude's bank depletes toward its weekly cap,
// load shifts to complexity-graded GPT-5.6; if OpenAI's bank is the low one,
// load shifts back to Claude. Explicit prefixes always win. `escalationPrefer:
// 'gpt'` flips the healthy-state default to route by complexity to GPT first.
//
// IMPORTANT: this router is for REASONING escalation only. Tool/file/agentic
// tasks (PDF, "send me X", computer-use) must go to the Claude Director, which
// has tools — a GPT-5.6 API call is a plain completion. The brain owns that
// carve-out and calls this only for the reasoning bucket.
//
// Pure + deterministic. No I/O, no model calls.

const HARD_RE = /\b(implement|design|architect|refactor|debug|prove|derive|analyz|optimi|algorithm|step[- ]by[- ]step|trade[- ]?offs?|multi[- ]step|strateg|reason through|work through)\b/gi
const CODE_RE = /```|\bfunction\b|\bclass\b|=>|\bdef \b|\bimport \b/

/** simple | medium | hard — heuristic, deterministic. */
export function classifyComplexity(text) {
  const t = String(text || '')
  const len = t.length
  const questions = (t.match(/\?/g) || []).length
  const hardHits = (t.match(HARD_RE) || []).length
  // hard: long, code, several questions, or clear reasoning signals (2+ hits, or
  // one hit in a substantial message).
  if (len > 700 || CODE_RE.test(t) || questions >= 3 || hardHits >= 2 || (hardHits >= 1 && len > 160)) return 'hard'
  // simple: short and casual with no reasoning signal.
  if (len < 120 && questions <= 1 && hardHits === 0) return 'simple'
  return 'medium'
}

const TIER_FOR = { simple: 'small', medium: 'large', hard: 'flagship' }

/**
 * Explicit override prefix → a specific target. Returns:
 *   { kind: 'variant', modelId, text }  |  { kind: 'claude', text }  |  null
 */
export function parseOverride(text) {
  const m = /^\s*(luna|terra|sol|gpt|claude|deep)\b[:,]?\s*/i.exec(text || '')
  if (!m) return null
  const kw = m[1].toLowerCase()
  const rest = String(text).slice(m[0].length)
  if (kw === 'claude' || kw === 'deep') return { kind: 'claude', text: rest }
  const map = { luna: 'gpt-5.6-luna', terra: 'gpt-5.6-terra', sol: 'gpt-5.6-sol', gpt: 'gpt-5.6-terra' }
  return { kind: 'variant', modelId: map[kw], text: rest }
}

/**
 * Choose the reasoning model for an escalated task.
 * @param complexity 'simple'|'medium'|'hard'
 * @param models available cloud models [{ id, provider, tier, available }]
 * @param bank token bank (createTokenBank instance) or null
 * @param claudeAvailable is the Claude CLI usable
 * @param prefer 'claude' (default) | 'gpt' — healthy-state default
 * @param lowFloor fraction at/below which a provider counts as "low" (default 0.08)
 * @param subscriptionModel when set (codex is available + subscription preferred),
 *        the OpenAI lane uses this $0 model instead of the paid API variants.
 * @returns { via:'variant', modelId, provider, complexity, reason }
 *        | { via:'claude', complexity, reason }
 */
export function chooseReasoningModel({ complexity, models = [], bank = null, claudeAvailable = true, prefer = 'claude', lowFloor = 0.08, subscriptionModel = null }) {
  const gpt = models.filter(m => m.provider === 'openai' && m.available)
  const wantTier = TIER_FOR[complexity] || 'large'
  // The $0 subscription lane (Codex) is preferred over the paid API variants when
  // available; otherwise fall back to the complexity-matched API tier.
  const pickVariant = () => subscriptionModel || gpt.find(m => m.tier === wantTier) || gpt.find(m => m.tier === 'large') || gpt[0] || null
  const toVariant = (reason) => { const v = pickVariant(); return v ? { via: 'variant', modelId: v.id, provider: v.provider || 'openai', complexity, reason: (subscriptionModel ? 'subscription lane · ' : '') + reason } : { via: 'claude', complexity, reason: 'no GPT variant → Claude' } }

  if (!gpt.length && !subscriptionModel) return { via: 'claude', complexity, reason: 'no GPT variant available' }
  if (!claudeAvailable) return toVariant('Claude CLI unavailable → GPT')

  const claudeFrac = bank?.remainingFraction?.('claude-code')
  const openaiFrac = bank?.remainingFraction?.('openai')
  const claudeLow = bank ? bank.isLow('claude-code', lowFloor) : false
  const openaiLow = bank ? bank.isLow('openai', lowFloor) : false

  // Bank shifts first: relieve whichever pool is running dry.
  if (claudeLow && !openaiLow) return toVariant(`Claude bank low → GPT ${wantTier}`)
  if (openaiLow && !claudeLow) return { via: 'claude', complexity, reason: 'OpenAI bank low → Claude' }
  if (claudeLow && openaiLow) {
    // both dry: use the one with more headroom if known, else Claude ($0).
    if (Number.isFinite(openaiFrac) && Number.isFinite(claudeFrac) && openaiFrac > claudeFrac) return toVariant('both low; OpenAI has more headroom')
    return { via: 'claude', complexity, reason: 'both low; Claude ($0) fallback' }
  }

  // Both healthy / unknown → the configured default.
  if (prefer === 'gpt') return toVariant(`healthy; GPT-first → ${wantTier}`)
  // Claude-first: keep the free conductor, but if OpenAI clearly has much more
  // headroom, use it to preserve Claude's weekly window.
  if (Number.isFinite(openaiFrac) && Number.isFinite(claudeFrac) && openaiFrac > claudeFrac + 0.2) return toVariant('OpenAI has notably more headroom')
  return { via: 'claude', complexity, reason: 'healthy; Claude Max ($0 heavy conductor)' }
}
