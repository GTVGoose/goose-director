import { useState } from 'react'

// PERSONAL-ONLY (Goose). Pulls shared UI/core updates from the product console (B)
// into this personal Nexus (C), then rebuilds + reloads. Goose-only features
// (Umbruh, Sandbox, Membrane) are protected by the sync and never touched.
// Registered via personal-extensions.jsx; kept out of the product build.
export default function Updates() {
  const [busy, setBusy] = useState(false)
  const [output, setOutput] = useState('')
  const [status, setStatus] = useState('')

  const run = async (apply) => {
    setBusy(true)
    setStatus(apply ? 'Syncing, rebuilding, and reloading…' : 'Checking the product console for updates…')
    setOutput('')
    try {
      const res = await fetch('/api/sync-ui', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply }),
      })
      const data = await res.json()
      setOutput((data.output || data.error || '(no output)').trim())
      if (apply && data.ok) {
        setStatus('Updated ✓ — reloading…')
        setTimeout(() => window.location.reload(), 1400)
        return
      }
      setStatus(data.ok ? 'Dry run complete — nothing written.' : 'Error.')
    } catch (e) {
      setOutput('Error: ' + e.message)
      setStatus('Error.')
    }
    setBusy(false)
  }

  const btn = (primary) => ({
    padding: '8px 16px',
    fontSize: 13,
    borderRadius: 'var(--radius)',
    cursor: busy ? 'default' : 'pointer',
    opacity: busy ? 0.5 : 1,
    border: primary ? '0.5px solid var(--color-accent-border)' : '0.5px solid var(--color-border-mid)',
    background: primary ? 'var(--color-accent-bg)' : 'none',
    color: primary ? 'var(--color-accent-text)' : 'var(--color-text-2)',
    fontWeight: primary ? 600 : 400,
  })

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>
        Updates
      </div>
      <p style={{ fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.5, marginBottom: 18, maxWidth: 620 }}>
        Pull shared UI &amp; core updates from the product console into this personal Nexus — like a
        <span style={{ fontFamily: 'var(--font-mono)' }}> git pull</span>. Your Goose-only features
        (Umbruh, Sandbox, Membrane) are protected and never overwritten.
        <strong> Sync &amp; reload</strong> applies the changes, rebuilds, and reloads the window.
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button disabled={busy} onClick={() => run(false)} style={btn(false)}>
          <i className="ti ti-search" style={{ marginRight: 6, fontSize: 13 }}></i>Check for updates
        </button>
        <button disabled={busy} onClick={() => run(true)} style={btn(true)}>
          <i className={`ti ti-refresh ${busy ? 'spin' : ''}`} style={{ marginRight: 6, fontSize: 13 }}></i>Sync &amp; reload
        </button>
      </div>

      {status && (
        <div style={{ fontSize: 12, color: 'var(--color-text-2)', marginBottom: 10 }}>{status}</div>
      )}
      {output && (
        <pre style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          lineHeight: 1.5,
          color: 'var(--color-text-2)',
          background: 'var(--color-surface-2)',
          border: '0.5px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          padding: '12px 14px',
          whiteSpace: 'pre-wrap',
          overflowX: 'auto',
          maxHeight: '52vh',
        }}>{output}</pre>
      )}
    </div>
  )
}
