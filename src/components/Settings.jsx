import { useState, useEffect, useRef } from 'react'
import { ACCENTS, applyAccent, THEMES, applyTheme } from '../theme.js'
import { PROVIDER_CAPABILITIES, CAP_COLS } from '../lib/capabilities.js'

const cardStyle = {
  background: 'var(--color-surface)',
  border: '0.5px solid var(--color-border)',
  borderRadius: 8,
  padding: '24px',
  marginBottom: 16,
}

function PersonalizationCard() {
  const [name, setName] = useState('')
  const [accent, setAccent] = useState('violet')
  const [theme, setThemeKey] = useState('studio')
  const [loaded, setLoaded] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(cfg => {
      setName(cfg.ui?.consoleName || '')
      setAccent(cfg.ui?.accent || 'violet')
      setThemeKey(THEMES[cfg.ui?.theme] ? cfg.ui.theme : 'studio')
      setLoaded(true)
    }).catch(() => {})
  }, [])

  const save = async () => {
    setMsg(null)
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ui: { consoleName: name, accent, theme } }),
      })
      const data = await res.json()
      if (data.ok) {
        // Re-assert theme then accent (accent layers on top — option A).
        applyTheme(theme)
        applyAccent(accent)
        setMsg({ ok: true, text: 'Saved.' })
      } else setMsg({ ok: false, text: data.error || 'Failed' })
    } catch (e) { setMsg({ ok: false, text: e.message }) }
  }

  // A theme swatch reads its own overrides; where a theme leaves a token to the
  // baseline (studio = all of them) fall back to the live default var so the
  // preview matches what would actually render.
  const swatch = (t, k, fallback) => (t.vars && t.vars[k]) || fallback

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Personalization</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 16, lineHeight: 1.5 }}>
        Make this console yours. The name appears in the sidebar; the accent colors the interface.
      </div>

      <div style={{ marginBottom: 16 }}>
        <div className="glyph-label" style={{ marginBottom: 6 }}>Console name</div>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="defaults to your vault's name"
          disabled={!loaded}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ marginBottom: 18 }}>
        <div className="glyph-label" style={{ marginBottom: 8 }}>Accent</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(ACCENTS).map(([key, a]) => (
            <button
              key={key}
              onClick={() => { setAccent(key); applyAccent(key) }}
              title={a.label}
              style={{
                width: 30, height: 30, borderRadius: '50%',
                background: a.main,
                border: accent === key ? '2px solid var(--color-text)' : '2px solid transparent',
                outline: accent === key ? 'none' : `0.5px solid var(--color-border-mid)`,
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 6 }}>
          {ACCENTS[accent]?.label}
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div className="glyph-label" style={{ marginBottom: 8 }}>Theme</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {Object.entries(THEMES).map(([key, t]) => {
            const selected = theme === key
            const bg = swatch(t, '--color-bg', 'var(--color-bg)')
            const surf = swatch(t, '--color-surface-2', 'var(--color-surface-2)')
            const txt = swatch(t, '--color-text', 'var(--color-text)')
            const brd = swatch(t, '--color-border-strong', 'var(--color-border-strong)')
            return (
              <button
                key={key}
                onClick={() => { setThemeKey(key); applyTheme(key); applyAccent(accent) }}
                title={t.label}
                style={{
                  width: 116, padding: 0, textAlign: 'left', cursor: 'pointer',
                  background: 'none', borderRadius: 'var(--radius-lg)',
                  border: selected ? '2px solid var(--color-text)' : `2px solid transparent`,
                  outline: selected ? 'none' : `0.5px solid var(--color-border-mid)`,
                  overflow: 'hidden',
                }}
              >
                {/* mini preview built from the theme's own tokens */}
                <div style={{ background: bg, padding: 8, borderBottom: `0.5px solid ${brd}` }}>
                  <div style={{ height: 8, width: '70%', borderRadius: 2, background: txt, opacity: 0.85, marginBottom: 5 }} />
                  <div style={{ display: 'flex', gap: 4 }}>
                    <span style={{ width: 14, height: 14, borderRadius: 'var(--radius-sm)', background: surf, border: `0.5px solid ${brd}` }} />
                    <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--color-accent)' }} />
                  </div>
                </div>
                <div style={{
                  padding: '5px 8px', fontSize: 10.5, lineHeight: 1.3,
                  color: selected ? 'var(--color-text)' : 'var(--color-text-2)',
                  background: 'var(--color-surface-2)',
                }}>{t.label}</div>
              </button>
            )
          })}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 6 }}>
          Full-interface look. Your accent color layers on top of any theme. More themes coming soon.
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={save} style={{
          background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border-strong)',
          borderRadius: 'var(--radius-md)', padding: '7px 16px', fontSize: 12, fontWeight: 500, color: 'var(--color-text)',
        }}>Save</button>
        {msg && (
          <span style={{ fontSize: 12, color: msg.ok ? 'var(--color-available)' : 'var(--color-unavailable)' }}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  )
}

