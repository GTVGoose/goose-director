// token-bank.js — a per-provider "token bank": how much of each provider's
// subscription/credit period we've consumed, and how much headroom is left, so
// the router can lean on whichever provider has more budget remaining.
//
// HONEST LIMITS (verified 2026-07-14): providers barely expose remaining quota.
// OpenAI blocks the credit-balance endpoint for a normal API key (403) and
// Anthropic's Max plan has NO remaining-quota API — its limits are enforced by
// 429s on rolling windows. So this bank is a LOCAL LEDGER: consumption we meter
// ourselves, decremented against a cap the operator configures, reset per
// period. It is made as-live-as-possible by three signals:
//   (a) real usage decrement (every metered call),
//   (b) OpenAI's per-response `x-ratelimit-remaining-tokens` headers (a live
//       rolling-window headroom signal), and
//   (c) a hard "tapped out" flag when a provider returns 429 / usage-limit.
//
// Pure + deterministic: inject `now` for tests. No I/O — the server owns
// persistence (dump()/hydrate()).

const HOUR = 3600_000

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x }
function round2(x) { return Math.round((x || 0) * 100) / 100 }

/**
 * @param providersConfig { [provider]: { label?, periodHours?, capTokens?, capUSD?, note? } }
 * @param opts { now?: () => number }
 */
export function createTokenBank(providersConfig = {}, opts = {}) {
  const now = opts.now || (() => Date.now())
  const cfg = {}
  const state = {}
  for (const [id, c] of Object.entries(providersConfig || {})) {
    cfg[id] = {
      label: c.label || id,
      periodHours: Number(c.periodHours) > 0 ? Number(c.periodHours) : 720, // default ~monthly
      capTokens: Number.isFinite(c.capTokens) ? c.capTokens : null,
      capUSD: Number.isFinite(c.capUSD) ? c.capUSD : null,
      note: c.note || null,
    }
    state[id] = { consumedTokens: 0, consumedUSD: 0, periodStart: now(), live: null, exhaustedUntil: 0 }
  }

  function rollIfNeeded(id) {
    const c = cfg[id], s = state[id]
    if (!c || !s) return
    const elapsed = now() - s.periodStart
    const span = c.periodHours * HOUR
    if (elapsed >= span) {
      // advance by whole periods so periodStart stays phase-aligned
      const periods = Math.floor(elapsed / span)
      s.periodStart += periods * span
      s.consumedTokens = 0
      s.consumedUSD = 0
      s.exhaustedUntil = 0
    }
  }

  const api = {
    /** Restore persisted state (dump() output). Ignores unknown providers. */
    hydrate(saved) {
      if (!saved || typeof saved !== 'object') return
      for (const [id, s] of Object.entries(saved)) {
        if (!state[id] || !s || typeof s !== 'object') continue
        state[id] = {
          consumedTokens: Number(s.consumedTokens) || 0,
          consumedUSD: Number(s.consumedUSD) || 0,
          periodStart: Number(s.periodStart) || now(),
          live: s.live || null,
          exhaustedUntil: Number(s.exhaustedUntil) || 0,
        }
        rollIfNeeded(id)
      }
    },

    /** Decrement the bank by real usage. tokens = in+out; usd = metered cost. */
    consume(provider, { tokens = 0, usd = 0 } = {}) {
      if (!state[provider]) return
      rollIfNeeded(provider)
      state[provider].consumedTokens += Math.max(0, tokens || 0)
      state[provider].consumedUSD += Math.max(0, usd || 0)
    },

    /** Feed OpenAI's live rate-limit headers: { remainingTokens, limitTokens, resetSeconds }. */
    setLive(provider, live) {
      if (!state[provider] || !live) return
      state[provider].live = {
        remainingTokens: Number(live.remainingTokens),
        limitTokens: Number(live.limitTokens),
        resetSeconds: Number(live.resetSeconds),
        at: now(),
      }
    },

    /** Hard "tapped out" until the reset window elapses (429 / usage-limit). */
    markExhausted(provider, resetMs) {
      if (!state[provider]) return
      state[provider].exhaustedUntil = now() + (resetMs > 0 ? resetMs : HOUR)
    },

    /**
     * Remaining headroom as a fraction [0..1] (1 = full, 0 = empty), using the
     * TIGHTEST of: configured token cap, configured $ cap, live rolling-window
     * headroom. If exhausted → 0. If no cap and no live signal → null (unknown).
     */
    remainingFraction(provider) {
      const c = cfg[provider], s = state[provider]
      if (!c || !s) return null
      rollIfNeeded(provider)
      if (s.exhaustedUntil > now()) return 0
      const fracs = []
      if (c.capTokens) fracs.push(clamp01(1 - s.consumedTokens / c.capTokens))
      if (c.capUSD) fracs.push(clamp01(1 - s.consumedUSD / c.capUSD))
      if (s.live && Number.isFinite(s.live.remainingTokens) && Number.isFinite(s.live.limitTokens) && s.live.limitTokens > 0)
        fracs.push(clamp01(s.live.remainingTokens / s.live.limitTokens))
      if (!fracs.length) return null
      return Math.min(...fracs)
    },

    /**
     * Of `candidates`, the provider with the MOST known headroom. Providers with
     * an unknown fraction (no cap, no live signal) are skipped so the caller can
     * fall back to its own preference order. Returns null if none are known.
     * `minFraction` (default 0) lets the caller ignore near-empty providers.
     */
    preferred(candidates, minFraction = 0) {
      let best = null, bestFrac = -1
      for (const p of candidates || []) {
        const f = api.remainingFraction(p)
        if (f == null || f < minFraction) continue
        if (f > bestFrac) { bestFrac = f; best = p }
      }
      return best
    },

    /** Is this provider currently out of headroom (exhausted or fraction ≤ floor)? */
    isLow(provider, floor = 0.1) {
      const f = api.remainingFraction(provider)
      return f != null && f <= floor
    },

    /** Human/UI-facing snapshot of every provider's bank. */
    snapshot() {
      const out = {}
      for (const id of Object.keys(cfg)) {
        rollIfNeeded(id)
        const c = cfg[id], s = state[id]
        out[id] = {
          label: c.label,
          note: c.note,
          periodHours: c.periodHours,
          periodResetsAt: new Date(s.periodStart + c.periodHours * HOUR).toISOString(),
          capTokens: c.capTokens,
          capUSD: c.capUSD,
          consumedTokens: s.consumedTokens,
          consumedUSD: round2(s.consumedUSD),
          remainingTokens: c.capTokens != null ? Math.max(0, c.capTokens - s.consumedTokens) : null,
          remainingUSD: c.capUSD != null ? round2(Math.max(0, c.capUSD - s.consumedUSD)) : null,
          remainingFraction: api.remainingFraction(id),
          live: s.live || null,
          exhausted: s.exhaustedUntil > now(),
        }
      }
      return out
    },

    /** Raw state for persistence. */
    dump() {
      const out = {}
      for (const id of Object.keys(state)) out[id] = { ...state[id] }
      return out
    },

    /** True if this provider is configured in the bank. */
    has(provider) { return !!cfg[provider] },

    config: cfg,
  }
  return api
}
