// GU4.2 golden test — the Anthropic adapter's text/usage extraction is
// byte-identical to the ad-hoc extraction callModel used before the refactor.
// This is the safety proof that wiring the adapter into the live path changed
// no behavior.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { normalizeResponse } from '../src/lib/provider-adapters.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIX = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'provider-responses.json'), 'utf8'))

// The EXACT extraction callModel used before GU4.2 (copied verbatim from git).
function legacyAnthropicText(data) {
  return (data.content || []).map(c => c.text || '').join('').trim()
}
function legacyAnthropicUsage(data) {
  return { inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens }
}

for (const key of ['anthropic_text', 'anthropic_tool', 'anthropic_thinking']) {
  test(`adapter text === legacy extraction for ${key}`, () => {
    const raw = FIX[key].raw
    const norm = normalizeResponse('anthropic', raw)
    assert.equal(norm.text, legacyAnthropicText(raw), 'text extraction unchanged')
    const legacyU = legacyAnthropicUsage(raw)
    assert.equal(norm.usage.inputTokens, legacyU.inputTokens ?? 0)
    assert.equal(norm.usage.outputTokens, legacyU.outputTokens ?? 0)
  })
}

// GU4.3: the compat-branch refactor must not change text/usage either.
function legacyCompatText(data) {
  return (data.choices?.[0]?.message?.content || '').trim()
}
for (const [key, provider] of [
  ['openai_tool', 'openai'], ['gemini_grounded', 'gemini'],
  ['deepseek_reasoning', 'deepseek'], ['mistral_text', 'mistral'], ['qwen_text', 'qwen'],
]) {
  test(`compat adapter text === legacy extraction for ${key}`, () => {
    const raw = FIX[key].raw
    const norm = normalizeResponse(provider, raw)
    assert.equal(norm.text, legacyCompatText(raw))
    assert.equal(norm.usage.inputTokens, raw.usage?.prompt_tokens ?? 0)
    assert.equal(norm.usage.outputTokens, raw.usage?.completion_tokens ?? 0)
  })
}

test('deepseek native lane: reasoning_content + cache surface via providerFields (generic path drops them)', () => {
  const n = normalizeResponse('deepseek', FIX.deepseek_reasoning.raw)
  assert.match(n.providerFields.reasoningContent, /6 times 7/)
  assert.deepEqual(n.providerFields.cache, { hit: 16, miss: 2 })
  // and text is unaffected
  assert.equal(n.text, '42')
})

test('adapter ADDS value the legacy path lacked: tool calls + preserved thinking', () => {
  // legacy callModel returned only text; the adapter also exposes structured
  // tool calls and native thinking blocks for callers that want them — without
  // changing the text result.
  const tool = normalizeResponse('anthropic', FIX.anthropic_tool.raw)
  assert.equal(tool.toolCalls.length, 1)
  const thinking = normalizeResponse('anthropic', FIX.anthropic_thinking.raw)
  assert.ok(thinking.providerFields.thinking)
})