function TelegramCard() {
  const [enabled, setEnabled] = useState(false)
  const [chatId, setChatId] = useState('')
  const [token, setToken] = useState('')
  const [tokenSet, setTokenSet] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(cfg => {
      setEnabled(!!cfg.telegram?.enabled)
      setChatId(cfg.telegram?.directorChatId || '')
      setTokenSet(!!cfg.telegram?.tokenSet)
    }).catch(() => {})
  }, [])

  const save = async () => {
    setMsg(null)
    try {
      if (token.trim()) {
        const r1 = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegramToken: token.trim() }),
        })
        const d1 = await r1.json()
        if (!d1.ok) throw new Error(d1.error || 'Token save failed')
        setTokenSet(true)
        setToken('')
      }
      const r2 = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram: { enabled, directorChatId: chatId } }),
      })
      const d2 = await r2.json()
      if (!d2.ok) throw new Error(d2.error || 'Save failed')
      setMsg({ ok: true, text: 'Saved. Restart Nexus to apply.' })
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    }
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Telegram bridge</div>
        <span style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-pill)', fontWeight: 600, letterSpacing: '0.04em',
          background: enabled && tokenSet ? 'rgba(72,152,96,0.15)' : 'rgba(138,132,120,0.12)',
          color: enabled && tokenSet ? 'var(--color-available)' : 'var(--color-text-3)',
          border: `0.5px solid ${enabled && tokenSet ? 'rgba(72,152,96,0.3)' : 'var(--color-border-mid)'}`,
        }}>{enabled && tokenSet ? '● ACTIVE' : '○ OFF'}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 16, lineHeight: 1.5 }}>
        Connect your own bot for status pings and remote control. Create one with @BotFather,
        paste the token here, and set your chat ID. The token lives in your local .env only.
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-2)', marginBottom: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} style={{ width: 'auto' }} />
        Enable the bridge
      </label>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-2)' }}>Bot token</span>
          <span style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-pill)', fontWeight: 600,
            background: tokenSet ? 'rgba(72,152,96,0.15)' : 'rgba(216,80,80,0.12)',
            color: tokenSet ? 'var(--color-available)' : 'var(--color-unavailable)',
            border: `0.5px solid ${tokenSet ? 'rgba(72,152,96,0.3)' : 'rgba(216,80,80,0.25)'}`,
          }}>{tokenSet ? '● SET' : '○ NOT SET'}</span>
        </div>
        <div style={{ position: 'relative' }}>
          <input
            type={showToken ? 'text' : 'password'}
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder={tokenSet ? '•••••• (enter a new token to replace)' : '123456:ABC-DEF…'}
            style={{ width: '100%', paddingRight: 40 }}
          />
          <button onClick={() => setShowToken(s => !s)} aria-label={showToken ? 'Hide token' : 'Show token'} style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', color: 'var(--color-text-3)', fontSize: 14, padding: 2,
          }}><i className={`ti ${showToken ? 'ti-eye-off' : 'ti-eye'}`}></i></button>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-2)', marginBottom: 6 }}>Your chat ID</div>
        <input
          value={chatId}
          onChange={e => setChatId(e.target.value)}
          placeholder="message @userinfobot to find yours"
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={save} style={{
          background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border-strong)',
          borderRadius: 'var(--radius-md)', padding: '7px 16px', fontSize: 12, fontWeight: 500, color: 'var(--color-text)',
        }}>Save</button>
        {msg && (
          <span style={{ fontSize: 12, color: msg.ok ? 'var(--color-available)' : 'var(--color-unavailable)' }}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  )
}

function SandboxCard() {
  const [enabled, setEnabled] = useState(false)
  const [model, setModel] = useState('')
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(cfg => {
      setEnabled(!!cfg.sandbox?.enabled)
      setModel(cfg.sandbox?.model || '')
    }).catch(() => {})
  }, [])

  const save = async () => {
    setMsg(null)
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandbox: { enabled, model } }),
      })
      const data = await res.json()
      if (data.ok) setMsg({ ok: true, text: 'Saved — applies immediately.' })
      else setMsg({ ok: false, text: data.error || 'Failed' })
    } catch (e) { setMsg({ ok: false, text: e.message }) }
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Sandbox — local agent tools</div>
        <span style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-pill)', fontWeight: 600, letterSpacing: '0.04em',
          background: enabled ? 'rgba(72,152,96,0.15)' : 'rgba(138,132,120,0.12)',
          color: enabled ? 'var(--color-available)' : 'var(--color-text-3)',
          border: `0.5px solid ${enabled ? 'rgba(72,152,96,0.3)' : 'var(--color-border-mid)'}`,
        }}>{enabled ? '● ENABLED' : '○ DISABLED'}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 14, lineHeight: 1.6 }}>
        Lets your local companion act on this Mac through the voice interface and Telegram
        bridge: run shell commands, read and write files, fetch web pages, open apps.
        Powered only by your local Ollama model — it never uses cloud API keys and never
        leaves this machine. Off means the companion can talk but cannot touch anything.
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-2)', marginBottom: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} style={{ width: 'auto' }} />
        I understand — allow local tools
      </label>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-2)', marginBottom: 6 }}>Sandbox model (Ollama)</div>
        <input
          value={model}
          onChange={e => setModel(e.target.value)}
          placeholder="llama3.1:8b"
          style={{ width: '100%', fontFamily: 'SF Mono, Menlo, monospace', fontSize: 12 }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={save} style={{
          background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border-strong)',
          borderRadius: 'var(--radius-md)', padding: '7px 16px', fontSize: 12, fontWeight: 500, color: 'var(--color-text)',
        }}>Save</button>
        {msg && (
          <span style={{ fontSize: 12, color: msg.ok ? 'var(--color-available)' : 'var(--color-unavailable)' }}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  )
}

