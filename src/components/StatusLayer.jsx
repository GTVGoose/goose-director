import { useState } from 'react'
import StatusEntry from './StatusEntry.jsx'

export default function StatusLayer({ entries }) {
  const escalations = entries.filter(e => e.status === 'ESCALATION_REQUIRED')
  const reviews = entries.filter(e => e.status === 'REVIEW_WHEN_READY')
  const logged = entries.filter(e => e.status === 'LOGGED')
  const [loggedOpen, setLoggedOpen] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 800 }}>

      {entries.length === 0 && (
        <div style={{
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px',
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--color-text-3)',
        }}>
          System is quiet. No entries in the Status Layer.
        </div>
      )}

      {escalations.length > 0 && (
        <Section title="Escalations — Director response required" count={escalations.length} color="var(--color-escalation-text)">
          {escalations.map((e, i) => <StatusEntry key={i} entry={e} />)}
        </Section>
      )}

      {reviews.length > 0 && (
        <Section title="Review when ready" count={reviews.length} color="var(--color-review-text)">
          {reviews.map((e, i) => <StatusEntry key={i} entry={e} />)}
        </Section>
      )}

      {logged.length > 0 && (
        <div>
          <button
            onClick={() => setLoggedOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 10, fontWeight: 600, letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: 'var(--color-text-3)',
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 0, marginBottom: 8,
            }}
          >
            <i className={`ti ti-chevron-${loggedOpen ? 'down' : 'right'}`} style={{ fontSize: 12 }}></i>
            Logged — routine ({logged.length})
          </button>
          {loggedOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {logged.map((e, i) => <StatusEntry key={i} entry={e} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ title, count, color, children }) {
  return (
    <div>
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        color,
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        marginBottom: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        {title}
        <span style={{ opacity: 0.5 }}>({count})</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
    </div>
  )
}
