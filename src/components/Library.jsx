import { useState, useEffect } from 'react'

// GU8.1: the Library / Artifacts surface (audit Finding 3 — the durable output
// object). Flag-gated behind ui.library (default off), so the shipped nav is
// byte-identical until David flips it. Pure READ UI over the /api/artifacts
// endpoints built in Phase 6; nothing here mutates unless the user clicks a
// state/export action (those hit the existing write endpoints).

const STATE_COLORS = {
  draft: 'var(--color-text-3)',
  approved: 'var(--color-available)',
  published: 'var(--color-accent, #7c6cff)',
}

export default function Library() {
  const [artifacts, setArtifacts] = useState(null)   // null = loading
  const [selected, setSelected] = useState(null)     // full artifact record
  const [err, setErr] = useState(null)

  const load = () => {
    fetch('/api/artifacts').then(r => r.json()).then(d => setArtifacts(d.artifacts || [])).catch(e => setErr(e.message))
  }
  useEffect(load, [])

  const open = (id) => {
    fetch(`/api/artifacts/${id}`).then(r => r.json()).then(setSelected).catch(e => setErr(e.message))
  }
  const restore = (version) => {
    if (!selected) return
    fetch(`/api/artifacts/${selected.id}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version }) })
      .then(r => r.json()).then(a => { setSelected(a); load() }).catch(e => setErr(e.message))
  }

  const card = { background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 14 }
  const pill = (state) => ({ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 'var(--radius-pill)', border: `0.5px solid ${STATE_COLORS[state] || 'var(--color-border-mid)'}`, color: STATE_COLORS[state] || 'var(--color-text-3)' })

  if (err) return <div style={{ padding: 20, color: 'var(--color-unavailable)' }}>Library error: {err}</div>
  if (artifacts === null) return <div style={{ padding: 20, color: 'var(--color-text-3)' }}>Loading Library…</div>

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%' }}>
      {/* list */}
      <div style={{ width: 320, flexShrink: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Library <span style={{ color: 'var(--color-text-3)', fontWeight: 400 }}>· {artifacts.length}</span></div>
        {artifacts.length === 0 && <div style={{ ...card, color: 'var(--color-text-3)', fontSize: 12 }}>No artifacts yet. A Council run can save its result here.</div>}
        {artifacts.map(a => (
          <button key={a.id} onClick={() => open(a.id)} style={{ ...card, textAlign: 'left', cursor: 'pointer', borderColor: selected?.id === a.id ? 'var(--color-border-strong)' : 'var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{a.title}</span>
              <span style={pill(a.state)}>{a.state}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{a.type} · v{a.currentVersion} · {a.versionCount} version{a.versionCount !== 1 ? 's' : ''}</div>
          </button>
        ))}
      </div>

      {/* detail */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        {!selected && <div style={{ padding: 20, color: 'var(--color-text-3)' }}>Select an artifact to view its content, versions, and provenance.</div>}
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{selected.title}</span>
              <span style={pill(selected.state)}>{selected.state}</span>
              <div style={{ flex: 1 }} />
              <a href={`/api/artifacts/${selected.id}/export`} style={{ fontSize: 12, color: 'var(--color-text-2)', textDecoration: 'none', border: '0.5px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', padding: '5px 12px' }}>Export</a>
            </div>
            {selected.versions?.find(v => v.version === selected.currentVersion)?.provenance && (
              <div style={{ ...card, fontSize: 11, color: 'var(--color-text-3)' }}>
                <strong style={{ color: 'var(--color-text-2)' }}>Provenance</strong> · {JSON.stringify(selected.versions.find(v => v.version === selected.currentVersion).provenance)}
              </div>
            )}
            <pre style={{ ...card, whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.55, margin: 0, fontFamily: 'inherit' }}>{selected.versions?.find(v => v.version === selected.currentVersion)?.content}</pre>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Versions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...(selected.versions || [])].reverse().map(v => (
                <div key={v.version} style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px' }}>
                  <span style={{ fontSize: 12, fontWeight: v.version === selected.currentVersion ? 600 : 400 }}>v{v.version}{v.version === selected.currentVersion ? ' (current)' : ''}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-3)', flex: 1 }}>{v.createdAt?.slice(0, 19).replace('T', ' ')}{v.provenance?.restoredFrom ? ` · restored from v${v.provenance.restoredFrom}` : ''}</span>
                  {v.version !== selected.currentVersion && <button onClick={() => restore(v.version)} style={{ fontSize: 11, cursor: 'pointer', background: 'transparent', border: '0.5px solid var(--color-border-mid)', borderRadius: 'var(--radius-sm)', padding: '3px 8px', color: 'var(--color-text-2)' }}>Restore</button>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
