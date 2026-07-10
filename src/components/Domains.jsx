import { useState, useEffect } from 'react'

// Domains view (personal Nexus only — wired via personal-extensions.jsx).
// Two levels:
//   1. LANDING — "the Goose model": one card per life domain (original-8 order)
//      with plan progress, data freshness, and next action, plus a recent-updates
//      strip. Everything is computed client-side from /api/domains + each
//      domain's PLAN.md, so no server changes are needed.
//   2. DETAIL — the doc browser for one domain (plans, goals, records, streams).
// All local; the server is loopback-only and file reads are repo-scoped.

const DOMAIN_ICONS = {
  life: 'ti-home', health: 'ti-heartbeat', love: 'ti-heart', finance: 'ti-cash',
  legacy: 'ti-hourglass-high', art: 'ti-palette', mission: 'ti-target-arrow',
  mind: 'ti-brain', admin: 'ti-id-badge-2',
}
// Tab order mirrors the original-8 person model (admin = infrastructure, last).
const DOMAIN_ORDER = ['life', 'health', 'love', 'finance', 'legacy', 'art', 'mission', 'mind', 'admin']
const ORIGINAL8 = {
  life: 'Life', health: 'Health', love: 'Love', finance: 'Finances', legacy: 'Legacy',
  art: 'Art', mission: 'Work/Mission', mind: 'Mind/Intelligence', admin: 'Infrastructure',
}
const CATEGORY_ORDER = ['Overview', 'Goals', 'Records']

// Strip markdown noise from a plan line so it reads as a plain next-action.
const cleanLine = (s) => s
  .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim()

