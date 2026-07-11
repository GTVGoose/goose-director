import { useState, useEffect, useCallback } from 'react'
import { api, uuid, sendObservation, queueObservation, outboxCount, flushOutbox } from './api.js'

// Mobile Domains: the 8-layer organism, read + quick-append. The killer flow
// is capture: pick a domain chip, type (or dictate via the Chat mic → paste),
// ALWAYS preview, confirm → appended to the domain's observations.ndjson on
// the Mac. Offline or Mac-asleep, the observation queues in the outbox and
// flushes later — the UUID makes retries idempotent server-side.

const DOMAIN_ICONS = {
  life: 'ti-home', health: 'ti-heartbeat', love: 'ti-heart', finance: 'ti-cash',
  legacy: 'ti-hourglass-high', art: 'ti-palette', mission: 'ti-target-arrow',
  mind: 'ti-brain', admin: 'ti-id-badge-2',
}
const DOMAIN_ORDER = ['life', 'health', 'love', 'finance', 'legacy', 'art', 'mission', 'mind', 'admin']

export default function Domains({ onQueuedChange }) {
  const [domains, setDomains] = useState([])
  const [active, setActive] = useState(null)    // domain object
  const [doc, setDoc] = useState(null)          // {title, content}
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState(null)  // observation awaiting confirm
  const [flash, setFlash] = useState('')
  const [queued, setQueued] = useState(outboxCount())

  const syncQueued = useCallback((n) => { setQueued(n); onQueuedChange?.(n) }, [onQueuedChange])

  useEffect(() => {
    api('/api/domains').then(d => {
      d.sort((a, b) => (DOMAIN_ORDER.indexOf(a.id) + 1 || 99) - (DOMAIN_ORDER.indexOf(b.id) + 1 || 99) || a.label.localeCompare(b.label))
      setDomains(d)
    }).catch(() => {})
  }, [])

  const openDoc = async (d) => {
    try {
      const r = await api(`/api/file?path=${encodeURIComponent(d.path)}&repo=${encodeURIComponent(d.repoId)}`)
      setDoc({ title: d.title, content: r.content })
    } catch (e) { setFlash(`Couldn't load: ${e.message}`) }
  }

  const stage = () => {
    if (!note.trim() || !active) return
    setPreview({
      id: uuid(),
      domain: active.id,
      repoId: active.repoId,
      note: note.trim(),
      type: 'note',
      source: 'mini-nexus',
    })
  }

  const confirm = async () => {
    const obs = preview
    setPreview(null)
    setNote('')
    try {
      await sendObservation(obs)
      setFlash(`Saved to ${obs.domain} ✓`)
      syncQueued(await flushOutbox())
    } catch {
      queueObservation(obs)
      syncQueued(outboxCount())
      setFlash(`Mac unreachable — queued for sync (${outboxCount()} waiting)`)
    }
    setTimeout(() => setFlash(''), 4000)
  }

  if (doc) return (
    <div>
      <div className="mnx-chiprow" style={{ paddingTop: 12 }}>
        <button className="mnx-chip" onClick={() => setDoc(null)}><i className="ti ti-arrow-left" /> back</button>
        <span className="mnx-chip active">{doc.title}</span>
      </div>
      <div className="mnx-reader">{doc.content}</div>
    </div>
  )

  if (active) {
    const dom = domains.find(x => x.key === active.key) || active
    return (
      <div>
        <div className="mnx-chiprow" style={{ paddingTop: 12 }}>
          <button className="mnx-chip" onClick={() => { setActive(null); setPreview(null) }}><i className="ti ti-arrow-left" /> domains</button>
          <span className="mnx-chip active"><i className={`ti ${DOMAIN_ICONS[dom.id] || 'ti-circle'}`} /> {dom.label}</span>
        </div>

        {/* quick capture */}
        <div className="mnx-composer" style={{ borderTop: 'none', background: 'none' }}>
          <textarea
            rows={2}
            placeholder={`Log something to ${dom.label}…`}
            value={note}
            onChange={e => setNote(e.target.value)}
          />
          <button className="mnx-icon-btn primary" disabled={!note.trim()} onClick={stage}>
            <i className="ti ti-plus" />
          </button>
        </div>

        {preview && (
          <div className="mnx-preview">
            <div className="k">Confirm → {preview.domain} / observations.ndjson</div>
            <div className="v">{preview.note}</div>
            <div className="mnx-btnrow">
              <button className="mnx-btn" onClick={() => setPreview(null)}>Cancel</button>
              <button className="mnx-btn primary" onClick={confirm}>Append</button>
            </div>
          </div>
        )}
        {flash && <div className="mnx-outbox-note">{flash}</div>}

        {/* streams + docs */}
        {dom.streams?.length > 0 && (
          <div className="mnx-chiprow">
            {dom.streams.map(s => (
              <span key={s.path} className="mnx-chip">{s.name} · {s.records} rec{s.lastDate ? ` · ${s.lastDate}` : ''}</span>
            ))}
          </div>
        )}
        {(dom.docs || []).map(d => (
          <div key={d.path} className="mnx-doc" onClick={() => openDoc(d)}>
            <div className="t">{d.title}</div>
            <div className="m">{d.category} · {d.lastMod}</div>
          </div>
        ))}
        {(!dom.docs || dom.docs.length === 0) && <div className="mnx-empty">No docs in this domain yet.</div>}
      </div>
    )
  }

  return (
    <div className="mnx-cards">
      {queued > 0 && <div className="mnx-outbox-note">{queued} update{queued === 1 ? '' : 's'} queued — will sync when the Mac answers.</div>}
      {domains.length === 0 && <div className="mnx-empty">No domains found — is the Mac reachable?</div>}
      {domains.map(d => (
        <div key={d.key} className="mnx-card" onClick={() => setActive(d)}>
          <div className="head">
            <i className={`ti ${DOMAIN_ICONS[d.id] || 'ti-circle'}`} />
            <span className="name">{d.label}</span>
          </div>
          <div className="detail">
            {d.docs.length} doc{d.docs.length === 1 ? '' : 's'}
            {d.streams.length > 0 && ` · ${d.streams.length} stream${d.streams.length === 1 ? '' : 's'}`}
            {d.repoName ? ` · ${d.repoName}` : ''}
          </div>
        </div>
      ))}
    </div>
  )
}
