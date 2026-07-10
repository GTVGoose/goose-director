import { useState, useEffect } from 'react'

// Domains view (personal Nexus only — wired via personal-extensions.jsx).
// Read-only window onto the life/work domains under <repo>/domains: plans,
// goals, records, and a summary of the private data streams. All local; the
// server is loopback-only and file reads are repo-scoped (see /api/file guard).
//
// `focus` is a domain id (e.g. 'health'); the view opens on it but lets you
// switch between any discovered domain.

const DOMAIN_ICONS = {
  life: 'ti-home', health: 'ti-heartbeat', love: 'ti-heart', finance: 'ti-cash',
  legacy: 'ti-hourglass-high', art: 'ti-palette', mission: 'ti-target-arrow',
  mind: 'ti-brain', admin: 'ti-id-badge-2',
}
// Tab order mirrors the original-8 person model (admin = infrastructure, last).
const DOMAIN_ORDER = ['life', 'health', 'love', 'finance', 'legacy', 'art', 'mission', 'mind', 'admin']
const CATEGORY_ORDER = ['Overview', 'Goals', 'Records']

export default function Domains({ focus }) {
  const [domains, setDomains] = useState([])
  // activeKey is a per-repo domain key ("<repoId>:<domainId>") since the same
  // domain name (e.g. "health") can exist in more than one connected repo.
  const [activeKey, setActiveKey] = useState(null)
  const [selected, setSelected] = useState(null)
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(true)

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
      setActiveKey(prev => (d.find(x => x.key === prev) ? prev : resolveKey(d, focus)))
      setLoading(false)
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
