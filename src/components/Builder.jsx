import { useState, useEffect } from 'react'

// GU10.2: the Agentic System Builder view (audit Phase 10 — "training wheels
// that produce a working system"). Flag-gated behind ui.builder (default off).
// Renders the nine-stage checklist over /api/builder, the three entry paths,
// and a "generate starter system" action (/api/builder/generate) that creates a
// project + starter pack. Completion means PROOF per stage, not slides-viewed.

const ENTRIES = [
  { id: 'use-now', label: 'Use Nexus now', desc: 'Open ordinary chat — no system-building required.' },
  { id: 'build', label: 'Build my first system', desc: 'Follow the guided nine-stage builder.' },
  { id: 'connect', label: 'Connect an existing system', desc: 'Point Nexus at a folder and map what it finds.' },
]

export default function Builder() {
  const [data, setData] = useState(null)   // {stages, state, progress}
  const [form, setForm] = useState({ systemName: '', purpose: '', routing: 'private' })
  const [ci, setCi] = useState({ name: '', archetype: '' })
  const [generated, setGenerated] = useState(null)
  const [err, setErr] = useState(null)

  const load = () => fetch('/api/builder').then(r => r.json()).then(setData).catch(e => setErr(e.message))
  useEffect(load, [])

  const post = (body) => fetch('/api/builder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()).then(d => setData(x => ({ ...x, ...d }))).catch(e => setErr(e.message))
  const toggle = (stageId, done) => post({ stageId, done })
  const chooseEntry = (entry) => post({ entry })
  const generate = () => {
    fetch('/api/builder/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      .then(r => r.json()).then(d => { setGenerated(d); load() }).catch(e => setErr(e.message))
  }
  const saveIdentity = () => post({ creativeIdentity: { name: ci.name, archetype: ci.archetype } })

  const card = { background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 14 }
  const input = { background: 'var(--color-surface)', border: '0.5px solid var(--color-border-mid)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', fontSize: 12, color: 'var(--color-text)', width: '100%' }

  if (err) return <div style={{ padding: 20, color: 'var(--color-unavailable)' }}>Builder error: {err}</div>
  if (!data) return <div style={{ padding: 20, color: 'var(--color-text-3)' }}>Loading builder…</div>

  const { stages, state, progress } = data

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%', overflowY: 'auto' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Your first system</span>
          <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{progress.done} of {progress.total} verified</span>
          {progress.verified && <span style={{ fontSize: 11, color: 'var(--color-available)' }}>✓ complete</span>}
        </div>

        {/* Entry choice */}
        <div style={{ display: 'flex', gap: 8 }}>
          {ENTRIES.map(e => (
            <button key={e.id} onClick={() => chooseEntry(e.id)} title={e.desc} style={{ ...card, flex: 1, cursor: 'pointer', textAlign: 'left', borderColor: state.entry === e.id ? 'var(--color-border-strong)' : 'var(--color-border)' }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{e.label}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 3, lineHeight: 1.4 }}>{e.desc}</div>
            </button>
          ))}
        </div>

        {/* Nine-stage checklist */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {stages.map((s, i) => {
            const done = state.stages[s.id]?.done
            const isNext = progress.nextStage === s.id
            return (
              <div key={s.id} style={{ ...card, display: 'flex', gap: 10, borderColor: isNext ? 'var(--color-border-strong)' : 'var(--color-border)' }}>
                <input type="checkbox" checked={!!done} onChange={e => toggle(s.id, e.target.checked)} style={{ width: 'auto', marginTop: 2, cursor: 'pointer' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{i + 1}. {s.title}{isNext && <span style={{ fontSize: 10, color: 'var(--color-accent, #7c6cff)', marginLeft: 8 }}>next</span>}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-2)', marginTop: 2 }}>{s.ask}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 3 }}>Proof: {s.proof}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Generate starter system */}
      <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Generate a starter system</div>
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <input style={input} placeholder="System name" value={form.systemName} onChange={e => setForm({ ...form, systemName: e.target.value })} />
          <textarea style={{ ...input, minHeight: 54, resize: 'vertical', fontFamily: 'inherit' }} placeholder="One job it should do repeatedly" value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} />
          <select style={input} value={form.routing} onChange={e => setForm({ ...form, routing: e.target.value })}>
            {['private', 'fast', 'best', 'low-cost', 'auto'].map(r => <option key={r} value={r}>routing: {r}</option>)}
          </select>
          <button onClick={generate} style={{ fontSize: 12, cursor: 'pointer', background: 'var(--color-surface)', border: '0.5px solid var(--color-border-strong)', borderRadius: 'var(--radius-sm)', padding: '6px', color: 'var(--color-text)' }}>Generate starter pack</button>
          <div style={{ fontSize: 10, color: 'var(--color-text-3)', lineHeight: 1.4 }}>Read-only, no writes or computer-use. Creates a project + a starter-pack artifact you can open in the Library.</div>
        </div>
        {generated && (
          <div style={{ ...card, fontSize: 11 }}>
            <div style={{ color: 'var(--color-available)', fontWeight: 600, marginBottom: 4 }}>✓ Generated</div>
            <div style={{ color: 'var(--color-text-3)' }}>{generated.files?.length} files · project {generated.projectId?.slice(0, 16)}…</div>
            <div style={{ color: 'var(--color-text-3)', marginTop: 4 }}>{(generated.files || []).join(' · ')}</div>
          </div>
        )}

        {/* GU10.4: optional Creative Identity — presentation only. The audit's
            two-layer display: symbolic identity never changes operational
            authority. */}
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>Creative identity <span style={{ fontSize: 10, color: 'var(--color-text-3)', fontWeight: 400 }}>optional</span></div>
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <input style={input} placeholder="Name (e.g. The Lantern)" value={ci.name} onChange={e => setCi({ ...ci, name: e.target.value })} />
          <input style={input} placeholder="Archetype (e.g. seeker)" value={ci.archetype} onChange={e => setCi({ ...ci, archetype: e.target.value })} />
          <button onClick={saveIdentity} style={{ fontSize: 12, cursor: 'pointer', background: 'var(--color-surface)', border: '0.5px solid var(--color-border-strong)', borderRadius: 'var(--radius-sm)', padding: '6px', color: 'var(--color-text)' }}>Save identity</button>
          <div style={{ fontSize: 10, color: 'var(--color-text-3)', lineHeight: 1.4 }}>
            Shapes motivation, language, and presentation only. It <strong style={{ color: 'var(--color-text-2)' }}>never</strong> changes tool access or authority — those stay with the operational layer.
          </div>
          {state.creativeIdentity && (
            <div style={{ display: 'flex', gap: 10, fontSize: 10, borderTop: '0.5px solid var(--color-border)', paddingTop: 7 }}>
              <div style={{ flex: 1 }}><div style={{ color: 'var(--color-text-3)', marginBottom: 2 }}>Symbolic</div><div>{state.creativeIdentity.name || '—'}{state.creativeIdentity.archetype ? ` · ${state.creativeIdentity.archetype}` : ''}</div></div>
              <div style={{ flex: 1 }}><div style={{ color: 'var(--color-text-3)', marginBottom: 2 }}>Operational</div><div>authority unchanged</div></div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
