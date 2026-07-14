// GU4.1 tests — provider adapter contract + fixture round-trips (no paid calls).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  SHARED_FLOOR,
  getAdapter,
  isValidFloor,
  listAdapters,
  normalizeResponse,
} from '../src/lib/provider-adapters.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIX = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'provider-responses.json'), 'utf8'))

test('all six clouds + ollama have adapters with valid shared-floor descriptions', () => {
  for (const p of ['anthropic', 'openai', 'gemini', 'mistral', 'qwen', 'deepseek', 'ollama']) {
    const a = getAdapter(p)
    assert.ok(a, `${p} adapter exists`)
    const d = a.describe()
    assert.equal(d.provider, p)
    assert.ok(isValidFloor(d.floor), `${p} floor is valid over ${SHARED_FLOOR.join(',')}`)
    assert.ok(Array.isArray(d.nativeLanes))
    assert.ok(Array.isArray(d.notInherited))
  }
  assert.equal(listAdapters().length, 7)
  assert.equal(getAdapter('nope'), null)
})

test('anthropic: text + usage + finish reason', () => {
  const n = normalizeResponse('anthropic', FIX.anthropic_text.raw)
  assert.equal(n.text, 'The largest ocean is the Pacific.')
  assert.deepEqual(n.usage, { inputTokens: 12, outputTokens: 8 })
  assert.equal(n.finishReason, 'stop')
  assert.equal(n.toolCalls.length, 0)
  assert.equal(n.providerFields.messageId, 'msg_01ABC')
})

test('anthropic: tool_use blocks normalize + finishReason tool_use', () => {
  const n = normalizeResponse('anthropic', FIX.anthropic_tool.raw)
  assert.equal(n.finishReason, 'tool_use')
  assert.equal(n.toolCalls.length, 1)
  assert.deepEqual(n.toolCalls[0], { id: 'toolu_1', name: 'read_file', arguments: { path: 'README.md' } })
  assert.equal(n.text, 'Let me read that file.')
})

test('anthropic: thinking blocks are PRESERVED, not flattened away', () => {
  const n = normalizeResponse('anthropic', FIX.anthropic_thinking.raw)
  assert.equal(n.text, 'Paris.')
  assert.ok(n.providerFields.thinking, 'thinking blocks survive')
  assert.equal(n.providerFields.thinking[0].signature, 'sig_xyz')
})

test('openai: tool_calls + system_fingerprint preserved', () => {
  const n = normalizeResponse('openai', FIX.openai_tool.raw)
  assert.equal(n.finishReason, 'tool_use')
  assert.equal(n.toolCalls[0].name, 'fetch_url')
  assert.equal(n.toolCalls[0].arguments, '{"url":"https://example.com"}')
  assert.deepEqual(n.usage, { inputTokens: 30, outputTokens: 12 })
  assert.equal(n.providerFields.systemFingerprint, 'fp_abc')
})

test('gemini: grounding metadata survives (the generic path would drop it)', () => {
  const n = normalizeResponse('gemini', FIX.gemini_grounded.raw)
  assert.match(n.text, /8\.2 billion/)
  assert.ok(n.providerFields.groundingMetadata, 'grounding preserved')
  assert.equal(n.providerFields.groundingMetadata.grounding_chunks[0].web.uri, 'https://example.org/pop')
})

test('deepseek: reasoning_content + cache token accounting preserved', () => {
  const n = normalizeResponse('deepseek', FIX.deepseek_reasoning.raw)
  assert.equal(n.text, '42')
  assert.match(n.providerFields.reasoningContent, /6 times 7/)
  assert.deepEqual(n.providerFields.cache, { hit: 16, miss: 2 })
})

test('mistral + qwen: shared-floor text round-trips', () => {
  assert.equal(normalizeResponse('mistral', FIX.mistral_text.raw).text, 'Bonjour.')
  assert.equal(normalizeResponse('qwen', FIX.qwen_text.raw).text, '你好')
})

test('ollama: local tool_calls + token counts', () => {
  const n = normalizeResponse('ollama', FIX.ollama_tool.raw)
  assert.equal(n.finishReason, 'tool_use')
  assert.equal(n.toolCalls[0].name, 'read_file')
  assert.deepEqual(n.usage, { inputTokens: 50, outputTokens: 10 })
})

test('normalize fails soft on garbage — always returns a valid shape, never throws', () => {
  for (const p of ['anthropic', 'openai', 'deepseek', 'ollama', 'unknown-provider']) {
    const n = normalizeResponse(p, null)
    assert.equal(typeof n.text, 'string')
    assert.ok(Array.isArray(n.toolCalls))
    assert.equal(n.usage.inputTokens, 0)
  }
  assert.equal(normalizeResponse('anthropic', { content: 'not-an-array' }).text, '')
})

// GU4.5 — graceful degradation (audit Phase 4 exit: "honest unsupported
// responses", "tested graceful degradation, not merely generic text calls").
test('every adapter reports its shared-floor support explicitly — no silent gaps', () => {
  for (const a of listAdapters()) {
    const floor = a.describe().floor
    for (const cap of SHARED_FLOOR) {
      assert.ok([true, false, 'unknown'].includes(floor[cap]), `${a.provider}.${cap} is an explicit value`)
    }
  }
})

test('adapters honestly declare app-only surfaces they do NOT inherit', () => {
  // The anti-overclaim guard: an Anthropic model answering does not bring the
  // Claude app's Projects/Artifacts/Max — the adapter says so.
  const anthropic = getAdapter('anthropic').describe()
  assert.ok(anthropic.notInherited.some(s => /Artifacts/i.test(s)))
  assert.ok(anthropic.notInherited.some(s => /Projects/i.test(s)))
  const openai = getAdapter('openai').describe()
  assert.ok(openai.notInherited.some(s => /ChatGPT|Canvas|Projects/i.test(s)))
})

test('a provider error/partial response degrades to a valid empty shape (never throws)', () => {
  // Simulate provider error bodies and truncated responses across styles.
  const errorBodies = [
    { error: { message: 'rate limited', type: 'rate_limit_error' } },     // anthropic-style error
    { error: { message: 'invalid_request' }, choices: [] },               // openai-style error
    { choices: [{ message: {} }] },                                       // empty message
    { content: [] },                                                      // anthropic empty content
    {},                                                                    // totally empty
  ]
  for (const p of ['anthropic', 'openai', 'gemini', 'deepseek', 'mistral', 'qwen', 'ollama']) {
    for (const body of errorBodies) {
      const n = normalizeResponse(p, body)
      assert.equal(typeof n.text, 'string')
      assert.ok(Array.isArray(n.toolCalls))
      assert.equal(n.usage.inputTokens, 0)
      assert.equal(n.usage.outputTokens, 0)
      assert.equal(n.provider, p)
    }
  }
})

test('unknown provider degrades gracefully (empty shape tagged with the name)', () => {
  const n = normalizeResponse('some-future-provider', { choices: [{ message: { content: 'hi' } }] })
  assert.equal(n.provider, 'some-future-provider')
  assert.equal(n.text, '')   // no adapter → no extraction, but a valid shape
})

test('isValidFloor rejects malformed floor blocks', () => {
  assert.equal(isValidFloor({ text: true }), false)          // incomplete
  assert.equal(isValidFloor({ ...Object.fromEntries(SHARED_FLOOR.map(k => [k, true])) }), true)
  const bad = Object.fromEntries(SHARED_FLOOR.map(k => [k, true])); bad.text = 'maybe'
  assert.equal(isValidFloor(bad), false)                     // invalid value
})
