import { useState, useEffect } from 'react'

// Domains view (personal Nexus only — wired via personal-extensions.jsx).
// One sidebar entry → a LANDING PAGE: the current "Goose" organism model
// (domains/NOW.md, agent-curated) + a card per life domain with live activity
// data. Clicking a card opens the domain browser (plans, goals, records,
// stream summaries). All local; the server is loopback-only and file reads
// are repo-scoped (see /api/file guard).
//
// `focus` (optional) is a domain id — deep-links straight into that domain.

// The original-8 person model (+ admin = infrastructure). Order is canonical.
const DOMAIN_META = {
  life:    { icon: 'ti-home',           orig: 'Life',              tag: 'Daily rhythm & environment' },
  health:  { icon: 'ti-heartbeat',      orig: 'Health',            tag: 'The body, measured' },
  love:    { icon: 'ti-heart',          orig: 'Love',              tag: 'The inner circle' },
  finance: { icon: 'ti-cash',           orig: 'Finances',          tag: 'Money, taxes, benefits' },
  legacy:  { icon: 'ti-hourglass-high', orig: 'Legacy',            tag: 'Name, catalog, estate' },
  art:     { icon: 'ti-palette',        orig: 'Art',               tag: 'Craft & practice' },
  mission: { icon: 'ti-target-arrow',   orig: 'Work/Mission',      tag: 'Career bets & direction' },
  mind:    { icon: 'ti-brain',          orig: 'Mind/Intelligence', tag: 'Learning & attention' },
  admin:   { icon: 'ti-id-badge-2',     orig: 'infrastructure',    tag: 'Identity spine & paperwork' },
}
const DOMAIN_ORDER = Object.keys(DOMAIN_META)
const CATEGORY_ORDER = ['Overview', 'Goals', 'Records']

