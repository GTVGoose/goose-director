import { useState, useEffect } from 'react'

// Token Bank — live per-provider headroom + usage-by-model. Polls /api/usage.
// The "bank" is a local ledger (providers barely expose remaining quota), made
// live by real usage, OpenAI's rate-window headers, and 429 detection. Shows
// which pool is running low so the operator can see why routing is shifting.

const fmt = (n) => (n == null ? '—' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n))
const usd = (n) => (n == null ? '—' : '$' + Number(n).toFixed(n < 1 ? 4 : 2))
const fracColor = (f) => f == null ? 'var(--color-text-3)' : f > 0.5 ? 'var(--color-available)' : f > 0.2 ? 'var(--color-review-text, #d9a441)' : 'var(--color-unavailable)'

function Bar({ frac }) {
  const pct = frac == null ? 0 : Math.round(frac * 100)
  return (
    <div style={{ height: 7, background: 'var(--color-surface)', borderRadius: 'var(--radius-pill)', overflow: 'hidden', border: '0.5px solid var(--color-border)' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: fracColor(frac), transition: 'width var(--dur-fast)' }} />
    </div>
  )
}

function resetIn(iso) {
  if (!iso) return '—'
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'now'
  const h = Math.floor(ms / 3600_000), d = Math.floor(h / 24)
  return d >= 1 ? `${d}d ${h % 24}h` : h >= 1 ? `${h}h` : `${Math.max(1, Math.floor(ms / 60_000))}m`
}

export default function TokenBank() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  const load = () => fetch('/api/usage').then(r => r.json()).then(setData).catch(e => setErr(e.message))
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [])

  const card = { background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 14 }
  const th = { textAlign: 'left', fontSize: 10, color: 'var(--color-text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '4px 8px' }
  const td = { fontSize: 12, padding: '5px 8px', borderTop: '0.5px solid var(--color-border)' }

  if (err) return <div style={{ padding: 20, color: 'var(--color-unavailable)' }}>Usage error: {err}</div>
  if (!data) return <div style={{ padding: 20, color: 'var(--color-text-3)' }}>Loading token bank…</div>

  const bank = data.bank || {}
  const byModel = Object.entries(data.byModel || {}).sort((a, b) => (b[1].costUSD || 0) - (a[1].costUSD || 0))
  const providers = Object.entries(bank)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 }}>
      {/* Per-provider bank */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Token bank <span style={{ color: 'var(--color-text-3)', fontWeight: 400 }}>· headroom per subscription window</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
          {providers.length === 0 && <div style={{ ...card, color: 'var(--color-text-3)', fontSize: 12 }}>No providers configured in the bank.</div>}
          {providers.map(([id, p]) => {
            const capSet = p.capTokens != null || p.capUSD != null
            const frac = p.remainingFraction
            return (
              <div key={id} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8, borderColor: p.exhausted ? 'var(--color-unavailable)' : 'var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{p.label || id}</span>
                  {p.exhausted && <span style={{ fontSize: 10, color: 'var(--color-unavailable)', fontWeight: 600 }}>TAPPED OUT</span>}
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 12, color: fracColor(frac), fontWeight: 600 }}>{frac == null ? 'unknown' : Math.round(frac * 100) + '%'}</span>
                </div>
                <Bar frac={frac} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-3)' }}>
                  <span>
                    {p.capTokens != null ? `${fmt(p.remainingTokens)} / ${fmt(p.capTokens)} tok` :
                     p.capUSD != null ? `${usd(p.remainingUSD)} / ${usd(p.capUSD)}` :
                     'cap not set'}
                  </span>
                  <span>resets {resetIn(p.periodResetsAt)}</span>
                </div>
                {p.live && p.live.limitTokens > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--color-text-3)' }}>
                    live window: {fmt(p.live.remainingTokens)} / {fmt(p.live.limitTokens)} tok remaining
                  </div>
                )}
                {!capSet && (
                  <div style={{ fontSize: 10, color: 'var(--color-text-3)', lineHeight: 1.4, borderTop: '0.5px solid var(--color-border)', paddingTop: 6 }}>
                    Set a cap in <code>goose.config.json → tokenBank</code> to enable bank-aware routing away from {p.label || id} when it runs low.{p.note ? ` ${p.note}` : ''}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Daily paid spend */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>Paid spend today</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{usd(data.costUSD)}{data.budgetUSD > 0 && <span style={{ fontSize: 12, color: 'var(--color-text-3)', fontWeight: 400 }}> / {usd(data.budgetUSD)}</span>}</div>
        </div>
        {data.budgetUSD > 0 && <div style={{ flex: 1, maxWidth: 240 }}><Bar frac={Math.max(0, 1 - (data.costUSD || 0) / data.budgetUSD)} /></div>}
        {data.overBudget && <span style={{ fontSize: 11, color: 'var(--color-unavailable)', fontWeight: 600 }}>OVER BUDGET</span>}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{data.calls || 0} calls · {fmt((data.inTok || 0) + (data.outTok || 0))} tok</div>
      </div>

      {/* Usage by model */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Usage by model</div>
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Model</th><th style={th}>Provider</th><th style={{ ...th, textAlign: 'right' }}>Calls</th>
              <th style={{ ...th, textAlign: 'right' }}>In</th><th style={{ ...th, textAlign: 'right' }}>Out</th><th style={{ ...th, textAlign: 'right' }}>Cost</th>
            </tr></thead>
            <tbody>
              {byModel.length === 0 && <tr><td style={{ ...td, color: 'var(--color-text-3)' }} colSpan={6}>No calls yet this session.</td></tr>}
              {byModel.map(([id, m]) => (
                <tr key={id}>
                  <td style={{ ...td, fontWeight: 500 }}>{id}</td>
                  <td style={{ ...td, color: 'var(--color-text-3)' }}>{m.provider}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{m.calls}</td>
                  <td style={{ ...td, textAlign: 'right', color: 'var(--color-text-2)' }}>{fmt(m.inTok)}</td>
                  <td style={{ ...td, textAlign: 'right', color: 'var(--color-text-2)' }}>{fmt(m.outTok)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{m.provider === 'claude-code' ? <span style={{ color: 'var(--color-available)' }}>$0 (Max)</span> : usd(m.costUSD)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