// T19: pricing refresh + product-update check. Reads /api/pricing + /api/config,
// triggers /api/pricing/refresh and /api/updates/check. All outbound is user-initiated,
// fail-soft to the baked table, and honestly disclosed in PRIVACY.md.
function PricingCard() {
  const [info, setInfo] = useState(null)        // { source, fetchedAt, manifestUrl, stale, counts }
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [manifestUrl, setManifestUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [update, setUpdate] = useState(null)     // { current, latest, updateAvailable, url, error }
  const [msg, setMsg] = useState(null)

  const load = () => {
    fetch('/api/pricing').then(r => r.json()).then(p => {
      setInfo({ source: p.source, fetchedAt: p.fetchedAt, manifestUrl: p.manifestUrl, stale: p.stale,
                counts: { models: Object.keys(p.models || {}).length, providers: Object.keys(p.providers || {}).length } })
    }).catch(() => {})
    fetch('/api/config').then(r => r.json()).then(cfg => {
      setAutoRefresh(!!cfg.pricing?.autoRefreshOnUpdate)
      setManifestUrl(cfg.pricing?.manifestUrl || '')
    }).catch(() => {})
  }
  useEffect(load, [])

  const refresh = async () => {
    setBusy(true); setMsg(null)
    try {
      const d = await (await fetch('/api/pricing/refresh', { method: 'POST' })).json()
      if (d.ok) setMsg({ ok: true, text: `Updated — ${d.counts.models} models, ${d.counts.providers} providers.` })
      else setMsg({ ok: false, text: `Kept built-in prices — ${d.error || 'no update'}.` })
      load()
    } catch (e) { setMsg({ ok: false, text: e.message }) }
    setBusy(false)
  }

  const checkUpdates = async () => {
    setBusy(true); setUpdate(null)
    try { setUpdate(await (await fetch('/api/updates/check')).json()) }
    catch (e) { setUpdate({ error: e.message }) }
    setBusy(false)
  }

  const saveSettings = async () => {
    setMsg(null)
    try {
      const d = await (await fetch('/api/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricing: { autoRefreshOnUpdate: autoRefresh, manifestUrl: manifestUrl.trim() } }),
      })).json()
      setMsg(d.ok ? { ok: true, text: 'Saved.' } : { ok: false, text: d.error || 'Failed' })
      load()
    } catch (e) { setMsg({ ok: false, text: e.message }) }
  }

  const btn = { background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border-strong)',
                borderRadius: 'var(--radius-md)', padding: '7px 16px', fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Pricing &amp; updates</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 14, lineHeight: 1.6 }}>
        Nexus estimates model costs from a built-in price table. You can refresh it from the
        published pricing manifest, and check for new Nexus releases. Both are one-off requests
        you trigger — they send no vault or usage data, and fail back to the built-in table if
        the network is unavailable.
      </div>

      {info?.stale && (
        <div style={{ fontSize: 12, color: 'var(--color-text-2)', marginBottom: 12, padding: '8px 10px',
                      borderRadius: 'var(--radius-md)', background: 'rgba(138,132,120,0.10)', border: '0.5px solid var(--color-border-mid)' }}>
          Nexus was updated since prices were last refreshed — they may be outdated. Refresh to update.
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 14, lineHeight: 1.7 }}>
        <div>Source: <span className="mono">{info?.source ? 'refreshed manifest' : 'built-in table'}</span></div>
        <div>Last refreshed: <span className="mono">{info?.fetchedAt ? new Date(info.fetchedAt).toLocaleString() : 'never'}</span></div>
        {info?.counts && <div>Entries: <span className="mono">{info.counts.models} models · {info.counts.providers} providers</span></div>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={refresh} disabled={busy} style={btn}>{busy ? 'Working…' : 'Refresh pricing'}</button>
        <button onClick={checkUpdates} disabled={busy} style={btn}>Check for updates</button>
        {msg && <span style={{ fontSize: 12, color: msg.ok ? 'var(--color-available)' : 'var(--color-unavailable)' }}>{msg.text}</span>}
      </div>

      {update && (
        <div style={{ fontSize: 12, color: 'var(--color-text-2)', marginBottom: 16, lineHeight: 1.6 }}>
          {update.error ? `Couldn't check for updates (${update.error}).`
            : update.updateAvailable
              ? <>Update available: <span className="mono">{update.current} → {update.latest}</span>{update.url && <> · <a href={update.url} target="_blank" rel="noreferrer">release notes</a></>}</>
              : <>You're on the latest version (<span className="mono">{update.current}</span>).</>}
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-2)', marginBottom: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} style={{ width: 'auto' }} />
        Automatically refresh pricing when Nexus is updated (off by default)
      </label>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-2)', marginBottom: 6 }}>Pricing manifest URL</div>
        <input value={manifestUrl} onChange={e => setManifestUrl(e.target.value)}
               placeholder="https://raw.githubusercontent.com/GTVGoose/nexus/main/pricing.json"
               style={{ width: '100%', fontFamily: 'SF Mono, Menlo, monospace', fontSize: 12 }} />
      </div>
      <button onClick={saveSettings} style={btn}>Save</button>
    </div>
  )
}

