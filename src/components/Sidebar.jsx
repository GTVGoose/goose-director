export default function Sidebar({ view, onNav, escalations, reviews }) {

  const nav = (id, icon, label, sub, badge) => (
    <button
      key={id}
      onClick={() => onNav(id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '7px 10px',
        width: '100%',
        background: view === id
          ? 'linear-gradient(90deg, rgba(122,100,200,0.12), rgba(122,100,200,0.04))'
          : 'none',
        border: 'none',
        borderLeft: view === id
          ? '2px solid var(--color-recursive)'
          : '2px solid transparent',
        borderRadius: '0 var(--radius) var(--radius) 0',
        fontSize: 13,
        color: view === id ? 'var(--color-text)' : 'var(--color-text-2)',
        fontWeight: view === id ? 500 : 400,
        textAlign: 'left',
        cursor: 'pointer',
        marginBottom: 1,
        transition: 'all 0.12s',
      }}
    >
      <i className={`ti ti-${icon}`} style={{
        fontSize: 15,
        flexShrink: 0,
        color: view === id ? 'var(--color-recursive-text)' : 'var(--color-text-3)',
      }}></i>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 13 }}>{label}</span>
          {badge && (
            <span style={{
              background: badge.color === 'red' ? 'var(--color-escalation-bg)' : 'var(--color-review-bg)',
              color: badge.color === 'red' ? 'var(--color-escalation-text)' : 'var(--color-review-text)',
              border: `0.5px solid ${badge.color === 'red' ? 'var(--color-escalation-border)' : 'var(--color-review-border)'}`,
              fontSize: 10,
              fontWeight: 600,
              padding: '1px 5px',
              borderRadius: 999,
              minWidth: 18,
              textAlign: 'center',
            }}>{badge.count}</span>
          )}
        </div>
        {sub && view !== id && (
          <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 1, lineHeight: 1.3 }}>{sub}</div>
        )}
      </div>
    </button>
  )

  const section = (label) => (
    <div style={{
      fontSize: 9,
      fontWeight: 600,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: 'var(--color-text-3)',
      padding: '14px 12px 4px',
    }}>{label}</div>
  )

  const statusBadge = escalations > 0
    ? { color: 'red', count: escalations }
    : reviews > 0 ? { color: 'amber', count: reviews } : null

  return (
    <div style={{
      width: 'var(--sidebar-width)',
      background: 'var(--color-surface)',
      borderRight: '0.5px solid var(--color-border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      height: '100%',
      overflowY: 'auto',
    }}>
      {/* Identity */}
      <div style={{
        padding: '20px 12px 16px',
        borderBottom: '0.5px solid var(--color-border)',
        marginBottom: 6,
      }}>
        <div style={{
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: 'var(--color-text)',
          lineHeight: 1,
        }}>NEXUS</div>
        <div style={{
          fontSize: 10,
          color: 'var(--color-text-3)',
          marginTop: 4,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>Goose Director Console</div>
      </div>

      {section('Observe')}
      {nav('dashboard', 'layout-dashboard', 'Overview', 'System state at a glance')}
      {nav('agents', 'users', 'Agents', 'Who runs, how, and where')}
      {nav('knowledge', 'books', 'Knowledge', 'Search all canon and docs')}

      {section('Monitor')}
      {nav('status', 'bell', 'Status Layer', 'Background agent activity', statusBadge)}
      {nav('canon', 'git-branch', 'Canon State', 'What\'s inside and outside')}

      {section('Act')}
      {nav('invoke', 'terminal-2', 'Invoke', 'Send work to any agent or model')}
      {nav('sandbox', 'users-group', 'Sandbox', 'Many models, one council')}

      {section('Studio')}
      {nav('membrane', 'topology-star-3', 'Membrane', 'SFS Vault shared intelligence')}

      <div style={{ flex: 1 }} />

      {nav('settings', 'settings', 'Settings', 'API keys and configuration')}

      <div style={{
        padding: '10px 12px',
        borderTop: '0.5px solid var(--color-border)',
        fontSize: 10,
        color: 'var(--color-text-3)',
        letterSpacing: '0.03em',
      }}>
        Nexus v0.1 · Goose Agent System
      </div>
    </div>
  )
}
