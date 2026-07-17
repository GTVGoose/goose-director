import AgentPostureRow from './AgentPostureRow.jsx'
import StatusEntry from './StatusEntry.jsx'

export default function Dashboard({ agents, statusData, canonDocs, onNav, compact = false }) {
  const byPosture = (p) => agents.filter(a => a.posture === p).length
  const escalations = statusData.entries.filter(e => e.status === 'ESCALATION_REQUIRED')
  const reviews = statusData.entries.filter(e => e.status === 'REVIEW_WHEN_READY')

  // Condensed Overview (T12) — flag-gated (ui.overviewCompact, or implied by
  // ui.chatHome per proposal §5). The full posture list duplicates the Agents
  // view, so when compact we swap it for a stat strip that deep-links out. The
  // escalation banner is shared verbatim so its rendered output is identical.
  if (compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1000 }}>

        <EscalationBanner count={escalations.length} onNav={onNav} />

        {/* Deep-link stat strip — each tile navigates to its full view */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { label: 'Agents',      value: agents.length,      accent: 'var(--color-text)',            sub: 'Roster →',     view: 'agents' },
            { label: 'Escalations', value: escalations.length, accent: 'var(--color-escalation-text)', sub: 'Respond →',    view: 'status' },
            { label: 'Reviews',     value: reviews.length,     accent: 'var(--color-passive)',         sub: 'When ready →', view: 'status' },
            { label: 'Canon',       value: canonDocs.length,   accent: 'var(--color-active)',          sub: 'Boundary →',   view: 'canon' },
          ].map(s => (
            <button
              key={s.label}
              onClick={() => onNav(s.view)}
              style={{
                background: 'var(--color-surface)',
                border: '0.5px solid var(--color-border)',
                borderTop: `2px solid ${s.accent}`,
                borderRadius: 'var(--radius-lg)',
                padding: '10px 12px',
                textAlign: 'left',
                cursor: 'pointer',
                font: 'inherit',
                width: '100%',
                display: 'block',
              }}
            >
              <div className="glyph-label" style={{ marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 500, lineHeight: 1, color: s.accent }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 4 }}>{s.sub}</div>
            </button>
          ))}
        </div>

        {/* Posture detail lives in the Agents view — keep the Overview light */}
        <div style={{ fontSize: 12, color: 'var(--color-text-3)', padding: '2px 2px' }}>
          Agent posture detail lives in the{' '}
          <button
            onClick={() => onNav('agents')}
            style={{
              background: 'none', border: 'none', padding: 0,
              font: 'inherit', fontSize: 12, color: 'var(--color-text-2)',
              cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            Agents
          </button>
          {' '}view.
        </div>
      </div>
    )
  }

  const topEntries = statusData.entries.slice(0, 4)
  const canonEntries = canonDocs.slice(0, 6)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1000 }}>

      {/* Escalation banner — only shows when action is needed */}
      <EscalationBanner count={escalations.length} onNav={onNav} />

      {/* Stat row — color carries posture meaning */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[
          { label: 'Agents', value: agents.length, accent: 'var(--color-text)', sub: 'in system' },
          { label: 'Active', value: byPosture('Active'), accent: 'var(--color-active)', sub: 'Director-facing' },
          { label: 'Passive', value: byPosture('Passive'), accent: 'var(--color-passive)', sub: 'Background' },
          { label: 'Recursive', value: byPosture('Recursive'), accent: 'var(--color-recursive)', sub: 'System-modifying' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderTop: `2px solid ${s.accent}`,
            borderRadius: 'var(--radius-lg)',
            padding: '10px 12px',
          }}>
            <div className="glyph-label" style={{ marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 500, lineHeight: 1, color: s.accent }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Two-column */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

        <div style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}>
          <CardHeader title="Agent posture" action={{ label: 'Full map →', onClick: () => onNav('agents') }}>
            <Legend />
          </CardHeader>
          <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {agents.length === 0
              ? <Empty>No agents found.</Empty>
              : agents.map(a => <AgentPostureRow key={a.name} agent={a} compact />)}
          </div>
        </div>

        <div style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}>
          <CardHeader title="Status layer" action={{ label: 'All entries →', onClick: () => onNav('status') }} />
          <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {topEntries.length === 0
              ? <Empty>No activity yet — agent status updates appear here.</Empty>
              : topEntries.map((e, i) => <StatusEntry key={i} entry={e} compact />)}
          </div>
        </div>
      </div>

      {/* Canon state — last 6 docs */}
      <div style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}>
        <CardHeader title="Canon state" action={{ label: 'Full table →', onClick: () => onNav('canon') }} />
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid var(--color-border)' }}>
              {['Document', 'Status', 'Boundary', 'Modified'].map(h => (
                <th key={h} style={{
                  padding: '6px 12px',
                  textAlign: 'left',
                  fontSize: 10,
                  color: 'var(--color-text-3)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {canonEntries.map((doc, i) => (
              <tr key={i} style={{ borderBottom: '0.5px solid var(--color-border)' }}>
                <td style={{ padding: '6px 12px', fontSize: 13 }}>{doc.title}</td>
                <td style={{ padding: '6px 12px' }}><StatusBadge status={doc.canonStatus} /></td>
                <td style={{ padding: '6px 12px', fontSize: 12, color: 'var(--color-text-2)' }}>{doc.canonBoundary}</td>
                <td style={{ padding: '6px 12px', fontSize: 11, color: 'var(--color-text-3)' }}>{doc.lastMod}</td>
              </tr>
            ))}
            {canonEntries.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: '14px 12px', fontSize: 13, color: 'var(--color-text-3)', textAlign: 'center' }}>
                  No canon documents in this vault yet. Nexus lists anything with a Canon Status header here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Escalation banner — shared by the full and condensed Overviews so the rendered
// markup is identical in both. Renders nothing when there is no escalation.
function EscalationBanner({ count, onNav }) {
  if (count <= 0) return null
  return (
    <div style={{
      background: 'var(--color-escalation-bg)',
      border: '0.5px solid var(--color-escalation-border)',
      borderLeft: '2px solid var(--color-escalation-text)',
      borderRadius: 'var(--radius)',
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      <i className="ti ti-alert-triangle" style={{ color: 'var(--color-escalation-text)', fontSize: 15, flexShrink: 0 }}></i>
      <span style={{ color: 'var(--color-escalation-text)', fontSize: 13, fontWeight: 500 }}>
        {count} escalation{count > 1 ? 's' : ''} awaiting Director response
      </span>
      <button
        onClick={() => onNav('status')}
        style={{
          marginLeft: 'auto',
          background: 'none',
          border: '0.5px solid var(--color-escalation-border)',
          color: 'var(--color-escalation-text)',
          borderRadius: 'var(--radius)',
          padding: '3px 10px',
          fontSize: 11,
          cursor: 'pointer',
          letterSpacing: '0.03em',
        }}
      >
        Respond →
      </button>
    </div>
  )
}

function CardHeader({ title, action, children }) {
  return (
    <div style={{
      padding: '8px 12px',
      borderBottom: '0.5px solid var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      <span className="glyph-label">{title}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
        {children}
        {action && (
          <button onClick={action.onClick} style={{
            background: 'none', border: 'none',
            fontSize: 11, color: 'var(--color-text-3)',
            cursor: 'pointer', letterSpacing: '0.02em',
          }}>
            {action.label}
          </button>
        )}
      </div>
    </div>
  )
}

function Legend() {
  const items = [
    { label: 'Active', color: 'var(--color-active)' },
    { label: 'Passive', color: 'var(--color-passive)' },
    { label: 'Recursive', color: 'var(--color-recursive)' },
    { label: 'Dual', color: 'var(--color-dual)' },
  ]
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {items.map(i => (
        <span key={i.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-text-3)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: i.color, display: 'inline-block' }}></span>
          {i.label}
        </span>
      ))}
    </div>
  )
}

export function StatusBadge({ status }) {
  const styles = {
    'Canon':       { bg: 'var(--color-logged-bg)',      text: 'var(--color-logged-text)',      border: 'var(--color-logged-border)' },
    'Development': { bg: 'var(--color-dual-bg)',        text: 'var(--color-dual-text)',        border: 'var(--color-dual-border)' },
    'Candidate':   { bg: 'var(--color-passive-bg)',     text: 'var(--color-passive-text)',     border: 'var(--color-passive-border)' },
    'Archive':     { bg: 'var(--color-border)',         text: 'var(--color-text-3)',           border: 'transparent' },
    'Rejected':    { bg: 'var(--color-escalation-bg)',  text: 'var(--color-escalation-text)',  border: 'var(--color-escalation-border)' },
  }
  const s = styles[status] || { bg: 'var(--color-surface-2)', text: 'var(--color-text-2)', border: 'var(--color-border)' }
  return (
    <span style={{
      background: s.bg, color: s.text, border: `0.5px solid ${s.border}`,
      fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 'var(--radius)',
      display: 'inline-block', letterSpacing: '0.03em',
    }}>{status || 'Unknown'}</span>
  )
}

function Empty({ children }) {
  return <div style={{ fontSize: 12, color: 'var(--color-text-3)', padding: '8px 2px' }}>{children}</div>
}
