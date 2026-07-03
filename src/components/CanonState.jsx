import { StatusBadge } from './Dashboard.jsx'

const STATUS_ACCENTS = {
  'Canon':       'var(--color-logged-text)',
  'Development': 'var(--color-dual-text)',
  'Candidate':   'var(--color-passive-text)',
  'Archive':     'var(--color-text-3)',
}

export default function CanonState({ docs }) {
  const byStatus = (s) => docs.filter(d => d.canonStatus === s).length
  const other = docs.filter(d => !['Canon','Development','Candidate'].includes(d.canonStatus)).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 900 }}>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[
          { label: 'Canon',        count: byStatus('Canon'),       note: 'Fully approved' },
          { label: 'Development',  count: byStatus('Development'), note: 'Active, not final' },
          { label: 'Candidate',    count: byStatus('Candidate'),   note: 'Proposed for canon' },
          { label: 'No status / other', count: other,             note: 'Missing a Canon Status header' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--color-surface)',
            border: '0.5px solid var(--color-border)',
            borderTop: `2px solid ${STATUS_ACCENTS[s.label] || 'var(--color-text-3)'}`,
            borderRadius: 'var(--radius-lg)',
            padding: '10px 12px',
          }}>
            <div className="glyph-label" style={{ marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 500, lineHeight: 1, color: STATUS_ACCENTS[s.label] || 'var(--color-text-2)' }}>
              {s.count}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 4 }}>{s.note}</div>
          </div>
        ))}
      </div>

      {/* Full table */}
      <div style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid var(--color-border)' }}>
              {['Document', 'Status', 'Canon boundary', 'Modified', 'Source'].map(h => (
                <th key={h} style={{
                  padding: '7px 12px',
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
            {docs.map((doc, i) => (
              <tr key={i} style={{
                borderBottom: i < docs.length - 1 ? '0.5px solid var(--color-border)' : 'none',
              }}>
                <td style={{ padding: '7px 12px', fontSize: 13, maxWidth: 280 }}>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.title}
                  </span>
                </td>
                <td style={{ padding: '7px 12px' }}><StatusBadge status={doc.canonStatus} /></td>
                <td style={{ padding: '7px 12px', fontSize: 12, color: 'var(--color-text-2)' }}>{doc.canonBoundary || '—'}</td>
                <td style={{ padding: '7px 12px', fontSize: 11, color: 'var(--color-text-3)' }}>{doc.lastMod || '—'}</td>
                <td style={{ padding: '7px 12px' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: doc.source === 'live' ? 'var(--color-active-text)' : 'var(--color-text-3)',
                    letterSpacing: '0.04em',
                  }}>
                    {doc.source === 'live' ? 'live' : 'static'}
                  </span>
                </td>
              </tr>
            ))}
            {docs.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '20px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-3)' }}>
                  No canon documents in this vault yet. Add a "Canon Status" header to a doc and it will appear here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
