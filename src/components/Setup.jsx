import { useState } from 'react'

const VAULT_LABELS = {
  goose: 'Goose Agent System',
  sfs: 'SFS-style studio vault',
  generic: 'Generic vault',
}

// First-run harness screen: point Nexus at any vault on disk. The server
// detects the layout (goose / sfs / generic) and adapts what it reads.
export default function Setup({ onDone }) {
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)   // { ok, vaultType, vaultName, agentCount, error }

  const connect = async () => {
    if (!path.trim()) return
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath: path }),
      })
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setResult({ ok: false, error: e.message })
    }
    setBusy(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'var(--color-bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        width: 520, maxWidth: '92vw',
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border-mid)',
        borderRadius: 'var(--radius-lg)',
        padding: '32px 36px',
        animation: 'fade-in 0.2s ease-out',
      }}>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' }}>NEXUS</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-2)', marginTop: 6, lineHeight: 1.6 }}>
          Connect Nexus to the vault it should harness. Point it at the root folder of
          your system — a Goose Agent System repo, an SFS-style studio vault, or any
          vault with an agent registry — and Nexus adapts to what it finds there.
        </div>

        <div style={{ marginTop: 22 }}>
          <div className="glyph-label" style={{ marginBottom: 6 }}>Vault path</div>
          <input
            value={path}
            onChange={e => setPath(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && connect()}
            placeholder="/Users/you/Documents/sfs-vault"
            autoFocus
            style={{ width: '100%', fontFamily: 'SF Mono, Menlo, monospace', fontSize: 12 }}
          />
          <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 6, lineHeight: 1.5 }}>
            Tip: drag the vault folder from Finder into this field, or paste its absolute path.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
          <button
            onClick={connect}
            disabled={busy || !path.trim()}
            style={{
              background: busy || !path.trim() ? 'var(--color-surface-3)' : 'var(--color-recursive-bg)',
              border: `0.5px solid ${busy || !path.trim() ? 'var(--color-border-mid)' : 'var(--color-recursive-border)'}`,
              color: busy || !path.trim() ? 'var(--color-text-3)' : 'var(--color-recursive-text)',
              borderRadius: 'var(--radius)',
              padding: '8px 18px', fontSize: 12, fontWeight: 600, letterSpacing: '0.03em',
              cursor: busy || !path.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Detecting…' : 'Detect & connect'}
          </button>

          {result && !result.ok && (
            <span style={{ fontSize: 12, color: 'var(--color-unavailable)' }}>{result.error}</span>
          )}
        </div>

        {result?.ok && (
          <div style={{
            marginTop: 18, padding: '12px 14px',
            background: 'var(--color-logged-bg)',
            border: '0.5px solid var(--color-logged-border)',
            borderRadius: 'var(--radius-lg)',
          }}>
            <div style={{ fontSize: 12, color: 'var(--color-logged-text)', fontWeight: 600 }}>
              Connected — {result.vaultName || 'vault'}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-2)', marginTop: 4, lineHeight: 1.6 }}>
              Detected layout: {VAULT_LABELS[result.vaultType] || result.vaultType || 'unknown'} ·{' '}
              {result.agentCount} agent{result.agentCount === 1 ? '' : 's'} in the registry.
            </div>
            <button
              onClick={onDone}
              style={{
                marginTop: 10,
                background: 'none',
                border: '0.5px solid var(--color-border-strong)',
                borderRadius: 'var(--radius)',
                padding: '6px 14px', fontSize: 12, color: 'var(--color-text)',
              }}
            >
              Enter Nexus →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
