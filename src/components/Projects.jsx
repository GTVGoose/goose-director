import { useState, useEffect } from 'react'

// GU8.3: the Projects surface (audit "Projects as a first-class object" — the
// durable context boundary). Flag-gated behind ui.projects (default off). Pure
// READ UI over the Phase-6 /api/projects endpoints; create is a light form.

const ROUTING = ['auto', 'fast', 'best', 'private', 'low-cost']

export default function Projects() {
  const [projects, setProjects] = useState(null)
  const [selected, setSelected] = useState(null)
  const [items, setItems] = useState(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', instructions: '', routing: 'auto' })
  const [err, setErr] = useState(null)

  const load = () => fetch('/api/projects').then(r => r.json()).then(d => setProjects(d.projects || [])).catch(e => setErr(e.message))
  // NOTE: wrap in a block so the effect returns undefined, not the fetch promise
  // (React would call a returned promise as the cleanup fn → crash on unmount).
  useEffect(() => { load() }, [])

  const open = (id) => {
    fetch(`/api/projects/${id}`).then(r => r.json()).then(setSelected).catch(e => setErr(e.message))
    fetch(`/api/projects/${id}/items`).then(r => r.json()).then(setItems).catch(() => setItems(null))
  }
  const create = () => {
    if (!form.name.trim()) return
    fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      .then(r => r.json()).then(() => { setCreating(false); setForm({ name: '', instructions: '', routing: 'auto' }); load() }).catch(e => setErr(e.message))
  }

  const card = { background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 12 }
  const input = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border-mid)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', fontSize: 12, color: 'var(--color-text)', width: '100%' }

  if (err) return <div style={{ padding: 20, color: 'var(--color-unavailable)' }}>Projects error: {err}</div>
  if (projects === null) return <div style={{ padding: 20, color: 'var(--color-text-3)' }}>Loading projects…</div>

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%' }}>
      <div style={{ width: 300, flexShrink: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Projects <span style={{ color: 'var(--color-text-3)', fontWeight: 400 }}>· {projects.length}</span></span>
          <div style={{ flex: 1 }} />
          <button onClick={() => setCreating(v => !v)} style={{ fontSize: 11, cursor: 'pointer', background: 'transparent', border: '0.5px solid var(--color-border-mid)', borderRadius: 'var(--radius-sm)', padding: '3px 9px', color: 'var(--color-text-2)' }}>{creating ? 'Cancel' : '+ New'}</button>
        </div>
        {creating && (
          <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <input style={input} placeholder="Project name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <textarea style={{ ...input, minHeight: 48, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Instructions (optional)" value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} />
            <select style={input} value={form.routing} onChange={e => setForm({ ...form, routing: e.target.value })}>
              {ROUTING.map(r => <option key={r} value={r}>routing: {r}</option>)}
            </select>
            <button onClick={create} style={{ fontSize: 12, cursor: 'pointer', background: 'var(--color-surface)', border: '0.5px solid var(--color-border-strong)', borderRadius: 'var(--radius-sm)', padding: '6px', color: 'var(--color-text)' }}>Create project</button>
          </div>
        )}
        {projects.length === 0 && !creating && <div style={{ ...card, color: 'var(--color-text-3)', fontSize: 12 }}>No projects yet. A project scopes runs, memory, and artifacts together.</div>}
        {projects.map(p => (
          <button key={p.id} onClick={() => open(p.id)} style={{ ...card, textAlign: 'left', cursor: 'pointer', borderColor: selected?.id === p.id ? 'var(--color-border-strong)' : 'var(--color-border)' }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 2 }}>routing: {p.routing} · {p.sourceCount} source{p.sourceCount !== 1 ? 's' : ''}{p.providerRestrictions?.length ? ` · restricts ${p.providerRestrictions.join(', ')}` : ''}</div>
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        {!selected && <div style={{ padding: 20, color: 'var(--color-text-3)' }}>Select a project to view its instructions, routing, and scoped runs + artifacts.</div>}
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{selected.name}</div>
            <div style={{ ...card, fontSize: 11, color: 'var(--color-text-3)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span>routing: <strong style={{ color: 'var(--color-text-2)' }}>{selected.routing}</strong></span>
              {selected.providerRestrictions?.length > 0 && <span>restricts: {selected.providerRestrictions.join(', ')}</span>}
              <span>{selected.sources?.length || 0} source(s)</span>
            </div>
            {selected.instructions && <div style={{ ...card, fontSize: 12, whiteSpace: 'pre-wrap' }}>{selected.instructions}</div>}
            <div style={{ fontSize: 12, fontWeight: 600 }}>Scoped work</div>
            {items === null && <div style={{ color: 'var(--color-text-3)', fontSize: 12 }}>—</div>}
            {items && (
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 5 }}>Runs · {items.runs?.length || 0}</div>
                  {(items.runs || []).map(r => <div key={r.id} style={{ ...card, marginBottom: 5, fontSize: 11 }}>{r.mode} · {r.task}</div>)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 5 }}>Artifacts · {items.artifacts?.length || 0}</div>
                  {(items.artifacts || []).map(a => <div key={a.id} style={{ ...card, marginBottom: 5, fontSize: 11 }}>{a.title} · {a.state} · v{a.currentVersion}</div>)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