// T13: PROVIDER_CAPABILITIES + CAP_COLS moved to ../lib/capabilities.js (T18b) so this card
// and Onboarding.jsx share one source of truth. It gates which toggles the panel offers — a
// capability *possibility* map, NOT an enablement. See docs/capability-architecture.md §3.

// A flagged, default-OFF scaffold. Renders ONLY when config.ui.capabilitiesPanel === true,
// so it is invisible in the shipped product. It records per-model capability INTENT to
// config.capabilities and enforces NOTHING — no model can execute tools or computer-use from
// here (the Sandbox card is the only live tool gate). Enablement is gate G8. See T13.
function CapabilitiesCard() {
  const [visible, setVisible] = useState(null)   // null=loading, false=flag off (render nothing)
  const [models, setModels] = useState([])
  const [caps, setCaps] = useState({})           // { [modelId]: { tools, mcp, computerUse } }
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(cfg => {
      if (!cfg.ui?.capabilitiesPanel) { setVisible(false); return }
      setVisible(true)
      setCaps(cfg.capabilities?.models || {})
    }).catch(() => setVisible(false))
    fetch('/api/models').then(r => r.json()).then(d => setModels(d.models || [])).catch(() => {})
  }, [])

  if (visible !== true) return null   // flag off or still loading → invisible

  const get = (id, key) => !!(caps[id] && caps[id][key])
  const toggle = (id, key) => setCaps(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: !(prev[id] && prev[id][key]) } }))

  const save = async () => {
    setMsg(null)
    // The scaffold NEVER enables: `enforced` stays false and computer-use is forced off before
    // sending, no matter the local state. Intent-recording only. (defense in depth vs the server
    // normalizer, which also stores this as inert data.)
    const outModels = {}
    for (const [id, c] of Object.entries(caps)) {
      outModels[id] = { tools: !!(c && c.tools), mcp: !!(c && c.mcp), computerUse: false }
    }
    try {
      const res = await fetch('/api/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capabilities: { enforced: false, models: outModels } }),
      })
      const data = await res.json()
      if (data.ok) setMsg({ ok: true, text: 'Intents saved — recorded, not enforced (gate G8).' })
      else setMsg({ ok: false, text: data.error || 'Failed' })
    } catch (e) { setMsg({ ok: false, text: e.message }) }
  }

  // dedupe by id (defensive — /api/models can append auto-detected ollama entries)
  const rows = []
  const seen = new Set()
  for (const m of models) {
    if (!m || !m.id || seen.has(m.id)) continue
    seen.add(m.id); rows.push(m)
  }

  const th = { textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-text-3)', padding: '6px 10px', letterSpacing: '0.03em' }
  const td = { fontSize: 12, padding: '7px 10px', borderTop: '0.5px solid var(--color-border)' }

  const cell = (m, key) => {
    const supported = !!(PROVIDER_CAPABILITIES[m.provider] && PROVIDER_CAPABILITIES[m.provider][key])
    const locked = key === 'computerUse'   // computer-use is a gate (G8), never a scaffold toggle
    if (!supported) {
      return <span title={`${m.provider} does not support ${key}`} style={{ color: 'var(--color-text-3)' }}>—</span>
    }
    if (locked) {
      return (
        <span title="Computer-use enablement is gate G8" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-text-3)' }}>
          <i className="ti ti-lock" style={{ fontSize: 13 }}></i>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em' }}>G8</span>
        </span>
      )
    }
    return (
      <input type="checkbox" checked={get(m.id, key)} onChange={() => toggle(m.id, key)}
        style={{ width: 'auto', cursor: 'pointer' }} />
    )
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Capabilities — per model (developer)</div>
        <span style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-pill)', fontWeight: 600, letterSpacing: '0.04em',
          background: 'rgba(138,132,120,0.12)', color: 'var(--color-text-3)', border: '0.5px solid var(--color-border-mid)',
        }}>◇ SCAFFOLD</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 14, lineHeight: 1.6 }}>
        Record which model should eventually be allowed tools or MCP. <strong style={{ color: 'var(--color-text-2)' }}>Nothing
        here is enforced.</strong> No model can execute tools or computer-use from this panel — the
        Sandbox card above is the only live tool gate. Turning any capability on, and computer-use
        specifically, is gate <span className="mono">G8</span>. Toggles appear only where the provider
        is known to support the capability.
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Model</th>
              {CAP_COLS.map(c => <th key={c.key} style={{ ...th, textAlign: 'center' }}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td style={{ ...td, color: 'var(--color-text-3)' }} colSpan={CAP_COLS.length + 1}>No models configured.</td></tr>
            )}
            {rows.map(m => (
              <tr key={m.id}>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.available ? 'var(--color-available)' : 'var(--color-text-3)', flexShrink: 0 }} />
                    <span style={{ fontWeight: 500 }}>{m.name || m.id}</span>
                    <span className="mono" style={{ color: 'var(--color-text-3)', fontSize: 11 }}>{m.provider}</span>
                  </div>
                </td>
                {CAP_COLS.map(c => <td key={c.key} style={{ ...td, textAlign: 'center' }}>{cell(m, c.key)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <button onClick={save} style={{
          background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border-strong)',
          borderRadius: 'var(--radius-md)', padding: '7px 16px', fontSize: 12, fontWeight: 500, color: 'var(--color-text)',
        }}>Save intents</button>
        {msg && (
          <span style={{ fontSize: 12, color: msg.ok ? 'var(--color-available)' : 'var(--color-unavailable)' }}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  )
}

// T18b: makes David's "you can revisit this anytime" promise real. Sets
// ui.onboardingComplete:false → the first-run flow shows again on next load. Only rendered
// when onboarding is not suppressed (ui.onboarding !== false) so it's absent in builds that
// opt out of onboarding entirely (the personal C lineage). Writes intent only.
function ReplayOnboardingCard() {
  const [visible, setVisible] = useState(null)   // null=loading, false=onboarding suppressed
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    fetch('/api/config').then(r => r.json())
      .then(cfg => setVisible(cfg.ui?.onboarding !== false))
      .catch(() => setVisible(false))
  }, [])

  if (visible !== true) return null

  const replay = async () => {
    setMsg(null)
    try {
      const res = await fetch('/api/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ui: { onboardingComplete: false } }),
      })
      const data = await res.json()
      if (data.ok) setMsg({ ok: true, text: 'Onboarding will show on next load — reload the app to see it.' })
      else setMsg({ ok: false, text: data.error || 'Failed' })
    } catch (e) { setMsg({ ok: false, text: e.message }) }
  }

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Onboarding</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 14, lineHeight: 1.6 }}>
        Replay the first-run welcome, feature tour, and capability setup.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={replay} style={{
          background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border-strong)',
          borderRadius: 'var(--radius-md)', padding: '7px 16px', fontSize: 12, fontWeight: 500, color: 'var(--color-text)',
        }}>Replay onboarding</button>
        {msg && (
          <span style={{ fontSize: 12, color: msg.ok ? 'var(--color-available)' : 'var(--color-unavailable)' }}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  )
}

