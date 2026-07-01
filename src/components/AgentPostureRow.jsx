const POSTURE_COLORS = {
  Active:    { dot: 'var(--color-active)',    bg: 'var(--color-active-bg)',    text: 'var(--color-active-text)',    border: 'var(--color-active-border)' },
  Passive:   { dot: 'var(--color-passive)',   bg: 'var(--color-passive-bg)',   text: 'var(--color-passive-text)',   border: 'var(--color-passive-border)' },
  Recursive: { dot: 'var(--color-recursive)', bg: 'var(--color-recursive-bg)', text: 'var(--color-recursive-text)', border: 'var(--color-recursive-border)' },
  Dual:      { dot: 'var(--color-dual)',      bg: 'var(--color-dual-bg)',      text: 'var(--color-dual-text)',      border: 'var(--color-dual-border)' },
  Unknown:   { dot: 'var(--color-text-3)',    bg: 'transparent',               text: 'var(--color-text-2)',         border: 'transparent' },
}

export default function AgentPostureRow({ agent, compact }) {
  const c = POSTURE_COLORS[agent.posture] || POSTURE_COLORS.Unknown

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: compact ? '4px 8px 4px 10px' : '7px 10px 7px 12px',
      borderLeft: `2px solid ${c.dot}`,
      borderRadius: '0 var(--radius) var(--radius) 0',
      background: c.bg,
      gap: 8,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: compact ? 12 : 13,
          fontWeight: 500,
          color: 'var(--color-text)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {agent.name}
        </div>
        {!compact && agent.type && (
          <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 1 }}>{agent.type}</div>
        )}
      </div>
      <span style={{
        background: 'rgba(0,0,0,0.15)',
        color: c.text,
        fontSize: 10,
        fontWeight: 600,
        padding: '1px 5px',
        borderRadius: 'var(--radius)',
        flexShrink: 0,
        letterSpacing: '0.04em',
      }}>{agent.posture || '—'}</span>
    </div>
  )
}
