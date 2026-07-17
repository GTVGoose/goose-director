// token-bank tests (pure). Injected clock so period rolls are deterministic.
import test from 'node:test'
import assert from 'node:assert/strict'

import { createTokenBank } from '../src/lib/token-bank.js'

// fraction math is floating-point; compare with a small epsilon
const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`)

const CFG = {
  'claude-code': { label: 'Claude Max', periodHours: 168, capTokens: 1_000_000, note: 'weekly' },
  'openai':      { label: 'OpenAI',     periodHours: 720, capUSD: 100 },
}

// controllable clock
function clock(start = 1_000_000_000_000) {
  let t = start
  return { now: () => t, advance: (ms) => { t += ms } }
}

test('unknown provider → null fraction; configured but unused → 1', () => {
  const c = clock()
  const bank = createTokenBank(CFG, { now: c.now })
  assert.equal(bank.remainingFraction('nope'), null)
  approx(bank.remainingFraction('claude-code'), 1)
  approx(bank.remainingFraction('openai'), 1)
})

test('consume decrements the tightest cap (tokens for claude, $ for openai)', () => {
  const c = clock()
  const bank = createTokenBank(CFG, { now: c.now })
  bank.consume('claude-code', { tokens: 250_000 })
  approx(bank.remainingFraction('claude-code'), 0.75)
  bank.consume('openai', { usd: 40 })
  approx(bank.remainingFraction('openai'), 0.6)
})

test('live rate-limit headroom can be the tightest bound', () => {
  const c = clock()
  const bank = createTokenBank(CFG, { now: c.now })
  bank.consume('openai', { usd: 10 }) // cap fraction 0.9
  bank.setLive('openai', { remainingTokens: 20_000, limitTokens: 200_000, resetSeconds: 60 }) // 0.1
  approx(bank.remainingFraction('openai'), 0.1) // min(0.9, 0.1)
})

test('exhausted → fraction 0 until reset elapses', () => {
  const c = clock()
  const bank = createTokenBank(CFG, { now: c.now })
  bank.markExhausted('claude-code', 5 * 60_000)
  approx(bank.remainingFraction('claude-code'), 0)
  assert.equal(bank.isLow('claude-code'), true)
  c.advance(6 * 60_000)
  approx(bank.remainingFraction('claude-code'), 1) // window passed
})

test('period roll resets consumption', () => {
  const c = clock()
  const bank = createTokenBank(CFG, { now: c.now })
  bank.consume('claude-code', { tokens: 900_000 })
  approx(bank.remainingFraction('claude-code'), 0.1)
  c.advance(169 * 3600_000) // > 168h
  approx(bank.remainingFraction('claude-code'), 1) // rolled
})

test('preferred picks the provider with the most headroom; skips unknowns', () => {
  const c = clock()
  const bank = createTokenBank(CFG, { now: c.now })
  bank.consume('claude-code', { tokens: 950_000 }) // 0.05
  bank.consume('openai', { usd: 30 })              // 0.70
  assert.equal(bank.preferred(['claude-code', 'openai']), 'openai')
  // now drain openai below claude
  bank.consume('openai', { usd: 69 })              // 0.01
  assert.equal(bank.preferred(['claude-code', 'openai']), 'claude-code')
  // unknown provider is skipped, not chosen
  assert.equal(bank.preferred(['nope']), null)
})

test('hydrate restores state and still rolls if the period elapsed while away', () => {
  const c = clock()
  const bank = createTokenBank(CFG, { now: c.now })
  bank.consume('openai', { usd: 50 })
  const saved = bank.dump()

  const c2 = clock()
  const bank2 = createTokenBank(CFG, { now: c2.now })
  bank2.hydrate(saved)
  approx(bank2.remainingFraction('openai'), 0.5)
  c2.advance(721 * 3600_000)
  approx(bank2.remainingFraction('openai'), 1) // rolled after hydrate
})

test('snapshot reports caps, remaining, and reset time', () => {
  const c = clock()
  const bank = createTokenBank(CFG, { now: c.now })
  bank.consume('claude-code', { tokens: 100_000 })
  const snap = bank.snapshot()
  assert.equal(snap['claude-code'].remainingTokens, 900_000)
  approx(snap['claude-code'].remainingFraction, 0.9)
  assert.equal(snap['openai'].capUSD, 100)
  assert.ok(snap['claude-code'].periodResetsAt)
})
