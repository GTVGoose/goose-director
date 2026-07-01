import { useState, useEffect, useRef } from 'react'

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
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-3)', fontSize: 13, padding: 2,
            }}
          >{show ? '🙈' : '👁'}</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', paddingTop: 8 }}>
      <div style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
        borderRadius: 8,
        padding: '24px',
        marginBottom: 16,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>API Keys</div>
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
            {saving ? 'Saving…' : 'Save Keys'}
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
