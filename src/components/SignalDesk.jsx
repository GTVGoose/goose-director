import { useEffect, useState } from 'react'

// PERSONAL-ONLY (Goose). Signal Desk — the Nexus surface of the Signal fleet's
// Director-fork protocol (charter v3 §4). Shows open fork packets (urgent
// first), lets the Director resolve them in place, and renders the Signal
// Brief on demand. Data comes from /api/signal/* (signal.mjs); Telegram
// delivery of the same packets is handled server-side.
export default function SignalDesk() {
  const [forks, setForks] = useState([])
  const [brief, setBrief] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [decision, setDecision] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const r = await fetch('/api/signal/forks')
      const data = await r.json()
      setForks(data.forks || [])
    } catch (e) { setStatus('Error loading forks: ' + e.message) }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  const loadBrief = async () => {
    setBusy(true)
    try {
      const r = await fetch('/api/signal/brief')
      const data = await r.json()
      setBrief(data.text || '(empty brief)')
    } catch (e) { setBrief('Error: ' + e.message) }
    setBusy(false)
  }

  const resolve = async (fork_id) => {
    if (!decision.trim()) { setStatus('Write the decision first — it is appended to the fork packet as the resolution of record.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/signal/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fork_id, decision: decision.trim() }),
      })
      const data = await r.json()
      setStatus(data.ok ? `${fork_id} resolved ✓` : 'Error: ' + (data.error || 'unknown'))
      if (data.ok) { setDecision(''); setExpanded(null); load() }
    } catch (e) { setStatus('Error: ' + e.message) }
    setBusy(false)
  }

  const open = forks.filter(f => f.status === 'open')
  const resolved = forks.filter(f => f.status !== 'open')

  const card = (urgent) => ({
    border: `0.5px solid ${urgent ? 'var(--color-accent-border)' : 'var(--color-border)'}`,
    background: 'var(--color-surface-2)',
    borderRadius: 'var(--radius)',
    padding: '10px 14px',
    marginBottom: 8,
    cursor: 'pointer',
  })
  const badge = (urgent) => ({
    fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
    color: urgent ? 'var(--color-accent-text)' : 'var(--color-text-2)',
    border: `0.5px solid ${urgent ? 'var(--color-accent-border)' : 'var(--color-border-mid)'}`,
    borderRadius: 'var(--radius)', padding: '1px 7px', marginRight: 8,
  })
  const btn = {
    padding: '7px 14px', fontSize: 12, borderRadius: 'var(--radius)', cursor: 'pointer',
    border: '0.5px solid var(--color-accent-border)', background: 'var(--color-accent-bg)',
    color: 'var(--color-accent-text)', fontWeight: 600,
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>
        Signal Desk
      </div>
      <p style={{ fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.5, marginBottom: 18, maxWidth: 640 }}>
        The Signal fleet's Director interface — fork packets awaiting your call, urgent first.
        Urgent forks also hit your Telegram the moment they land; routine ones ride the daily
        Signal Brief. Resolutions are appended to the fork packet in goose-agent-system.
      </p>

      {status && <div style={{ fontSize: 12, color: 'var(--color-text-2)', marginBottom: 10 }}>{status}</div>}

      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', margin: '14px 0 8px' }}>
        Open forks ({open.length})
      </div>
      {open.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--color-text-2)', marginBottom: 12 }}>
          Nothing is waiting on you.
        </div>
      )}
      {open.map(f => (
        <div key={f.fork_id} style={card(f.effectiveUrgency === 'urgent')}
             onClick={() => setExpanded(expanded === f.fork_id ? null : f.fork_id)}>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 12.5 }}>
            <span style={badge(f.effectiveUrgency === 'urgent')}>
              {f.effectiveUrgency === 'urgent' ? 'URGENT' : 'ROUTINE'}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-2)', marginRight: 10 }}>{f.fork_id}</span>
            <span style={{ color: 'var(--color-text)', fontWeight: 500, flex: 1 }}>{f.title}</span>
            {f.deadline && <span style={{ fontSize: 11, color: 'var(--color-text-2)' }}>by {f.deadline}</span>}
          </div>
          {expanded === f.fork_id && (
            <div onClick={e => e.stopPropagation()} style={{ marginTop: 10 }}>
              <pre style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.55, whiteSpace: 'pre-wrap',
                color: 'var(--color-text-2)', background: 'none', border: 'none', margin: '0 0 10px',
              }}>{f.body}</pre>
              {f.default && (
                <div style={{ fontSize: 11, color: 'var(--color-text-2)', marginBottom: 8 }}>
                  Default if unanswered: {f.default}
                </div>
              )}
              <textarea
                value={decision}
                onChange={e => setDecision(e.target.value)}
                placeholder="Your decision (becomes the resolution of record)…"
                rows={2}
                style={{
                  width: '100%', fontSize: 12, fontFamily: 'inherit', padding: 8,
                  borderRadius: 'var(--radius)', border: '0.5px solid var(--color-border-mid)',
                  background: 'var(--color-surface)', color: 'var(--color-text)', marginBottom: 8,
                }}
              />
              <button disabled={busy} style={{ ...btn, opacity: busy ? 0.5 : 1 }} onClick={() => resolve(f.fork_id)}>
                <i className="ti ti-check" style={{ marginRight: 6, fontSize: 12 }}></i>Resolve fork
              </button>
            </div>
          )}
        </div>
      ))}

      {resolved.length > 0 && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ fontSize: 12, color: 'var(--color-text-2)', cursor: 'pointer' }}>
            Resolved ({resolved.length})
          </summary>
          {resolved.map(f => (
            <div key={f.fork_id} style={{ fontSize: 12, color: 'var(--color-text-2)', padding: '6px 2px' }}>
              ✓ <span style={{ fontFamily: 'var(--font-mono)' }}>{f.fork_id}</span> — {f.title}
            </div>
          ))}
        </details>
      )}

      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', margin: '22px 0 8px' }}>
        Signal Brief
      </div>
      <button disabled={busy} style={{ ...btn, opacity: busy ? 0.5 : 1 }} onClick={loadBrief}>
        <i className="ti ti-radar-2" style={{ marginRight: 6, fontSize: 12 }}></i>Build today's brief
      </button>
      {brief && (
        <pre style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.55, whiteSpace: 'pre-wrap',
          color: 'var(--color-text-2)', background: 'var(--color-surface-2)',
          border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius)',
          padding: 12, marginTop: 10,
        }}>{brief}</pre>
      )}
    </div>
  )
}