export default function Domains({ focus, landing = !focus }) {
  const [domains, setDomains] = useState([])
  // activeKey is a per-repo domain key ("<repoId>:<domainId>") since the same
  // domain name (e.g. "health") can exist in more than one connected repo.
  const [activeKey, setActiveKey] = useState(null)
  const [selected, setSelected] = useState(null)
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [plans, setPlans] = useState({})   // key → {done, total, next}

  // Resolve the sidebar `focus` (a domain id like "health") to a domain key,
  // preferring the primary repo's copy, else the first match, else first domain.
  const resolveKey = (list, focusId) => {
    const byId = list.filter(d => d.id === focusId)
    const pick = byId.find(d => d.repoId === 'primary') || byId[0] || list[0]
    return pick?.key || null
  }

  useEffect(() => {
    fetch('/api/domains').then(r => r.json()).then(d => {
      d.sort((a, b) =>
        (DOMAIN_ORDER.indexOf(a.id) + 1 || 99) - (DOMAIN_ORDER.indexOf(b.id) + 1 || 99)
        || a.label.localeCompare(b.label))
      setDomains(d)
      if (!landing) setActiveKey(prev => (d.find(x => x.key === prev) ? prev : resolveKey(d, focus)))
      setLoading(false)

      // Enrich each domain with plan progress (checkbox counts + next unchecked).
      d.forEach(dom => {
        const plan = dom.docs.find(doc => /\/PLAN\.md$/.test(doc.path))
        if (!plan) return
        const repoParam = plan.repoId ? `&repo=${encodeURIComponent(plan.repoId)}` : ''
        fetch(`/api/file?p=${encodeURIComponent(plan.path)}${repoParam}`)
          .then(r => r.ok ? r.json() : Promise.reject())
          .then(({ content }) => {
            const boxes = content.match(/^\s*- \[( |x)\]/gm) || []
            const done = boxes.filter(b => b.includes('[x]')).length
            const nextM = content.match(/^\s*- \[ \] (.+)$/m)
            setPlans(p => ({ ...p, [dom.key]: {
              done, total: boxes.length,
              next: nextM ? cleanLine(nextM[1]) : null,
            } }))
          }).catch(() => {})
      })
    }).catch(() => setLoading(false))
  }, [])

  // Re-focus if the sidebar entry changes while mounted.
  useEffect(() => { if (focus && domains.length) setActiveKey(resolveKey(domains, focus)) }, [focus])

  const domain = domains.find(d => d.key === activeKey)
  const multiRepo = new Set(domains.map(d => d.repoId)).size > 1

  const openDoc = (doc) => {
    setSelected(doc)
    setContent(null)
    const repoParam = doc.repoId ? `&repo=${encodeURIComponent(doc.repoId)}` : ''
    fetch(`/api/file?p=${encodeURIComponent(doc.path)}${repoParam}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setContent(d.content))
      .catch(() => setContent('_Could not load this file._'))
  }

  if (loading) {
    return <div style={{ fontSize: 13, color: 'var(--color-text-3)', padding: 8 }}>Loading domains…</div>
  }
  if (domains.length === 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--color-text-3)', padding: 8, maxWidth: 560, lineHeight: 1.6 }}>
        No domains found. Nexus looks for a <code>domains/</code> folder in any connected repo
        (Settings → Vault connection / Additional repos). Drop a domain folder in there — each subfolder shows up here.
      </div>
    )
  }

  // ── LANDING: the Goose model ─────────────────────────────────────────────
  if (landing && !activeKey) {
    const now = Date.now()
    const recent = []
    for (const d of domains) {
      for (const doc of d.docs) {
        if (/template/i.test(doc.path)) continue
        if (now - new Date(doc.lastMod).getTime() < 7 * 864e5) {
          recent.push({ label: d.label, title: doc.title, date: doc.lastMod, key: d.key })
        }
      }
      for (const s of d.streams) {
        if (s.lastDate && now - new Date(s.lastDate).getTime() < 7 * 864e5) {
          recent.push({ label: d.label, title: `${s.name} +${s.records}`, date: s.lastDate, key: d.key })
        }
      }
    }
    recent.sort((a, b) => b.date.localeCompare(a.date))

    return (
      <div style={{ maxWidth: 1100 }}>
        <div style={{ marginBottom: 4, fontSize: 15, fontWeight: 600 }}>The Goose Model</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 14 }}>
          One organism, eight domains (+ infrastructure). Plans are canon; the data never leaves this machine.
        </div>

        {recent.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {recent.slice(0, 6).map((r, i) => (
              <button key={i} onClick={() => setActiveKey(r.key)} style={{
                fontSize: 11, color: 'var(--color-text-2)', background: 'var(--color-surface)',
                border: '0.5px solid var(--color-border)', borderRadius: 20, padding: '4px 10px', cursor: 'pointer',
              }}>
                <span style={{ fontWeight: 600 }}>{r.label}</span> · {r.title} · {r.date.slice(5)}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
          {domains.map(d => {
            const p = plans[d.key]
            const records = d.streams.reduce((n, s) => n + s.records, 0)
            const lastData = d.streams.map(s => s.lastDate).filter(Boolean).sort().pop()
            return (
              <div key={d.key} onClick={() => { setActiveKey(d.key); setSelected(null); setContent(null) }} style={{
                background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)', padding: '14px 16px', cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
                  <i className={`ti ${DOMAIN_ICONS[d.id] || 'ti-layout-grid'}`} style={{ fontSize: 17 }}></i>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{d.label}</span>
                  <span style={{ fontSize: 10, color: 'var(--color-text-3)', marginLeft: 'auto' }}>{ORIGINAL8[d.id] || ''}</span>
                </div>
                {p && p.total > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                    <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'var(--color-border)' }}>
                      <div style={{ width: `${Math.round(100 * p.done / p.total)}%`, height: 3, borderRadius: 2, background: 'var(--color-text-3)' }} />
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--color-text-3)' }}>{p.done}/{p.total}</span>
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: p?.next ? 6 : 0 }}>
                  {records > 0 ? `${records} record${records === 1 ? '' : 's'}${lastData ? ` · last ${lastData.slice(5)}` : ''}` : 'no data yet'}
                  {multiRepo ? ` · ${d.repoName}` : ''}
                </div>
                {p?.next && (
                  <div style={{ fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.45 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--color-text-3)', textTransform: 'uppercase', marginRight: 6 }}>next</span>
                    {p.next.length > 90 ? p.next.slice(0, 90) + '…' : p.next}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── DETAIL: one domain's docs + streams ──────────────────────────────────
  // Group docs by category in a stable order.
  const groups = {}
  for (const doc of domain?.docs || []) (groups[doc.category] ||= []).push(doc)
  const cats = Object.keys(groups).sort(
    (a, b) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99))

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%', maxWidth: 1100 }}>
      {/* Left: domain switcher + doc list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {landing && (
            <button onClick={() => { setActiveKey(null); setSelected(null); setContent(null) }} style={{
              background: 'none', border: '0.5px solid var(--color-border)', borderRadius: 6,
              padding: '5px 10px', fontSize: 12, color: 'var(--color-text-3)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <i className="ti ti-arrow-left" style={{ fontSize: 13 }}></i> Model
            </button>
          )}
          {domains.map(d => (
            <TabBtn key={d.key} active={d.key === activeKey} onClick={() => { setActiveKey(d.key); setSelected(null); setContent(null) }}>
              <i className={`ti ${DOMAIN_ICONS[d.id] || 'ti-layout-grid'}`} style={{ fontSize: 14 }}></i> {d.label}
              {multiRepo && <span style={{ fontSize: 10, color: 'var(--color-text-3)', marginLeft: 4 }}>· {d.repoName}</span>}
            </TabBtn>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cats.map(cat => (
            <div key={cat}>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-3)', padding: '4px 2px' }}>{cat}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {groups[cat].map(doc => (
                  <DocRow key={doc.path} doc={doc} selected={selected?.path === doc.path} onClick={() => openDoc(doc)} />
                ))}
              </div>
            </div>
          ))}

          {/* Data streams — private observation feeds, summarized not dumped */}
          {domain?.streams?.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-3)', padding: '4px 2px' }}>Data streams</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {domain.streams.map(s => (
                  <div key={s.path} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, background: 'var(--color-surface)', border: '0.5px solid var(--color-border)' }}>
                    <i className="ti ti-activity" style={{ fontSize: 15, color: 'var(--color-text-3)', flexShrink: 0 }}></i>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 1 }}>
                        {s.records} record{s.records === 1 ? '' : 's'}{s.lastDate ? ` · last ${s.lastDate}` : ' · empty'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: document viewer */}
      {selected && (
        <div style={{ width: 420, flexShrink: 0, background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.title}</span>
            <button onClick={() => { setSelected(null); setContent(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', fontSize: 16, marginLeft: 8 }}>
              <i className="ti ti-x"></i>
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-3)', fontFamily: 'monospace', marginBottom: 10, wordBreak: 'break-all' }}>{selected.path}</div>
            {content === null
              ? <div style={{ fontSize: 13, color: 'var(--color-text-3)' }}>Loading…</div>
              : <Markdown text={content} />}
          </div>
        </div>
      )}
    </div>
  )
}

function DocRow({ doc, selected, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
      background: selected ? 'var(--color-border)' : 'var(--color-surface)',
      border: `0.5px solid ${selected ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
    }}>
      <i className="ti ti-file-text" style={{ fontSize: 15, color: 'var(--color-text-3)', flexShrink: 0 }}></i>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</div>
      </div>
      <span style={{ fontSize: 11, color: 'var(--color-text-3)', flexShrink: 0 }}>{doc.lastMod}</span>
    </div>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: active ? 'var(--color-surface)' : 'none',
      border: active ? '0.5px solid var(--color-border-strong)' : '0.5px solid transparent',
      borderRadius: 6, padding: '5px 10px', fontSize: 12,
      color: active ? 'var(--color-text)' : 'var(--color-text-3)', fontWeight: active ? 500 : 400,
      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
    }}>{children}</button>
  )
}