const VAULT_LABELS = {
  goose: 'Goose Agent System layout',
  sfs: 'SFS-style studio vault',
  generic: 'Generic vault',
}

function VaultCard() {
  const [cfg, setCfg] = useState(null)
  const [editing, setEditing] = useState(false)
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)   // { ok, text }

  const load = () => fetch('/api/config').then(r => r.json()).then(setCfg).catch(() => {})
  useEffect(() => { load() }, [])

  const save = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath: path }),
      })
      const data = await res.json()
      if (data.ok) {
        setMsg({ ok: true, text: `Connected: ${data.vaultName} — ${data.agentCount} agents. Reloading…` })
        setTimeout(() => window.location.reload(), 900)
      } else {
        setMsg({ ok: false, text: data.error || 'Failed' })
      }
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    }
    setBusy(false)
  }

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 8,
      padding: '24px',
      marginBottom: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Vault connection</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 14, lineHeight: 1.5 }}>
        The vault Nexus harnesses. Everything in the console — agents, canon, knowledge — is read live from here.
      </div>

      {cfg && (
        <div style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 14 }}>
          <div>
            <span style={{ color: 'var(--color-text-3)' }}>Path: </span>
            <span className="mono" style={{ color: cfg.exists ? 'var(--color-text)' : 'var(--color-unavailable)' }}>
              {cfg.repoPath || 'not set'}
            </span>
            {!cfg.exists && <span style={{ color: 'var(--color-unavailable)' }}> (not found)</span>}
          </div>
          <div>
            <span style={{ color: 'var(--color-text-3)' }}>Detected: </span>
            {cfg.vaultName ? `${cfg.vaultName} · ${VAULT_LABELS[cfg.vaultType] || cfg.vaultType}` : '—'}
          </div>
        </div>
      )}

      {editing ? (
        <div>
          <input
            value={path}
            onChange={e => setPath(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()}
            placeholder="/absolute/path/to/your/vault"
            autoFocus
            style={{ width: '100%', fontFamily: 'SF Mono, Menlo, monospace', fontSize: 12, marginBottom: 10 }}
          />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={save}
              disabled={busy || !path.trim()}
              style={{
                background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border-strong)',
                borderRadius: 'var(--radius-md)', padding: '7px 16px', fontSize: 12, fontWeight: 500,
                color: busy || !path.trim() ? 'var(--color-text-3)' : 'var(--color-text)',
              }}
            >{busy ? 'Detecting…' : 'Detect & connect'}</button>
            <button
              onClick={() => { setEditing(false); setMsg(null) }}
              style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--color-text-3)' }}
            >Cancel</button>
            {msg && (
              <span style={{ fontSize: 12, color: msg.ok ? 'var(--color-available)' : 'var(--color-unavailable)' }}>
                {msg.text}
              </span>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={() => { setEditing(true); setPath(cfg?.repoPath || '') }}
          style={{
            background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border-strong)',
            borderRadius: 'var(--radius-md)', padding: '7px 16px', fontSize: 12, fontWeight: 500, color: 'var(--color-text)',
          }}
        >Change vault…</button>
      )}
    </div>
  )
}

