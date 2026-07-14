// Provider adapter contract — Phase 4 of the general-use roadmap (GU4).
//
// The audit's anti-"capability-collapse" core (Finding 7): today every
// non-Anthropic cloud runs through one generic OpenAI-compatible path, which
// preserves basic intelligence but discards native fields (Gemini thought
// signatures / grounding, Mistral Agents semantics, DeepSeek reasoning+caching,
// Qwen multimodal parts). This module defines ONE normalized response shape and
// a per-provider adapter that (a) declares its shared-floor support honestly and
// (b) normalizes a raw provider response WITHOUT throwing away native fields —
// they ride along under `providerFields`.
//
// GU4.1 is INERT SCAFFOLDING: pure functions + fixtures. It does not replace the
// live call paths in server.mjs. Wiring each adapter into the runtime is GU4.2+,
// one provider at a time, each proven against recorded fixtures (no paid calls).

// The shared capability floor every compatible provider is expected to offer
// (audit "Shared capability floor"). An adapter reports true/false/'unknown'.
export const SHARED_FLOOR = Object.freeze([
  'text',            // text generation
  'streaming',       // token streaming
  'cancellation',    // abortable request
  'structuredOutput',// JSON / schema-constrained output
  'multimodalInput', // image/file input parts
  'toolCalls',       // function/tool calling
  'usage',           // token usage reporting
  'citations',       // source/grounding provenance
])

const FLOOR_VALUES = new Set([true, false, 'unknown'])

/** The normalized response shape every adapter.normalize() returns. */
export function emptyNormalized() {
  return {
    text: '',
    toolCalls: [],       // [{ id, name, arguments }]
    usage: { inputTokens: 0, outputTokens: 0 },
    finishReason: null,  // 'stop' | 'tool_use' | 'length' | 'error' | null
    providerFields: {},  // native fields preserved verbatim for the next turn
    provider: null,
  }
}

function num(x) { return Number.isFinite(x) ? x : 0 }

// ---------------------------------------------------------------------------
// Anthropic — native message/tool blocks
// ---------------------------------------------------------------------------
const anthropicAdapter = {
  provider: 'anthropic',
  style: 'native',
  describe() {
    return {
      provider: 'anthropic', style: 'native',
      floor: {
        text: true, streaming: true, cancellation: true, structuredOutput: true,
        multimodalInput: true, toolCalls: true, usage: true, citations: 'unknown',
      },
      nativeLanes: ['tool-use message blocks', 'vision', 'thinking blocks (when enabled)'],
      // App-only surfaces that must NEVER be claimed just because a Claude model answers:
      notInherited: ['Claude app Projects', 'Artifacts', 'connectors', 'Cowork', 'memory', 'Max entitlements'],
    }
  },
  normalize(raw) {
    const out = emptyNormalized()
    out.provider = 'anthropic'
    if (!raw || typeof raw !== 'object') return out
    const blocks = Array.isArray(raw.content) ? raw.content : []
    out.text = blocks.filter(b => b?.type === 'text').map(b => b.text || '').join('').trim()
    out.toolCalls = blocks.filter(b => b?.type === 'tool_use').map(b => ({ id: b.id, name: b.name, arguments: b.input || {} }))
    out.usage = { inputTokens: num(raw.usage?.input_tokens), outputTokens: num(raw.usage?.output_tokens) }
    out.finishReason = raw.stop_reason === 'tool_use' ? 'tool_use'
      : raw.stop_reason === 'max_tokens' ? 'length'
      : raw.stop_reason ? 'stop' : null
    // Preserve native blocks the generic path would flatten away.
    const thinking = blocks.filter(b => b?.type === 'thinking' || b?.type === 'redacted_thinking')
    if (thinking.length) out.providerFields.thinking = thinking
    if (raw.stop_reason) out.providerFields.stopReason = raw.stop_reason
    if (raw.id) out.providerFields.messageId = raw.id
    return out
  },
}

