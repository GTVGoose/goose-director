import { useState, useEffect, useRef } from 'react'

const POSTURE_COLORS = {
  Active:    'var(--color-active-text)',
  Passive:   'var(--color-passive-text)',
  Recursive: 'var(--color-recursive-text)',
  Dual:      'var(--color-dual-text)',
}

// Light markdown → readable text: strip bold/inline-code markers, keep structure
function plain(text) {
  return (text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*>\s?/gm, '')
    .trim()
}

function Chip({ label, value, color }) {
  if (!value) return null
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 1,
      background: 'var(--color-surface-2)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 'var(--radius)',
      padding: '5px 9px',
      minWidth: 0,
    }}>
      <span className="glyph-label">{label}</span>
      <span style={{ fontSize: 11.5, color: color || 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value}
      </span>
    </div>
  )
}

function Section({ heading, body, accent }) {
  const [open, setOpen] = useState(false)
  const text = plain(body)
  const isLong = text.length > 420
  return (
    <div style={{ borderTop: '0.5px solid var(--color-border)', padding: '10px 0' }}>
      <button
        onClick={() => isLong && setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          background: 'none', border: 'none', padding: 0, textAlign: 'left',
          cursor: isLong ? 'pointer' : 'default',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: accent || 'var(--color-text-2)', flex: 1 }}>
          {heading}
        </span>
        {isLong && (
          <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 12, color: 'var(--color-text-3)' }}></i>
        )}
      </button>
      <div style={{
        fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.6, marginTop: 5,
        whiteSpace: 'pre-wrap',
      }}>
        {open || !isLong ? text : text.slice(0, 420).trimEnd() + '…'}
      </div>
    </div>
  )
}

