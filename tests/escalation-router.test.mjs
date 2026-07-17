// escalation-router tests (pure). Complexity heuristic + bank-aware selection.
import test from 'node:test'
import assert from 'node:assert/strict'

import { classifyComplexity, parseOverride, chooseReasoningModel } from '../src/lib/escalation-router.js'
import { createTokenBank } from '../src/lib/token-bank.js'

const MODELS = [
  { id: 'gpt-5.6-luna', provider: 'openai', tier: 'small', available: true },
  { id: 'gpt-5.6-terra', provider: 'openai', tier: 'large', available: true },
  { id: 'gpt-5.6-sol', provider: 'openai', tier: 'flagship', available: true },
]

test('complexity heuristic buckets short/greeting vs long/hard', () => {
  assert.equal(classifyComplexity('hi there'), 'simple')
  assert.equal(classifyComplexity('What time is it in Tokyo?'), 'simple')
  assert.equal(classifyComplexity('Design and implement a multi-step caching strategy for the API layer'), 'hard')
  assert.equal(classifyComplexity('```js\nfunction x(){}\n```'), 'hard')
  assert.equal(classifyComplexity('Summarize this paragraph about weather in a few sentences please.'), 'simple')
  assert.equal(classifyComplexity('Write a friendly two-paragraph email to a client letting them know their order shipped and will arrive Tuesday, and thank them warmly.'), 'medium')
})

test('explicit prefixes route to a specific target and strip the prefix', () => {
  assert.deepEqual(parseOverride('sol: prove the theorem'), { kind: 'variant', modelId: 'gpt-5.6-sol', text: 'prove the theorem' })
  assert.deepEqual(parseOverride('luna, quick hi'), { kind: 'variant', modelId: 'gpt-5.6-luna', text: 'quick hi' })
  assert.equal(parseOverride('deep: think hard').kind, 'claude')
  assert.equal(parseOverride('claude: do it').kind, 'claude')
  assert.equal(parseOverride('no prefix here'), null)
})

test('complexity picks the matching GPT tier when routing to GPT (prefer gpt)', () => {
  const r = (c) => chooseReasoningModel({ complexity: c, models: MODELS, prefer: 'gpt' })
  assert.equal(r('simple').modelId, 'gpt-5.6-luna')
  assert.equal(r('medium').modelId, 'gpt-5.6-terra')
  assert.equal(r('hard').modelId, 'gpt-5.6-sol')
})

test('healthy + Claude-first default → Claude', () => {
  const r = chooseReasoningModel({ complexity: 'hard', models: MODELS })
  assert.equal(r.via, 'claude')
})

test('Claude bank low → shift to complexity-graded GPT', () => {
  const bank = createTokenBank({ 'claude-code': { periodHours: 168, capTokens: 1_000_000 }, 'openai': { periodHours: 720, capUSD: 100 } })
  bank.consume('claude-code', { tokens: 990_000 }) // frac 0.01 → low
  const r = chooseReasoningModel({ complexity: 'hard', models: MODELS, bank })
  assert.equal(r.via, 'variant')
  assert.equal(r.modelId, 'gpt-5.6-sol')
})

test('OpenAI bank low → stay on Claude even if Claude-first would anyway', () => {
  const bank = createTokenBank({ 'claude-code': { periodHours: 168, capTokens: 1_000_000 }, 'openai': { periodHours: 720, capUSD: 100 } })
  bank.consume('openai', { usd: 99 }) // frac 0.01 → low
  const r = chooseReasoningModel({ complexity: 'simple', models: MODELS, bank, prefer: 'gpt' })
  assert.equal(r.via, 'claude')
})

test('no GPT available → Claude; no Claude → GPT', () => {
  assert.equal(chooseReasoningModel({ complexity: 'hard', models: [] }).via, 'claude')
  const r = chooseReasoningModel({ complexity: 'medium', models: MODELS, claudeAvailable: false })
  assert.equal(r.via, 'variant')
  assert.equal(r.modelId, 'gpt-5.6-terra')
})

test('subscription lane ($0 codex) preempts the paid API variants when set', () => {
  const sub = { id: 'chatgpt-sub', provider: 'codex', tier: 'large' }
  // healthy + gpt-first would normally pick an API variant; subscription wins.
  const r = chooseReasoningModel({ complexity: 'hard', models: MODELS, prefer: 'gpt', subscriptionModel: sub })
  assert.equal(r.via, 'variant')
  assert.equal(r.modelId, 'chatgpt-sub')
  assert.equal(r.provider, 'codex')
  // even with no API variants available, the subscription lane still routes GPT.
  const r2 = chooseReasoningModel({ complexity: 'medium', models: [], prefer: 'gpt', subscriptionModel: sub })
  assert.equal(r2.modelId, 'chatgpt-sub')
})

test('both banks low → the one with more headroom wins', () => {
  const bank = createTokenBank({ 'claude-code': { periodHours: 168, capTokens: 1_000_000 }, 'openai': { periodHours: 720, capUSD: 100 } })
  bank.consume('claude-code', { tokens: 999_000 }) // 0.001
  bank.consume('openai', { usd: 95 })              // 0.05  (more headroom)
  const r = chooseReasoningModel({ complexity: 'hard', models: MODELS, bank })
  assert.equal(r.via, 'variant') // openai has more left
})