// ---------------------------------------------------------------------------
// OpenAI-compatible base (OpenAI, Gemini, DeepSeek, Mistral, Qwen via /chat/completions)
// ---------------------------------------------------------------------------
function normalizeOpenAICompat(raw, provider) {
  const out = emptyNormalized()
  out.provider = provider
  if (!raw || typeof raw !== 'object') return { out, choice: {}, msg: {} }
  const choice = raw.choices?.[0] || {}
  const msg = choice.message || {}
  out.text = (msg.content || '').trim()
  out.toolCalls = Array.isArray(msg.tool_calls)
    ? msg.tool_calls.map(tc => ({
        id: tc.id,
        name: tc.function?.name,
        arguments: typeof tc.function?.arguments === 'string' ? tc.function.arguments : (tc.function?.arguments || {}),
      }))
    : []
  out.usage = { inputTokens: num(raw.usage?.prompt_tokens), outputTokens: num(raw.usage?.completion_tokens) }
  out.finishReason = choice.finish_reason === 'tool_calls' ? 'tool_use'
    : choice.finish_reason === 'length' ? 'length'
    : choice.finish_reason ? 'stop' : null
  return { out, choice, msg }
}

// Each OpenAI-compat provider adapter preserves the native fields THAT provider
// hangs on the compat response — the ones the generic path currently drops.
const openaiAdapter = {
  provider: 'openai', style: 'openai-compat',
  describe() {
    return {
      provider: 'openai', style: 'openai-compat',
      floor: { text: true, streaming: true, cancellation: true, structuredOutput: true, multimodalInput: true, toolCalls: true, usage: true, citations: 'unknown' },
      nativeLanes: ['Responses API tools (when adopted)', 'hosted web/file search', 'code interpreter', 'structured outputs'],
      notInherited: ['ChatGPT app', 'Projects', 'Canvas', 'account connectors', 'subscription benefits'],
    }
  },
  normalize(raw) {
    const { out } = normalizeOpenAICompat(raw, 'openai')
    if (raw?.system_fingerprint) out.providerFields.systemFingerprint = raw.system_fingerprint
    return out
  },
}

const geminiAdapter = {
  provider: 'gemini', style: 'openai-compat',
  describe() {
    return {
      provider: 'gemini', style: 'openai-compat',
      floor: { text: true, streaming: true, cancellation: true, structuredOutput: true, multimodalInput: true, toolCalls: true, usage: true, citations: 'unknown' },
      nativeLanes: ['Google Search / Maps grounding', 'URL context', 'code execution', 'Deep Research', 'thought signatures'],
      notInherited: ["Gemini app personalization", "Google-account connected apps"],
    }
  },
  normalize(raw) {
    const { out, msg } = normalizeOpenAICompat(raw, 'gemini')
    // Gemini surfaces grounding/citation metadata and (on the native API)
    // thought signatures that MUST survive round trips. Preserve whatever the
    // compat endpoint exposes rather than flattening it.
    if (msg?.grounding_metadata) out.providerFields.groundingMetadata = msg.grounding_metadata
    if (raw?.grounding_metadata) out.providerFields.groundingMetadata = raw.grounding_metadata
    if (out.providerFields.groundingMetadata) out.floorObserved = { citations: true }
    return out
  },
}

const mistralAdapter = {
  provider: 'mistral', style: 'openai-compat',
  describe() {
    return {
      provider: 'mistral', style: 'openai-compat',
      floor: { text: true, streaming: true, cancellation: true, structuredOutput: true, multimodalInput: 'unknown', toolCalls: true, usage: true, citations: 'unknown' },
      nativeLanes: ['Conversations/Agents API', 'web search', 'code interpreter', 'document library', 'managed MCP connectors'],
      notInherited: ['Le Chat/Vibe Projects', 'Work/Code UX'],
    }
  },
  normalize(raw) { return normalizeOpenAICompat(raw, 'mistral').out },
}

