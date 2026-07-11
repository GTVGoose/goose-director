import { useState, useEffect, useCallback } from 'react'
import { api } from './api.js'

// Status feed — the same stream the phone gets via Telegram notify(), read
// from the brain's event log, newest first.

const KIND_ICONS = { notify: 'ti-bell', 'chat-job': 'ti-message-circle', observation: 'ti-notes' }

const ago = (ts) => {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function Status() {
  const [events, setEvents] = useState(null)

  const load = useCallback(() => {
    api('/api/events?n=100').then(setEvents).catch(() => setEvents([]))
  }, [])

  useEffect(() => {
    load()
    const onVis = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [load])

  if (events === null) return <div className="mnx-empty">Loading…</div>
  if (events.length === 0) return <div className="mnx-empty">No events yet — loop milestones, chat jobs, and domain updates land here.</div>

  return (
    <div className="mnx-events">
      {events.map((e, i) => (
        <div key={i} className="mnx-event">
          <i className={`ti ${KIND_ICONS[e.kind] || 'ti-point'}`} />
          <div>
            <div className="txt">{e.text}</div>
            <div className="when">{ago(e.ts)}{e.audience === 'all' ? ' · also sent to Boris' : ''}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