export default function Domains({ focus }) {
  const [domains, setDomains] = useState([])
  // activeKey: null = landing page; else "<repoId>:<domainId>" opens the browser.
  const [activeKey, setActiveKey] = useState(null)
  const [now, setNow] = useState(null)        // domains/NOW.md — the curated organism brief
  const [selected, setSelected] = useState(null)
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(true)

  const resolveKey = (list, focusId) => {
    const byId = list.filter(d => d.id === focusId)
    const pick = byId.find(d => d.repoId === 'primary') || byId[0]
    return pick?.key || null
  }

  useEffect(() => {
    fetch('/api/domains').then(r => r.json()).then(d => {
      d.sort((a, b) =>
        (DOMAIN_ORDER.indexOf(a.id) + 1 || 99) - (DOMAIN_ORDER.indexOf(b.id) + 1 || 99)
        || a.label.localeCompare(b.label))
      setDomains(d)
      if (focus) setActiveKey(resolveKey(d, focus))
      setLoading(false)
    }).catch(() => setLoading(false))
    fetch('/api/file?p=' + encodeURIComponent('domains/NOW.md'))
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setNow(d.content)).catch(() => setNow(null))
  }, [])

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

  // ── Landing page ─────────────────────────────────────────────────────────
  if (!domain) {
    return (
      <div style={{ maxWidth: 1100, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto', height: '100%', paddingRight: 4 }}>
        {/* The organism brief — domains/NOW.md, curated by agents */}
        <div style={{ background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
          {now
            ? <Markdown text={now} />
            : <div style={{ fontSize: 13, color: 'var(--color-text-3)', lineHeight: 1.6 }}>
                No <code>domains/NOW.md</code> yet — the organism brief lives there
                (agent-curated: current state + important updates).
              </div>}
        </div>

        {/* One card per domain */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 10 }}>
          {domains.map(d => <DomainCard key={d.key} d={d} multiRepo={multiRepo} onOpen={() => setActiveKey(d.key)} />)}
        </div>
      </div>
    )
  }

  // ── Domain browser ───────────────────────────────────────────────────────
  const groups = {}
  for (const doc of domain?.docs || []) (groups[doc.category] ||= []).push(doc)
  const cats = Object.keys(groups).sort(
    (a, b) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99))
  const meta = DOMAIN_META[domain.id] || {}

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%', maxWidth: 1100 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={() => { setActiveKey(null); setSelected(null); setContent(null) }} style={{
            background: 'none', border: '0.5px solid var(--color-border)', borderRadius: 6,
            padding: '5px 10px', fontSize: 12, color: 'var(--color-text-3)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <i className="ti ti-arrow-left" style={{ fontSize: 13 }}></i> All domains
          </button>
          <i className={`ti ${meta.icon || 'ti-layout-grid'}`} style={{ fontSize: 17 }}></i>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{domain.label}</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{meta.tag}</span>
          {multiRepo && <span style={{ fontSize: 10, color: 'var(--color-text-3)' }}>· {domain.repoName}</span>}
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

function DomainCard({ d, multiRepo, onOpen }) {
  const meta = DOMAIN_META[d.id] || {}
  const records = (d.streams || []).reduce((n, s) => n + (s.records || 0), 0)
  const lastDates = [
    ...(d.docs || []).map(x => x.lastMod),
    ...(d.streams || []).map(x => x.lastDate),
  ].filter(Boolean).sort()
  const last = lastDates[lastDates.length - 1]
  return (
    <div onClick={onOpen} style={{
      display: 'flex', flexDirection: 'column', gap: 6, padding: '13px 15px', borderRadius: 'var(--radius-lg)',
      background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', cursor: 'pointer',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <i className={`ti ${meta.icon || 'ti-layout-grid'}`} style={{ fontSize: 18 }}></i>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{d.label}</span>
        <span style={{ fontSize: 10, color: 'var(--color-text-3)', marginLeft: 'auto' }}>{meta.orig}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{meta.tag || ''}</div>
      <div style={{ fontSize: 11, color: 'var(--color-text-3)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span>{d.docs.length} doc{d.docs.length === 1 ? '' : 's'}</span>
        {d.streams.length > 0 && (
          <span>{records > 0 ? `${records} record${records === 1 ? '' : 's'}` : `${d.streams.length} streams · no data yet`}</span>
        )}
        {last && <span>touched {last}</span>}
        {multiRepo && <span>· {d.repoName}</span>}
      </div>
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

// Minimal markdown renderer — headings, bold, inline code, bullet/number lists,
// and (added for NOW.md) simple tables. Built from React nodes only — no raw
// HTML injection, so file content can't inject markup.
function Markdown({ text }) {
  const inline = (s, keyBase) => {
    const nodes = []
    const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*)/g
    let last = 0, m, i = 0
    while ((m = re.exec(s))) {
      if (m.index > last) nodes.push(s.slice(last, m.index))
      if (m[2] != null) nodes.push(<strong key={`${keyBase}-b${i}`}>{m[2]}</strong>)
      else if (m[3] != null) nodes.push(<code key={`${keyBase}-c${i}`} style={{ fontFamily: 'monospace', fontSize: '0.9em', background: 'var(--color-surface-2)', padding: '1px 4px', borderRadius: 3 }}>{m[3]}</code>)
      else nodes.push(<em key={`${keyBase}-i${i}`}>{m[4]}</em>)
      last = m.index + m[0].length; i++
    }
    if (last < s.length) nodes.push(s.slice(last))
    return nodes
  }

  const lines = text.split('\n')
  const blocks = []
  let list = null   // { ordered, items: [] }
  let table = null  // { header: [], rows: [][] }
  const flushList = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(<Tag key={`l${blocks.length}`} style={{ margin: '6px 0', paddingLeft: 20, fontSize: 13, color: 'var(--color-text-2)', lineHeight: 1.6 }}>
      {list.items.map((it, j) => <li key={j} style={{ marginBottom: 3 }}>{inline(it, `l${blocks.length}-${j}`)}</li>)}
    </Tag>)
    list = null
  }
  const flushTable = () => {
    if (!table) return
    const cellStyle = { padding: '4px 10px', fontSize: 12, borderBottom: '0.5px solid var(--color-border)', textAlign: 'left', verticalAlign: 'top' }
    blocks.push(
      <table key={`t${blocks.length}`} style={{ borderCollapse: 'collapse', margin: '8px 0' }}>
        <thead><tr>{table.header.map((h, j) => <th key={j} style={{ ...cellStyle, color: 'var(--color-text-3)', fontWeight: 600 }}>{inline(h, `th${j}`)}</th>)}</tr></thead>
        <tbody>{table.rows.map((row, ri) => (
          <tr key={ri}>{row.map((c, j) => <td key={j} style={{ ...cellStyle, color: 'var(--color-text-2)' }}>{inline(c, `td${ri}-${j}`)}</td>)}</tr>
        ))}</tbody>
      </table>)
    table = null
  }
  const flush = () => { flushList(); flushTable() }

  lines.forEach((raw, idx) => {
    const line = raw.replace(/\s+$/, '')
    const h = line.match(/^(#{1,4})\s+(.+)/)
    const bullet = line.match(/^\s*[-*]\s+(.+)/)
    const num = line.match(/^\s*\d+\.\s+(.+)/)
    const tableRow = line.match(/^\s*\|(.+)\|\s*$/)
    if (tableRow) {
      flushList()
      const cells = tableRow[1].split('|').map(c => c.trim())
      if (cells.every(c => /^:?-{2,}:?$/.test(c))) return   // separator row
      if (!table) table = { header: cells, rows: [] }
      else table.rows.push(cells)
    } else if (h) {
      flush()
      const lvl = h[1].length
      blocks.push(<div key={idx} style={{ fontSize: lvl <= 1 ? 16 : lvl === 2 ? 14 : 13, fontWeight: 600, color: 'var(--color-text)', margin: lvl <= 2 ? '14px 0 6px' : '10px 0 4px' }}>{inline(h[2], `h${idx}`)}</div>)
    } else if (bullet || num) {
      flushTable()
      const ordered = !!num
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] } }
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