const qwenAdapter = {
  provider: 'qwen', style: 'openai-compat',
  describe() {
    return {
      provider: 'qwen', style: 'openai-compat',
      floor: { text: true, streaming: true, cancellation: true, structuredOutput: 'unknown', multimodalInput: true, toolCalls: true, usage: true, citations: 'unknown' },
      nativeLanes: ['Qwen multimodal parts', 'RAG/context management', 'web/image search', 'Qwen-Agent subagents'],
      notInherited: ['Qwen consumer app polish', 'Web Dev', 'Deep Research output transforms'],
    }
  },
  normalize(raw) { return normalizeOpenAICompat(raw, 'qwen').out },
}

const deepseekAdapter = {
  provider: 'deepseek', style: 'openai-compat',
  describe() {
    return {
      provider: 'deepseek', style: 'openai-compat',
      floor: { text: true, streaming: true, cancellation: true, structuredOutput: true, multimodalInput: false, toolCalls: true, usage: true, citations: false },
      nativeLanes: ['thinking / reasoning-effort controls', 'reasoning_content', 'context caching', 'prefix/FIM coding'],
      notInherited: ['mature provider-app ecosystem', 'privacy equivalence with local execution'],
    }
  },
  normalize(raw) {
    const { out, msg } = normalizeOpenAICompat(raw, 'deepseek')
    // DeepSeek returns the chain-of-thought separately — the single most
    // important native field the generic path drops.
    if (msg?.reasoning_content) out.providerFields.reasoningContent = msg.reasoning_content
    if (raw?.usage?.prompt_cache_hit_tokens != null) {
      out.providerFields.cache = {
        hit: num(raw.usage.prompt_cache_hit_tokens),
        miss: num(raw.usage.prompt_cache_miss_tokens),
      }
    }
    return out
  },
}

// ---------------------------------------------------------------------------
// Ollama (local) — native /api/chat
// ---------------------------------------------------------------------------
const ollamaAdapter = {
  provider: 'ollama', style: 'native-local',
  describe() {
    return {
      provider: 'ollama', style: 'native-local',
      floor: { text: true, streaming: true, cancellation: true, structuredOutput: 'unknown', multimodalInput: 'unknown', toolCalls: 'unknown', usage: true, citations: false },
      nativeLanes: ['fully local execution (data never leaves the machine)'],
      notInherited: [],
    }
  },
  normalize(raw) {
    const out = emptyNormalized()
    out.provider = 'ollama'
    if (!raw || typeof raw !== 'object') return out
    const msg = raw.message || {}
    out.text = (msg.content || '').trim()
    out.toolCalls = Array.isArray(msg.tool_calls)
      ? msg.tool_calls.map(tc => ({ id: tc.id, name: tc.function?.name, arguments: tc.function?.arguments || {} }))
      : []
    out.usage = { inputTokens: num(raw.prompt_eval_count), outputTokens: num(raw.eval_count) }
    out.finishReason = out.toolCalls.length ? 'tool_use' : (raw.done ? 'stop' : null)
    return out
  },
}

const ADAPTERS = Object.freeze({
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  gemini: geminiAdapter,
  mistral: mistralAdapter,
  qwen: qwenAdapter,
  deepseek: deepseekAdapter,
  ollama: ollamaAdapter,
})

export function getAdapter(provider) {
  return ADAPTERS[provider] || null
}

export function listAdapters() {
  return Object.values(ADAPTERS)
}

/** Validate a describe() floor block (used by tests + a future manifest). */
export function isValidFloor(floor) {
  if (!floor || typeof floor !== 'object') return false
  return SHARED_FLOOR.every(k => FLOOR_VALUES.has(floor[k]))
}

/**
 * Normalize a raw provider response through its adapter. Unknown provider →
 * an empty normalized shape tagged with the provider (fail soft; the caller
 * still gets a valid object, never a throw).
 */
export function normalizeResponse(provider, raw) {
  const adapter = ADAPTERS[provider]
  if (!adapter) { const e = emptyNormalized(); e.provider = provider || null; return e }
  return adapter.normalize(raw)
}
