// observability.mjs — optional Langfuse tracing for Nexus model calls.
//
// DESIGN CONTRACT: this module must NEVER break the app.
//   • It is a no-op unless BOTH LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set.
//   • The `langfuse` package is loaded via dynamic import, so a missing dependency
//     (e.g. before `npm install`) disables tracing instead of crashing startup.
//   • traceModelCall() is fire-and-forget and swallows every error — callers do
//     not await it and it can never throw into the request path.
//
// What it gives you: one Langfuse generation per model call, with provider, model,
// input, output, and start/end time → per-call latency. The Telegram agent loop is
// traced as a single span, so you can baseline the round-trip today and measure the
// delta when you pilot speculative decoding (llama.cpp draft model) on the local 8B.
//
// Enable by adding to .env:
//   LANGFUSE_PUBLIC_KEY=pk-lf-...
//   LANGFUSE_SECRET_KEY=sk-lf-...
//   LANGFUSE_HOST=https://cloud.langfuse.com   (or your self-hosted URL)

let _state = 'uninit'   // 'uninit' | 'ready' | 'disabled'
let _client = null
let _warned = false

function warnOnce(...args) {
  if (_warned) return
  _warned = true
  console.warn('[OBS]', ...args)
}

export function observabilityEnabled() {
  return !!(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY)
}

async function ensureClient() {
  if (_state !== 'uninit') return _client
  if (!observabilityEnabled()) { _state = 'disabled'; return null }
  try {
    const mod = await import('langfuse')
    const Langfuse = mod.Langfuse || mod.default
    if (typeof Langfuse !== 'function') throw new Error('langfuse export not found')
    _client = new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com',
      // Low-volume personal tool: send each event promptly so traces show up even
      // if the desktop app is closed shortly after a call.
      flushAt: 1,
    })
    _state = 'ready'
    console.log('[OBS] Langfuse tracing enabled →', process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com')
  } catch (e) {
    _state = 'disabled'
    warnOnce('Langfuse disabled:', e.message, '— run `npm install` if you want tracing')
  }
  return _client
}

// Record one model generation. Fire-and-forget; never throws.
// { name, provider, model, input, output?, error?, metadata?, startTime, endTime }
export async function traceModelCall(evt) {
  try {
    const client = await ensureClient()
    if (!client) return
    const { name, provider, model, input, output, error, metadata, startTime, endTime } = evt
    const latencyMs = (startTime && endTime) ? (endTime - startTime) : undefined
    const trace = client.trace({
      name: name || 'nexus.call',
      metadata: { provider, latencyMs, ...(metadata || {}) },
    })
    trace.generation({
      name: `${provider || 'unknown'}:${model || 'unknown'}`,
      model: model || undefined,
      input,
      output: output ?? undefined,
      startTime,
      endTime,
      metadata: { provider, latencyMs, ...(metadata || {}) },
      level: error ? 'ERROR' : 'DEFAULT',
      statusMessage: error || undefined,
    })
  } catch (e) {
    warnOnce('trace failed:', e.message)
  }
}

// Best-effort flush (e.g. on shutdown). Never throws.
export async function flushObservability() {
  try { if (_client) await _client.flushAsync() } catch {}
}
