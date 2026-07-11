// Mini Nexus mobile API layer: PIN auth, reachability probe with cause
// disambiguation, SSE-over-fetch job streaming, and the offline observation
// outbox (client UUIDs; the server dedupes, so flushes are safe to retry).

const PIN_KEY = 'nexus-mobile-pin'
export const getPin = () => localStorage.getItem(PIN_KEY) || ''
export const setPin = (p) => localStorage.setItem(PIN_KEY, p)
export const clearPin = () => localStorage.removeItem(PIN_KEY)

export async function api(path, opts = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-voice-pin': getPin(),
      ...(opts.headers || {}),
    },
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    const err = new Error(data.error || `HTTP ${r.status}`)
    err.status = r.status
    throw err
  }
  return data
}

// ── Reachability probe ────────────────────────────────────────────────────────
// The two failure modes look identical from the phone (fetch fails), but need
// different fixes. Disambiguate: if the wider internet answers while the Nexus
// origin doesn't, the tailnet path is the problem (VPN off or Mac asleep).
// Returns: 'ok' | 'unauthorized' | 'tailnet' | 'offline'
export async function probe() {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 4000)
    const r = await fetch('/api/health', { signal: ctrl.signal, cache: 'no-store' })
    clearTimeout(t)
    if (r.ok || r.status === 401 || r.status === 403) return r.ok ? 'ok' : 'unauthorized'
    return 'tailnet'
  } catch {
    if (!navigator.onLine) return 'offline'
    try {
      // no-cors probe of a highly-available public endpoint — resolves if the
      // phone has real internet, throws if it's fully offline.
      await fetch('https://www.gstatic.com/generate_204', { mode: 'no-cors', cache: 'no-store' })
      return 'tailnet'
    } catch {
      return 'offline'
    }
  }
}

// ── Chat job streaming (SSE over fetch — EventSource can't send the PIN) ─────
// Calls onDelta for each event; resolves when the stream ends. The caller
// re-invokes on visibilitychange — the server replays all deltas on reconnect.
export async function streamJob(jobId, onDelta, signal) {
  const r = await fetch(`/api/chat/stream/${jobId}?pin=${encodeURIComponent(getPin())}`, { signal, cache: 'no-store' })
  if (!r.ok || !r.body) throw new Error(`stream ${r.status}`)
  const reader = r.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const parts = buf.split('\n\n')
    buf = parts.pop()
    for (const part of parts) {
      const line = part.split('\n').find(l => l.startsWith('data: '))
      if (!line) continue
      try { onDelta(JSON.parse(line.slice(6))) } catch { /* skip */ }
    }
  }
}

// ── Observation outbox ────────────────────────────────────────────────────────
// Observations are append-only facts — ideal for store-and-forward. (Chat is
// deliberately NOT queued: a minutes-late answer is worse than an honest
// failure, and Telegram already covers the Mac-asleep case.)
const OUTBOX_KEY = 'nexus-observe-outbox'
const readOutbox = () => { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY)) || [] } catch { return [] } }
const writeOutbox = (list) => localStorage.setItem(OUTBOX_KEY, JSON.stringify(list))

export const outboxCount = () => readOutbox().length

export function queueObservation(obs) {
  writeOutbox([...readOutbox(), obs])
}

export async function sendObservation(obs) {
  return api('/api/domains/observe', { method: 'POST', body: JSON.stringify(obs) })
}

// Flush queued observations; server-side UUID dedupe makes retries harmless.
// Returns how many remain queued.
export async function flushOutbox() {
  const queue = readOutbox()
  const remaining = []
  for (const obs of queue) {
    try { await sendObservation(obs) }
    catch { remaining.push(obs) }
  }
  writeOutbox(remaining)
  return remaining.length
}

export const uuid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)
