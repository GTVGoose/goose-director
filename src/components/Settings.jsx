import { useState, useEffect, useRef } from 'react'
import { ACCENTS, applyAccent } from '../theme.js'

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
  const [loaded, setLoaded] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(cfg => {
      setName(cfg.ui?.consoleName || '')
      setAccent(cfg.ui?.accent || 'violet')
      setLoaded(true)
    }).catch(() => {})
  }, [])

  const save = async () => {
    setMsg(null)
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ui: { consoleName: name, accent } }),
      })
      const data = await res.json()
      if (data.ok) {
        applyAccent(accent)
        setMsg({ ok: true, text: 'Saved.' })
      } else setMsg({ ok: false, text: data.error || 'Failed' })
    } catch (e) { setMsg({ ok: false, text: e.message }) }
  }

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

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={save} style={{
          background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border-strong)',
          borderRadius: 6, padding: '7px 16px', fontSize: 12, fontWeight: 500, color: 'var(--color-text)',
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
          fontSize: 10, padding: '1px 6px', borderRadius: 999, fontWeight: 600, letterSpacing: '0.04em',
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
            fontSize: 10, padding: '1px 6px', borderRadius: 999, fontWeight: 600,
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
          borderRadius: 6, padding: '7px 16px', fontSize: 12, fontWeight: 500, color: 'var(--color-text)',
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
          fontSize: 10, padding: '1px 6px', borderRadius: 999, fontWeight: 600, letterSpacing: '0.04em',
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
          borderRadius: 6, padding: '7px 16px', fontSize: 12, fontWeight: 500, color: 'var(--color-text)',
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
                borderRadius: 6, padding: '7px 16px', fontSize: 12, fontWeight: 500,
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
            borderRadius: 6, padding: '7px 16px', fontSize: 12, fontWeight: 500, color: 'var(--color-text)',
          }}
        >Change vault…</button>
      )}
    </div>
  )
}

export default function Settings() {
  const [anthropicKey, setAnthropicKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
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
        body: JSON.stringify({ anthropicKey, openaiKey }),
      })
      const data = await res.json()
      if (data.ok) {
        setStatus({ ok: true, message: 'Keys saved. Restart Nexus to apply.' })
        setAnthropicKey('')
        setOpenaiKey('')
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
            fontSize: 10, padding: '1px 6px', borderRadius: 999,
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
              borderRadius: 6,
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

        {field(
          'Anthropic (Claude)',
          anthropicKey,
          setAnthropicKey,
          'sk-ant-api03-...',
          keyStatus.anthropic
        )}
        {field(
          'OpenAI (GPT-4o)',
          openaiKey,
          setOpenaiKey,
          'sk-...',
          keyStatus.openai
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={save}
            disabled={saving || (!anthropicKey && !openaiKey)}
            style={{
              background: (saving || (!anthropicKey && !openaiKey))
                ? 'var(--color-surface-3)'
                : 'var(--color-surface-2)',
              border: '0.5px solid var(--color-border-strong)',
              borderRadius: 6,
              padding: '8px 18px',
              fontSize: 12,
              fontWeight: 500,
              color: (saving || (!anthropicKey && !openaiKey))
                ? 'var(--color-text-3)'
                : 'var(--color-text)',
              cursor: (saving || (!anthropicKey && !openaiKey)) ? 'not-allowed' : 'pointer',
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
