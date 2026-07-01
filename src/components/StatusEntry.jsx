export default function StatusEntry({ entry, compact }) {
  const styles = {
    ESCALATION_REQUIRED: {
      accent: 'var(--color-escalation-text)',
      headerBg: 'var(--color-escalation-bg)',
      label: 'ESCALATION',
      icon: 'ti-alert-triangle',
    },
    REVIEW_WHEN_READY: {
      accent: 'var(--color-review-text)',
      headerBg: 'var(--color-review-bg)',
      label: 'REVIEW',
      icon: 'ti-clock',
    },
    LOGGED: {
      accent: 'var(--color-logged-text)',
      headerBg: 'var(--color-logged-bg)',
      label: 'LOGGED',
      icon: 'ti-check',
    },
  }

  const s = styles[entry.status] || styles.LOGGED

  return (
    <div style={{
      border: '0.5px solid var(--color-border)',
      borderLeft: `2px solid ${s.accent}`,
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
    }}>
      {/* Header row */}
      <div style={{
        padding: '5px 10px',
        background: s.headerBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className={`ti ${s.icon}`} style={{ fontSize: 12, color: s.accent }}></i>
          <span style={{ fontSize: 12, fontWeight: 500, color: s.accent }}>{entry.agent}</span>
          {entry.posture && (
            <span style={{ fontSize: 10, color: s.accent, opacity: 0.6 }}>· {entry.posture}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: s.accent, opacity: 0.6 }}>{entry.date}</span>
          <span style={{
            fontSize: 9, fontWeight: 700,
            color: s.accent,
            letterSpacing: '0.06em',
            opacity: 0.8,
          }}>{s.label}</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: compact ? '6px 10px' : '9px 12px', background: 'var(--color-surface)' }}>
        <div style={{ fontSize: 12, color: 'var(--color-text)', lineHeight: 1.5 }}>
          {entry.action}
        </div>
        {!compact && entry.scope && (
          <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 3 }}>
            Scope: {entry.scope}
          </div>
        )}
        {!compact && entry.directorNote && entry.directorNote !== '(blank — routine)' && (
          <div style={{
            marginTop: 8,
            padding: '6px 10px',
            background: 'var(--color-surface-2)',
            borderRadius: 'var(--radius)',
            borderLeft: `2px solid ${s.accent}`,
          }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Director note </span>
            <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{entry.directorNote}</span>
          </div>
        )}
      </div>
    </div>
  )
}