// Minimal markdown renderer — headings, bold, inline code, and bullet/number
// lists are enough for plans and goal docs. No external dependency (the app
// ships none) and no raw HTML injection: everything is built from React nodes,
// so file content can't inject markup.
function Markdown({ text }) {
  const inline = (s, keyBase) => {
    const nodes = []
    const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g
    let last = 0, m, i = 0
    while ((m = re.exec(s))) {
      if (m.index > last) nodes.push(s.slice(last, m.index))
      if (m[2] != null) nodes.push(<strong key={`${keyBase}-b${i}`}>{m[2]}</strong>)
      else nodes.push(<code key={`${keyBase}-c${i}`} style={{ fontFamily: 'monospace', fontSize: '0.9em', background: 'var(--color-surface-2)', padding: '1px 4px', borderRadius: 3 }}>{m[3]}</code>)
      last = m.index + m[0].length; i++
    }
    if (last < s.length) nodes.push(s.slice(last))
    return nodes
  }

  const lines = text.split('\n')
  const blocks = []
  let list = null // { ordered, items: [] }
  const flush = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(<Tag key={`l${blocks.length}`} style={{ margin: '6px 0', paddingLeft: 20, fontSize: 13, color: 'var(--color-text-2)', lineHeight: 1.6 }}>
      {list.items.map((it, j) => <li key={j} style={{ marginBottom: 3 }}>{inline(it, `l${blocks.length}-${j}`)}</li>)}
    </Tag>)
    list = null
  }

  lines.forEach((raw, idx) => {
    const line = raw.replace(/\s+$/, '')
    const h = line.match(/^(#{1,4})\s+(.+)/)
    const bullet = line.match(/^\s*[-*]\s+(.+)/)
    const num = line.match(/^\s*\d+\.\s+(.+)/)
    if (h) {
      flush()
      const lvl = h[1].length
      blocks.push(<div key={idx} style={{ fontSize: lvl <= 1 ? 16 : lvl === 2 ? 14 : 13, fontWeight: 600, color: 'var(--color-text)', margin: lvl <= 2 ? '14px 0 6px' : '10px 0 4px' }}>{inline(h[2], `h${idx}`)}</div>)
    } else if (bullet || num) {
      const ordered = !!num
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] } }
      list.items.push((bullet || num)[1])
    } else if (line.trim() === '') {
      flush()
    } else {
      flush()
      blocks.push(<p key={idx} style={{ fontSize: 13, color: 'var(--color-text-2)', lineHeight: 1.7, margin: '6px 0' }}>{inline(line, `p${idx}`)}</p>)
    }
  })
  flush()
  return <div>{blocks}</div>
}
