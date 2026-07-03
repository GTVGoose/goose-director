import { useState } from 'react'
import AgentPostureRow from './AgentPostureRow.jsx'
import AgentDetail from './AgentDetail.jsx'

const POSTURE_ORDER = ['Active', 'Passive', 'Recursive', 'Dual', 'Unknown']

// Headers use the -text variants (base hues fail contrast as 13px text on dark)
const POSTURE_META = {
  Active:    { color: 'var(--color-active-text)',    bar: 'var(--color-active)',    desc: 'Invoked directly. Output is visible in your session.' },
  Passive:   { color: 'var(--color-passive-text)',   bar: 'var(--color-passive)',   desc: 'Runs in background. Feeds other agents or system state.' },
  Recursive: { color: 'var(--color-recursive-text)', bar: 'var(--color-recursive)', desc: 'Modifies system behavior or architecture. Errors are multiplicative.' },
  Dual:      { color: 'var(--color-dual-text)',      bar: 'var(--color-dual)',      desc: 'Both Archetype and Operational — posture depends on invocation context.' },
  Unknown:   { color: 'var(--color-text-3)',         bar: 'var(--color-text-3)',    desc: 'Posture not yet classified.' },
}

export default function AgentMap({ agents, onInvoke }) {
  const [selected, setSelected] = useState(null)

  const grouped = POSTURE_ORDER.reduce((acc, p) => {
    const group = agents.filter(a => a.posture === p)
    if (group.length) acc[p] = group
    return acc
  }, {})
  // Postures outside the standard set (from foreign vaults) still get shown
  const leftovers = agents.filter(a => !POSTURE_ORDER.includes(a.posture))
  if (leftovers.length) grouped.Unknown = [...(grouped.Unknown || []), ...leftovers]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 800 }}>
      <AgentDetail agent={selected} onClose={() => setSelected(null)} onInvoke={onInvoke && (() => onInvoke())} />
      {Object.keys(grouped).length === 0 && (
        <div style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px',
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--color-text-3)',
        }}>
          No agents found. Connect a vault in Settings → Vault connection.
        </div>
      )}

      {Object.entries(grouped).map(([posture, group]) => {
        const meta = POSTURE_META[posture] || POSTURE_META.Unknown
        return (
          <div key={posture} style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderTop: `2px solid ${meta.bar}`,
            boxShadow: 'inset 0 1px 0 rgba(255,248,230,0.04)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '10px 14px',
              borderBottom: '0.5px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: meta.color }}>{posture}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 2, lineHeight: 1.4 }}>
                  {meta.desc}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
                  {group.length} agent{group.length > 1 ? 's' : ''}
                </span>
                {onInvoke && (
                  <button onClick={onInvoke} style={{
                    background: 'none',
                    border: '0.5px solid var(--color-border-mid)',
                    borderRadius: 'var(--radius)',
                    padding: '3px 9px',
                    fontSize: 11,
                    color: 'var(--color-text-2)',
                    cursor: 'pointer',
                    letterSpacing: '0.02em',
                  }}>Invoke →</button>
                )}
              </div>
            </div>
            <div style={{ padding: '8px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {group.map(a => <AgentPostureRow key={a.id || a.name} agent={a} onClick={() => setSelected(a)} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
