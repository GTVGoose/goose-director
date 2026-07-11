import { useState, useEffect } from 'react'
import { StatusBadge } from './Dashboard.jsx'

const DOC_TYPE_ICONS = {
  'Agent Charter': 'ti-user',
  'Governance / Source of Truth': 'ti-shield',
  'Registry Entry': 'ti-list-details',
  'Archive': 'ti-archive',
  'Codex Workflow': 'ti-terminal',
  'Test / Checklist': 'ti-checklist',
  'Mythology': 'ti-sparkles',
  'Lexicon': 'ti-book',
  'Document': 'ti-file-text',
}

export default function Knowledge() {
  const [docs, setDocs] = useState([])
  const [threads, setThreads] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterRepo, setFilterRepo] = useState('all')
  const [view, setView] = useState('docs') // 'docs' | 'threads'
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/knowledge').then(r => r.json()),
      fetch('/api/threads').then(r => r.json()),
    ]).then(([d, t]) => {
      setDocs(d)
      setThreads(t)
      setLoading(false)
    })
  }, [])

  const docTypes = ['all', ...new Set(docs.map(d => d.docType).filter(Boolean))]
  const statuses = ['all', ...new Set(docs.map(d => d.canonStatus).filter(Boolean))]
  const repos = ['all', ...new Set(docs.map(d => d.repoName).filter(Boolean))]

  const filtered = docs.filter(d => {
    const q = search.toLowerCase()
    const matchSearch = !q
      || d.title?.toLowerCase().includes(q)
      || d.excerpt?.toLowerCase().includes(q)
      || d.docType?.toLowerCase().includes(q)
      || d.canonStatus?.toLowerCase().includes(q)
      || d.repoName?.toLowerCase().includes(q)
    const matchType = filterType === 'all' || d.docType === filterType
    const matchStatus = filterStatus === 'all' || d.canonStatus === filterStatus
    const matchRepo = filterRepo === 'all' || d.repoName === filterRepo
    return matchSearch && matchType && matchStatus && matchRepo
  })

  const deleteThread = async (id) => {
    await fetch(`/api/threads/${id}`, { method: 'DELETE' })
    setThreads(threads.filter(t => t.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%', maxWidth: 1100 }}>
      {/* Left: list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>

        {/* Tab + search */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <TabBtn active={view === 'docs'} onClick={() => setView('docs')}>
            <i className="ti ti-files" style={{ fontSize: 14 }}></i> Documents ({docs.length})
          </TabBtn>
          <TabBtn active={view === 'threads'} onClick={() => setView('threads')}>
            <i className="ti ti-bookmark" style={{ fontSize: 14 }}></i> Saved threads ({threads.length})
          </TabBtn>
          <div style={{ flex: 1 }} />
          {view === 'docs' && (
            <input
              placeholder="Search docs…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '0.5px solid var(--color-border-strong)', background: 'var(--color-surface)', color: 'var(--color-text)', width: 200 }}
            />
          )}
        </div>

        {view === 'docs' && (
          <div style={{ display: 'flex', gap: 6 }}>
            <FilterSelect label="Type" value={filterType} onChange={setFilterType} options={docTypes} />
            <FilterSelect label="Status" value={filterStatus} onChange={setFilterStatus} options={statuses} />
            {repos.length > 2 && <FilterSelect label="Repo" value={filterRepo} onChange={setFilterRepo} options={repos} />}
            <span style={{ fontSize: 12, color: 'var(--color-text-3)', alignSelf: 'center', marginLeft: 4 }}>
              {filtered.length} of {docs.length}
            </span>
          </div>
        )}

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {loading && <div style={{ fontSize: 13, color: 'var(--color-text-3)', padding: 8 }}>Indexing documents…</div>}

          {view === 'docs' && filtered.map((doc, i) => (
            <DocRow
              key={`${doc.repoId || 'primary'}:${doc.path}:${i}`}
              doc={doc}
              showRepo={repos.length > 2}
              selected={selected?.path === doc.path && selected?.repoId === doc.repoId}
              onClick={() => setSelected(doc)}
            />
          ))}

          {view === 'docs' && !loading && filtered.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--color-text-3)', padding: 8 }}>
              {docs.length === 0
                ? 'No documents indexed yet. Nexus indexes every .md file in the connected vault — check Settings → Vault connection if this looks wrong.'
                : 'No results for this search.'}
            </div>
          )}

          {view === 'threads' && threads.map((t, i) => (
            <ThreadRow
              key={i}
              thread={t}
              selected={selected?.id === t.id}
              onClick={() => setSelected(t)}
              onDelete={() => deleteThread(t.id)}
            />
          ))}

          {view === 'threads' && !loading && threads.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--color-text-3)', padding: 8 }}>
              No saved threads yet. Use the Invoke panel and click "Save thread" to store a session here.
            </div>
          )}
        </div>
      </div>

      {/* Right: detail pane */}
      {selected && (
        <div style={{
          width: 360, flexShrink: 0,
          background: 'var(--color-surface)',
          border: '0.5px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '10px 14px',
            borderBottom: '0.5px solid var(--color-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.title}
            </span>
            <button onClick={() => setSelected(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', fontSize: 16, marginLeft: 8 }}>
              <i className="ti ti-x"></i>
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
            {selected.path && (
              <MetaRow label="Path" value={selected.path} mono />
            )}
            {selected.docType && <MetaRow label="Type" value={selected.docType} />}
            {selected.canonStatus && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-3)', display: 'block', marginBottom: 3 }}>Canon status</span>
                <StatusBadge status={selected.canonStatus} />
              </div>
            )}
            {selected.canonBoundary && <MetaRow label="Canon boundary" value={selected.canonBoundary} />}
            {selected.agentType && <MetaRow label="Agent type" value={selected.agentType} />}
            {selected.posture && <MetaRow label="Posture" value={selected.posture} />}
            {selected.lastMod && <MetaRow label="Last modified" value={selected.lastMod} />}
            {selected.tags?.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-3)', display: 'block', marginBottom: 4 }}>Tags</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {selected.tags.map(t => (
                    <span key={t} style={{ fontSize: 11, padding: '2px 7px', background: 'var(--color-border)', borderRadius: 4, color: 'var(--color-text-2)' }}>{t}</span>
                  ))}
                </div>
              </div>
            )}
            {selected.excerpt && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius)' }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 4 }}>Excerpt</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.6 }}>
                  {selected.excerpt}
                </div>
              </div>
            )}
            {selected.content && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 4 }}>Thread content</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {selected.content}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DocRow({ doc, selected, onClick, showRepo }) {
  const icon = DOC_TYPE_ICONS[doc.docType] || 'ti-file-text'
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
        background: selected ? 'var(--color-border)' : 'var(--color-surface)',
        border: `0.5px solid ${selected ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
      }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: 15, color: 'var(--color-text-3)', marginTop: 2, flexShrink: 0 }}></i>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {doc.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{doc.docType}</span>
          {doc.canonStatus && (
            <>
              <span style={{ fontSize: 11, color: 'var(--color-border-strong)' }}>·</span>
              <StatusBadge status={doc.canonStatus} />
            </>
          )}
          {showRepo && doc.repoName && (
            <span style={{ fontSize: 10, padding: '0px 5px', borderRadius: 4, background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border)', color: 'var(--color-text-3)', marginLeft: 'auto' }}>{doc.repoName}</span>
          )}
          <span style={{ fontSize: 11, color: 'var(--color-text-3)', marginLeft: showRepo && doc.repoName ? 6 : 'auto' }}>{doc.lastMod}</span>
        </div>
        {doc.excerpt && (
          <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {doc.excerpt}
          </div>
        )}
      </div>
    </div>
  )
}

function ThreadRow({ thread, selected, onClick, onDelete }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
        background: selected ? 'var(--color-border)' : 'var(--color-surface)',
        border: `0.5px solid ${selected ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
      }}
    >
      <i className="ti ti-bookmark" style={{ fontSize: 15, color: 'var(--color-text-3)', flexShrink: 0 }}></i>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{thread.title}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 1 }}>{thread.date}</div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', fontSize: 14, padding: 2 }}
      >
        <i className="ti ti-trash" style={{ fontSize: 13 }}></i>
      </button>
    </div>
  )
}

function MetaRow({ label, value, mono }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--color-text-3)', display: 'block', marginBottom: 2 }}>{label}</span>
      <span style={{ fontSize: mono ? 11 : 13, color: 'var(--color-text-2)', fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--color-surface)' : 'none',
        border: active ? '0.5px solid var(--color-border-strong)' : '0.5px solid transparent',
        borderRadius: 6, padding: '5px 10px',
        fontSize: 12, color: active ? 'var(--color-text)' : 'var(--color-text-3)',
        fontWeight: active ? 500 : 400,
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
      }}
    >{children}</button>
  )
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ fontSize: 12, padding: '4px 8px', borderRadius: 5, border: '0.5px solid var(--color-border-strong)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
    >
      {options.map(o => (
        <option key={o} value={o}>{o === 'all' ? `All ${label.toLowerCase()}s` : o}</option>
      ))}
    </select>
  )
}
