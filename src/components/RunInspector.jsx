import { useState, useEffect } from 'react'

// GU8.2: the Run Inspector (audit Phase 8 "run inspector showing plan, active
// model, tool calls, approvals, sources, progress, cost, cancellation, final
// provenance"). Flag-gated behind ui.runInspector (default off). Pure READ UI
// over the Phase-2 /api/runs endpoints. Renders the role-annotated event trace
// so the multi-model machinery is legible.

const ROLE_COLORS = {
  'control-plane': 'var(--color-accent, #7c6cff)',
  brain: 'var(--color-available)',
  worker: 'var(--color-text-2)',
  broker: '#e0a800',
}
const roleTag = (role) => role ? (
  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: ROLE_COLORS[role] || 'var(--color-text-3)', border: `0.5px solid ${ROLE_COLORS[role] || 'var(--color-border-mid)'}`, borderRadius: 'var(--radius-pill)', padding: '0 5px' }}>{role}</span>
) : null

export default function RunInspector() {
  const [runs, setRuns] = useState(null)
  const [selected, setSelected] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    fetch('/api/runs').then(r => r.json()).then(setRuns).catch(e => setErr(e.message))
  }, [])
  const open = (id) => fetch(`/api/runs/${id}`).then(r => r.json()).then(setSelected).catch(e => setErr(e.message))

  const card = { background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 12 }

  if (err) return <div style={{ padding: 20, color: 'var(--color-unavailable)' }}>Run inspector error: {err}</div>
  if (runs === null) return <div style={{ padding: 20, color: 'var(--color-text-3)' }}>Loading runs…</div>

  const finalEv = selected?.events?.find(e => e.type === 'final')

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%' }}>
      <div style={{ width: 300, flexShrink: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Runs <span style={{ color: 'var(--color-text-3)', fontWeight: 400 }}>· {runs.length}</span></div>
        {runs.length === 0 && <div style={{ ...card, color: 'var(--color-text-3)', fontSize: 12 }}>No runs yet. Start a Council run to see its trace here.</div>}
        {runs.map(r => (
          <button key={r.id} onClick={() => open(r.id)} style={{ ...card, textAlign: 'left', cursor: 'pointer', borderColor: selected?.id === r.id ? 'var(--color-border-strong)' : 'var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-2)' }}>{r.mode}</span>
              {r.hasFinal ? <span style={{ fontSize: 10, color: 'var(--color-available)' }}>✓ final</span> : <span style={{ fontSize: 10, color: 'var(--color-text-3)' }}>partial</span>}
              <div style={{ flex: 1 }} />
              {typeof r.costUSD === 'number' && <span style={{ fontSize: 10, color: 'var(--color-text-3)' }}>${r.costUSD.toFixed(3)}</span>}
            </div>
            <div style={{ fontSize: 12 }}>{r.task || '(no task)'}</div>
            {r.routing?.policy && <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 2 }}>policy: {r.routing.policy}</div>}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        {!selected && <div style={{ padding: 20, color: 'var(--color-text-3)' }}>Select a run to inspect its plan, workers, tools, and synthesis.</div>}
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{selected.task}</div>
            <div style={{ ...card, fontSize: 11, color: 'var(--color-text-3)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span>mode: <strong style={{ color: 'var(--color-text-2)' }}>{selected.mode}</strong></span>
              {selected.projectId && <span>project: {selected.projectId}</span>}
              {selected.cancelled && <span style={{ color: 'var(--color-unavailable)' }}>cancelled</span>}
              {typeof selected.costUSD === 'number' && <span>cost: ${selected.costUSD.toFixed(4)}</span>}
              {selected.routingPolicy?.policy && <span>policy: {selected.routingPolicy.policy}</span>}
            </div>

            {finalEv?.routing && (
              <div style={{ ...card, fontSize: 11 }}>
                <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--color-text-2)' }}>Routing</div>
                <div style={{ color: 'var(--color-text-3)' }}>floor: {finalEv.routing.floor} · brain: {finalEv.routing.brain?.id} ({finalEv.routing.brain?.local ? 'local' : 'cloud'}) · localOnly: {String(finalEv.routing.localOnly)} · enforced: {String(finalEv.routing.enforced)}</div>
              </div>
            )}

            {finalEv?.provenance && (
              <div style={{ ...card, fontSize: 11 }}>
                <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--color-text-2)' }}>Synthesis provenance</div>
                <div style={{ color: 'var(--color-text-3)' }}>by {finalEv.provenance.synthesizedBy?.name} · {finalEv.provenance.contributors?.length || 0} contributor(s){finalEv.provenance.sources?.length ? ` · ${finalEv.provenance.sources.length} source(s)` : ''}</div>
              </div>
            )}

            <div style={{ fontSize: 12, fontWeight: 600 }}>Trace <span style={{ color: 'var(--color-text-3)', fontWeight: 400 }}>· {selected.events?.length || 0} events</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {(selected.events || []).map((e, i) => (
                <div key={i} style={{ ...card, padding: '7px 11px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontSize: 10, color: 'var(--color-text-3)', minWidth: 62, fontWeight: 600 }}>{e.type}{e.phase ? `·${e.phase}` : ''}</span>
                  {roleTag(e.role)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {e.model && <span style={{ fontSize: 11, color: 'var(--color-text-2)' }}>{e.model} </span>}
                    {e.kit && <span style={{ fontSize: 10, color: 'var(--color-text-3)' }}>kit {e.kit.kitId} {e.kit.withheld?.length ? `(withheld ${e.kit.withheld.length})` : ''} </span>}
                    {(e.message || e.subtask || e.text) && <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{String(e.message || e.subtask || e.text).slice(0, 180)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