// Additional repos (multi-repo). The primary vault (VaultCard) is always mounted;
// this connects EXTRA repos that Nexus indexes for discovery (Domains, Knowledge).
// 'reference' = read-only/indexed; 'workspace' = eligible as an action target (Phase 3).
function AdditionalReposCard() {
  const [repos, setRepos] = useState([])
  const [adding, setAdding] = useState(false)
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('reference')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = () => fetch('/api/repos').then(r => r.json()).then(setRepos).catch(() => {})
  useEffect(() => { load() }, [])

  const post = async (body) => {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/repos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (data.ok) { setRepos(data.repos); return true }
      setMsg({ ok: false, text: data.error || 'Failed' }); return false
    } catch (e) { setMsg({ ok: false, text: e.message }); return false }
    finally { setBusy(false) }
  }

  const add = async () => {
    if (!path.trim()) return
    if (await post({ action: 'add', path, name: name.trim() || undefined, role })) {
      setAdding(false); setPath(''); setName(''); setRole('reference')
    }
  }

  const additional = repos.filter(r => !r.primary)

  return (
    <div style={{ background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 8, padding: 24, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Additional repos</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 14, lineHeight: 1.5 }}>
        Connect more repos for Nexus to index alongside the primary vault. Their Domains &amp; Knowledge
        show up tagged by repo. <span className="mono">reference</span> = read-only; <span className="mono">workspace</span> = usable as an action target later.
      </div>

      {repos.filter(r => r.primary).map(r => (
        <div key={r.id} style={{ fontSize: 12, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-pill)', background: 'var(--color-accent-bg)', color: 'var(--color-accent-text)', border: '0.5px solid var(--color-accent-border)', fontWeight: 600 }}>PRIMARY</span>
          <span style={{ fontWeight: 500 }}>{r.name}</span>
          <span className="mono" style={{ color: 'var(--color-text-3)' }}>{r.path}</span>
        </div>
      ))}

      {additional.map(r => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '0.5px solid var(--color-border)', fontSize: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
              {r.name}
              {!r.exists && <span style={{ color: 'var(--color-unavailable)', fontSize: 11 }}>(not found)</span>}
            </div>
            <div className="mono" style={{ color: 'var(--color-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.path}</div>
          </div>
          <select
            value={r.role}
            onChange={e => post({ action: 'update', id: r.id, role: e.target.value })}
            disabled={busy}
            style={{ fontSize: 11, padding: '3px 6px', borderRadius: 5, border: '0.5px solid var(--color-border-strong)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
          >
            <option value="reference">reference</option>
            <option value="workspace">workspace</option>
          </select>
          <button onClick={() => post({ action: 'remove', id: r.id })} disabled={busy}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', fontSize: 14 }}>
            <i className="ti ti-trash"></i>
          </button>
        </div>
      ))}

      {adding ? (
        <div style={{ marginTop: 12, borderTop: '0.5px solid var(--color-border)', paddingTop: 12 }}>
          <input value={path} onChange={e => setPath(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="/absolute/path/to/repo (must be under your home folder)" autoFocus
            style={{ width: '100%', fontFamily: 'SF Mono, Menlo, monospace', fontSize: 12, marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Display name (optional)"
              style={{ flex: 1, fontSize: 12 }} />
            <select value={role} onChange={e => setRole(e.target.value)}
              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 5, border: '0.5px solid var(--color-border-strong)', background: 'var(--color-surface)', color: 'var(--color-text)' }}>
              <option value="reference">reference</option>
              <option value="workspace">workspace</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={add} disabled={busy || !path.trim()}
              style={{ background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', padding: '7px 16px', fontSize: 12, fontWeight: 500, color: busy || !path.trim() ? 'var(--color-text-3)' : 'var(--color-text)' }}>
              {busy ? 'Adding…' : 'Add repo'}</button>
            <button onClick={() => { setAdding(false); setMsg(null) }} style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--color-text-3)' }}>Cancel</button>
            {msg && <span style={{ fontSize: 12, color: msg.ok ? 'var(--color-available)' : 'var(--color-unavailable)' }}>{msg.text}</span>}
          </div>
        </div>
      ) : (
        <button onClick={() => { setAdding(true); setMsg(null) }}
          style={{ marginTop: 12, background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', padding: '7px 16px', fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>
          + Connect a repo
        </button>
      )}
    </div>
  )
}

// Cloud providers with first-class key fields. `id` matches /api/key-status,
// `field` matches the /api/settings body. Any other OpenAI-compatible host is
// reachable via a model entry's baseUrl/apiKeyEnv in goose.config.json.
const KEY_FIELDS = [
  { id: 'anthropic', field: 'anthropicKey', label: 'Anthropic (Claude)',      placeholder: 'sk-ant-api03-...' },
  { id: 'openai',    field: 'openaiKey',    label: 'OpenAI (GPT)',            placeholder: 'sk-...' },
  { id: 'gemini',    field: 'geminiKey',    label: 'Google (Gemini)',         placeholder: 'AIza...' },
  { id: 'deepseek',  field: 'deepseekKey',  label: 'DeepSeek',                placeholder: 'sk-...' },
  { id: 'mistral',   field: 'mistralKey',   label: 'Mistral',                 placeholder: 'API key' },
  { id: 'qwen',      field: 'qwenKey',      label: 'Qwen (Alibaba DashScope)', placeholder: 'sk-...' },
]

// Per-provider auth lane: subscription (CLI login, $0) vs API key (paid).
// v1 covers OpenAI (ChatGPT subscription via Codex CLI vs the API variants),
// mirroring how Claude Max already runs $0 through the Claude Code CLI.
function ProviderAccessCard() {
  const [prefer, setPrefer] = useState('subscription')
  const [codexAvailable, setCodexAvailable] = useState(null) // null = loading
  const [loaded, setLoaded] = useState(false)
  const [msg, setMsg] = useState(null)

  const refresh = () => {
    fetch('/api/config').then(r => r.json()).then(cfg => {
      setPrefer(cfg.providers?.openai?.prefer === 'api' ? 'api' : 'subscription')
      setLoaded(true)
    }).catch(() => {})
    fetch('/api/models').then(r => r.json()).then(d => {
      const codex = (d.models || []).find(m => m.provider === 'codex')
      setCodexAvailable(codex ? !!codex.available : false)
    }).catch(() => setCodexAvailable(false))
  }
  useEffect(refresh, [])

  const save = async (next) => {
    setPrefer(next); setMsg(null)
    try {
      const res = await fetch('/api/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: { openai: { prefer: next } } }),
      })
      const data = await res.json()
      setMsg(data.ok ? { ok: true, text: 'Saved.' } : { ok: false, text: data.error || 'Failed' })
      setTimeout(refresh, 300)
    } catch (e) { setMsg({ ok: false, text: e.message }) }
  }

  // Which lane is actually active given the preference + CLI availability.
  const active = prefer === 'api' ? 'api'
    : codexAvailable ? 'subscription'
    : 'api-fallback'

  const opt = (val, title, sub) => (
    <button onClick={() => save(val)} disabled={!loaded} style={{
      flex: 1, textAlign: 'left', cursor: 'pointer', padding: '12px 14px',
      background: prefer === val ? 'var(--color-accent-bg)' : 'var(--color-surface-2)',
      border: `1px solid ${prefer === val ? 'var(--color-accent)' : 'var(--color-border)'}`,
      borderRadius: 8, color: 'var(--color-text)',
    }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 3, lineHeight: 1.4 }}>{sub}</div>
    </button>
  )

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>OpenAI access</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 16, lineHeight: 1.5 }}>
        Run GPT on your <strong style={{ color: 'var(--color-text-2)' }}>ChatGPT subscription</strong> ($0, via the Codex CLI) or on <strong style={{ color: 'var(--color-text-2)' }}>API credits</strong> (pay-per-token). Subscription is the OpenAI analog of Claude Max — preferred when available, with automatic fallback to the API.
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        {opt('subscription', 'Subscription (recommended)', 'ChatGPT plan via Codex CLI · $0 API credits')}
        {opt('api', 'API key', 'GPT-5.6 Sol / Terra / Luna · pay-per-token')}
      </div>

      {/* Live status */}
      <div style={{ fontSize: 12, padding: '10px 12px', borderRadius: 8, background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border)', lineHeight: 1.5 }}>
        {active === 'subscription' && <span style={{ color: 'var(--color-available)' }}>● Active: subscription — Codex CLI detected, GPT runs $0 on your ChatGPT plan.</span>}
        {active === 'api' && <span style={{ color: 'var(--color-text-2)' }}>● Active: API — GPT-5.6 variants billed to your OpenAI API credits.</span>}
        {active === 'api-fallback' && (
          <span style={{ color: 'var(--color-review-text, #d9a441)' }}>
            ● Subscription selected, but the Codex CLI isn’t installed yet — currently falling back to the API. To activate $0 subscription billing:
            <div style={{ marginTop: 6, fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--color-text-2)' }}>
              npm install -g @openai/codex<br />codex login &nbsp;<span style={{ color: 'var(--color-text-3)' }}># sign in with your ChatGPT account</span>
            </div>
          </span>
        )}
      </div>
      {msg && <div style={{ marginTop: 10, fontSize: 12, color: msg.ok ? 'var(--color-available)' : 'var(--color-unavailable)' }}>{msg.text}</div>}
    </div>
  )
}

export default function Settings() {
  const [keys, setKeys] = useState({})
  const anyKey = Object.values(keys).some(Boolean)
  const [status, setStatus] = useState(null)   // { ok, message }
  const [saving, setSaving] = useState(false)
  const [keyStatus, setKeyStatus] = useState({})

  useEffect(() => {
    fetch('/api/key-status')
      .then(r => r.json())
      .then(d => setKeyStatus(d))
      .catch(() => {})
  }, [])

  const save = async () => {
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(keys),
      })
      const data = await res.json()
      if (data.ok) {
        setStatus({ ok: true, message: 'Keys saved. Restart Nexus to apply.' })
        setKeys({})
        setKeyStatus(data.keyStatus)
      } else {
        setStatus({ ok: false, message: data.error || 'Save failed.' })
      }
    } catch (e) {
      setStatus({ ok: false, message: e.message })
    }
    setSaving(false)
  }

  const field = (label, value, onChange, placeholder, isSet) => {
    const [show, setShow] = useState(false)
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-2)' }}>{label}</span>
          <span style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-pill)',
            background: isSet ? 'rgba(72,152,96,0.15)' : 'rgba(216,80,80,0.12)',
            color: isSet ? 'var(--color-available)' : 'var(--color-unavailable)',
            border: `0.5px solid ${isSet ? 'rgba(72,152,96,0.3)' : 'rgba(216,80,80,0.25)'}`,
            fontWeight: 600, letterSpacing: '0.04em',
          }}>
            {isSet ? '● SET' : '○ NOT SET'}
          </span>
        </div>
        <div style={{ position: 'relative' }}>
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            style={{
              width: '100%',
              background: 'var(--color-surface-2)',
              border: '0.5px solid var(--color-border-mid)',
              borderRadius: 'var(--radius-md)',
              padding: '9px 40px 9px 12px',
              fontSize: 13,
              color: 'var(--color-text)',
              fontFamily: 'var(--font-mono)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <button
            onClick={() => setShow(s => !s)}
            aria-label={show ? 'Hide key' : 'Show key'}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-3)', fontSize: 14, padding: 2,
            }}
          ><i className={`ti ${show ? 'ti-eye-off' : 'ti-eye'}`}></i></button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', paddingTop: 8 }}>
      <VaultCard />
      <AdditionalReposCard />
      <PersonalizationCard />

      <div style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
        borderRadius: 8,
        padding: '24px',
        marginBottom: 16,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>API keys</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 20, lineHeight: 1.5 }}>
          Keys are saved to <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>~/Library/Application Support/Nexus/.env</span> and never leave your machine. Nexus must be restarted after saving.
        </div>

        {KEY_FIELDS.map(k => (
          <div key={k.id}>
            {field(
              k.label,
              keys[k.field] || '',
              v => setKeys(prev => ({ ...prev, [k.field]: v })),
              k.placeholder,
              keyStatus[k.id]
            )}
          </div>
        ))}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={save}
            disabled={saving || !anyKey}
            style={{
              background: (saving || !anyKey)
                ? 'var(--color-surface-3)'
                : 'var(--color-surface-2)',
              border: '0.5px solid var(--color-border-strong)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 18px',
              fontSize: 12,
              fontWeight: 500,
              color: (saving || !anyKey)
                ? 'var(--color-text-3)'
                : 'var(--color-text)',
              cursor: (saving || !anyKey) ? 'not-allowed' : 'pointer',
              letterSpacing: '0.02em',
            }}
          >
            {saving ? 'Saving…' : 'Save keys'}
          </button>

          {status && (
            <span style={{
              fontSize: 12,
              color: status.ok ? 'var(--color-available)' : 'var(--color-unavailable)',
            }}>
              {status.message}
            </span>
          )}
        </div>
      </div>

      <TelegramCard />
      <SandboxCard />
      <ProviderAccessCard />
      <PricingCard />
      <CapabilitiesCard />
      <ReplayOnboardingCard />

      <div style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
        borderRadius: 8,
        padding: '18px 24px',
        fontSize: 12,
        color: 'var(--color-text-3)',
        lineHeight: 1.6,
      }}>
        <div style={{ fontWeight: 500, color: 'var(--color-text-2)', marginBottom: 6 }}>Local AI (Ollama)</div>
        Ollama runs locally at <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>http://localhost:11434</span> and requires no API key. Make sure Ollama.app is running before invoking local models.
      </div>
    </div>
  )
}