export default function AgentDetail({ agent, onClose, onInvoke }) {
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)
  const closeRef = useRef(null)

  useEffect(() => {
    setDetail(null)
    setError(null)
    if (!agent) return
    const params = agent.id ? `id=${encodeURIComponent(agent.id)}` : `name=${encodeURIComponent(agent.name)}`
    fetch(`/api/agent-detail?${params}`)
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(new Error(d.error || `HTTP ${r.status}`))))
      .then(setDetail)
      .catch(e => setError(e.message))
  }, [agent?.id, agent?.name])

  // Dialog semantics: focus moves into the drawer on open and returns to the
  // invoking element on close; Escape dismisses.
  useEffect(() => {
    if (!agent) return
    const invoker = document.activeElement
    closeRef.current?.focus()
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (invoker && document.contains(invoker)) invoker.focus()
    }
  }, [agent, onClose])

  if (!agent) return null

  const postureColor = POSTURE_COLORS[agent.posture] || 'var(--color-text-2)'
  const op = detail?.operational
  const myth = detail?.mythology

  return (
    <>
      {/* Backdrop — blurred scrim, not just dimming */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(9,8,6,0.55)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          zIndex: 40, animation: 'fade-in var(--dur-base) var(--ease-out)',
        }}
      />
      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${agent.name} — agent detail`}
        style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, maxWidth: '86vw',
        background: 'var(--color-surface)',
        borderLeft: '0.5px solid var(--color-border-strong)',
        zIndex: 41,
        display: 'flex', flexDirection: 'column',
        animation: 'drawer-in var(--dur-base) var(--ease-out)',
        boxShadow: '-12px 0 40px rgba(0,0,0,0.5), inset 1px 0 0 rgba(255,248,230,0.04)',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '0.5px solid var(--color-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>{agent.name}</div>
              <div className="mono" style={{ color: 'var(--color-text-3)', marginTop: 3 }}>
                {agent.id || 'no registry id'}
              </div>
            </div>
            {onInvoke && (
              <button onClick={() => onInvoke(agent)} className="btn-ghost" style={{
                background: 'none', border: '0.5px solid var(--color-border-mid)',
                borderRadius: 'var(--radius)', padding: '4px 10px', fontSize: 11,
                color: 'var(--color-text-2)', letterSpacing: '0.02em', flexShrink: 0,
              }}>Invoke →</button>
            )}
            <button ref={closeRef} onClick={onClose} aria-label="Close" style={{
              background: 'none', border: 'none', color: 'var(--color-text-3)',
              fontSize: 16, padding: '2px 4px', flexShrink: 0, lineHeight: 1,
            }}><i className="ti ti-x"></i></button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            <Chip label="Posture" value={agent.posture} color={postureColor} />
            <Chip label="Type" value={agent.type} />
            <Chip label="Role" value={detail?.role || agent.role} />
            <Chip label="Authority" value={op?.authority || agent.authority} />
            <Chip label="Owner" value={agent.owner} />
            <Chip label="Status" value={agent.canonStatus} />
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px 24px' }}>
          {error && (
            <div style={{ fontSize: 12, color: 'var(--color-escalation-text)', padding: '12px 0' }}>
              Could not load detail: {error}
            </div>
          )}
          {!detail && !error && (
            <div style={{ fontSize: 12, color: 'var(--color-text-3)', padding: '12px 0' }}>Loading…</div>
          )}

          {op && (
            <div style={{ marginBottom: 20 }}>
              <div className="glyph-label" style={{ color: postureColor, marginBottom: 8 }}>
                ▸ Operational layer — how it works
              </div>
              {op.summary && (
                <div style={{ fontSize: 12.5, lineHeight: 1.65, color: 'var(--color-text)', whiteSpace: 'pre-wrap', marginBottom: 6 }}>
                  {plain(op.summary)}
                </div>
              )}
              {(op.cascadeLayer || op.reviews) && (
                <div style={{ fontSize: 11.5, color: 'var(--color-text-2)', lineHeight: 1.6, marginBottom: 6 }}>
                  {op.cascadeLayer && <div><span style={{ color: 'var(--color-text-3)' }}>Cascade layer:</span> {op.cascadeLayer}</div>}
                  {op.reviews && <div><span style={{ color: 'var(--color-text-3)' }}>Reviews:</span> {op.reviews}</div>}
                </div>
              )}
              {(op.sections || []).filter(s => !/^function$/i.test(s.heading)).map(s => (
                <Section key={s.heading} heading={s.heading} body={s.body} />
              ))}
            </div>
          )}

          {detail && (
            myth ? (
              <div style={{
                border: '0.5px solid var(--color-recursive-border)',
                background: 'var(--color-recursive-bg)',
                borderRadius: 'var(--radius-lg)',
                padding: '12px 14px',
              }}>
                <div className="glyph-label" style={{ color: 'var(--color-recursive-text)', marginBottom: 8 }}>
                  ◈ Mythological layer
                </div>
                {myth.sigil && (
                  <div style={{ fontSize: 12, color: 'var(--color-text)', marginBottom: 8 }}>
                    <span style={{ color: 'var(--color-text-3)' }}>Sigil alignment:</span>{' '}
                    <span style={{ color: 'var(--color-recursive-text)' }}>{plain(myth.sigil)}</span>
                  </div>
                )}
                {myth.summary && (
                  <div style={{ fontSize: 12, lineHeight: 1.65, color: 'var(--color-text-2)', whiteSpace: 'pre-wrap', marginBottom: 4 }}>
                    {plain(myth.summary)}
                  </div>
                )}
                {(myth.sections || []).slice(1).map(s => (
                  <Section key={s.heading} heading={s.heading} body={s.body} accent="var(--color-recursive-text)" />
                ))}

                {/* The two layers, side by side */}
                <div style={{ marginTop: 12, borderTop: '0.5px solid var(--color-recursive-border)', paddingTop: 10 }}>
                  <div className="glyph-label" style={{ marginBottom: 8 }}>Operational vs mythological</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11.5, lineHeight: 1.55 }}>
                    <div>
                      <div style={{ color: postureColor, fontWeight: 600, marginBottom: 3 }}>Operational</div>
                      <div style={{ color: 'var(--color-text-2)' }}>
                        What the agent actually does: its role{detail.role ? ` (${detail.role})` : ''}, authority tier, breakers, and the files it may touch. This layer is enforceable and auditable.
                      </div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--color-recursive-text)', fontWeight: 600, marginBottom: 3 }}>Mythological</div>
                      <div style={{ color: 'var(--color-text-2)' }}>
                        The symbolic identity the agent reasons through{myth.sigil ? ` — ${plain(myth.sigil).replace(/\(.*?\)/g, '').trim()}` : ''}. It shapes voice and judgment, but grants no authority the operational layer doesn't.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{
                fontSize: 11.5, color: 'var(--color-text-3)', lineHeight: 1.6,
                border: '0.5px dashed var(--color-border-mid)', borderRadius: 'var(--radius-lg)',
                padding: '10px 12px',
              }}>
                No mythological layer — this agent is purely operational.
              </div>
            )
          )}

          {detail?.path && (
            <div className="mono" style={{ color: 'var(--color-text-3)', marginTop: 16, wordBreak: 'break-all' }}>
              charter: {detail.path}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
