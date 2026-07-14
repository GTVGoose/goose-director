import { useRef } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Council inspector (T11). A docked right-rail panel that renders the live
// /api/sandbox SSE run into three stacked regions — Routing (top), Member lanes
// (middle), Synthesis (bottom). PURE VIEW: no fetch, no endpoint, no server
// change; it renders whatever `run` snapshot ChatHome feeds it from the stream it
// already consumes (runCouncil). Ships behind the same config.ui.chatHome flag as
// ChatHome (T10) — invisible until David flips it at gate G7. Visual pass = G7.
//
// `run` shape (built by ChatHome.runCouncil):
//   { running, mode, members:[name], aggregator, status,
//     active:{model,phase,round,subtask}|null,
//     turns:[{model,phase?,round?,subtask?,text?,error?}], final:{model,text}|null, error }
//
// Dock state is owned by ChatHome (`open`/`onToggle`): auto-opens the instant a
// 2nd model joins, collapses to a thin badge strip during solo chat so a plain
// chat stays quiet (proposal §3, resolves T8 open-Q8). Deferred to later tasks
// (proposal §3): one-way interrogate side-chat, interrupt/replay, and quantitative
// synthesis weighting — v1 is render-only (routing + lanes + qualitative provenance).
// ─────────────────────────────────────────────────────────────────────────────

const PHASE_LABEL = {
  propose: 'PROPOSE', debate: 'DEBATE', plan: 'PLAN', work: 'WORKER',
  tool: 'TOOL', champion: 'CHAMPION', challenger: 'CHALLENGER',
  synthesize: 'SYNTH', judge: 'JUDGE', compose: 'COMPOSE',
}

export default function CouncilInspector({ run, open, onToggle }) {
  const laneRefs = useRef({})
  const members = normalizeMembers(run?.members)
  const turns = Array.isArray(run?.turns) ? run.turns : []
  const active = run?.active || null
  const final = run?.final || null
  const status = run?.status || ''
  const running = !!run?.running
  const runError = run?.error || null

  // ── Collapsed strip (solo chat / user-collapsed) — quiet, one badge. ──
  if (!open) {
    return (
      <button
        onClick={onToggle}
        title="Show the Council inspector"
        style={{
          width: 40, flexShrink: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 9, paddingTop: 11,
          background: 'var(--color-surface)', border: '0.5px solid var(--color-border)',
          borderRadius: 10, cursor: 'pointer', color: 'var(--color-text-3)',
        }}
      >
        <i className="ti ti-chevron-left" style={{ fontSize: 15 }} />
        <span style={{ writingMode: 'vertical-rl', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Council</span>
        {members.length > 0 && (
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-recursive-text)', background: 'var(--color-recursive-bg)', border: '0.5px solid var(--color-recursive-border)', borderRadius: 'var(--radius-pill)', padding: '1px 5px' }}>{members.length}</span>
        )}
        {running && <i className="ti ti-loader-2 spin" style={{ fontSize: 12, color: 'var(--color-recursive-text)' }} />}
      </button>
    )
  }

  const scrollToLane = (name) => laneRefs.current[name]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })

  // Per-member state, keyed by display name (the id the SSE `model` field carries).
  const memberState = (name) => {
    if (active && active.model === name) return 'active'
    if (turns.some(t => t.model === name && t.text != null)) return 'done'
    if (turns.some(t => t.model === name && t.error)) return 'error'
    return 'pending'
  }
  // Synthesis is "active" only when the run's status actually names the aggregator
  // phase — the server emits "Synthesizing with…" / "…judging…" / "…composing…" for
  // every mode. (Deriving it from "all members settled" flickered between debate
  // rounds, when members are momentarily idle mid-run — critic finding, T11 council.)
  const synthState = final
    ? 'done'
    : runError
      ? 'error'
      : (running && /synthesi|judg|compos/i.test(status)) ? 'active' : 'pending'
  const contributors = members.filter(m => turns.some(t => t.model === m.name && t.text != null))
  const empty = members.length === 0 && !final && !runError

  return (
    <div style={{ width: 330, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 10, overflow: 'hidden', minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '9px 12px', borderBottom: '0.5px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
        <i className="ti ti-users-group" style={{ fontSize: 14, color: 'var(--color-recursive-text)' }} />
        <span className="glyph-label" style={{ flex: 1 }}>Council · {run?.mode || 'roundtable'}</span>
        {running && <i className="ti ti-loader-2 spin" style={{ fontSize: 13, color: 'var(--color-recursive-text)' }} />}
        <button onClick={onToggle} title="Collapse inspector" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', display: 'flex', padding: 0 }}>
          <i className="ti ti-chevron-right" style={{ fontSize: 15 }} />
        </button>
      </div>

      {empty ? (
        <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--color-text-3)', fontSize: 12, padding: 20, lineHeight: 1.55 }}>
          <i className="ti ti-users-group" style={{ fontSize: 26, opacity: 0.5, display: 'block', marginBottom: 8 }} />
          Add a model with <i className="ti ti-plus" style={{ fontSize: 11 }} /> and send — the unit's routing, member lanes, and synthesis stream here live.
        </div>
      ) : (
        <div className="scroll-y" style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 13 }}>

          {/* 1 · Routing (vertical flow, active-node highlight) */}
          <Section title="Routing">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {members.map(m => <RouteNode key={m.name} label={m.name + (m.role ? ` · ${m.role}` : '')} state={memberState(m.name)} />)}
              <RouteNode label={`Synthesis · ${run?.aggregator || 'Brain'}`} state={synthState} synth />
            </div>
          </Section>

          {/* 2 · Member lanes (one per member, grouped from `turn` events) */}
          <Section title={`Member lanes (${members.length})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {members.map(m => {
                const mine = turns.filter(t => t.model === m.name)
                const st = memberState(m.name)
                return (
                  <div key={m.name} ref={el => { laneRefs.current[m.name] = el }} style={{ border: '0.5px solid var(--color-border)', borderRadius: 7, overflow: 'hidden' }}>
                    <button onClick={() => scrollToLane(m.name)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', background: 'var(--color-surface-2)', border: 'none', cursor: 'pointer' }}>
                      <StateDot state={st} />
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}{m.role ? ` · ${m.role}` : ''}</span>
                    </button>
                    <div style={{ padding: '6px 9px' }}>
                      {mine.length === 0 && (
                        <div style={{ fontSize: 11, color: 'var(--color-text-3)', fontStyle: 'italic' }}>{st === 'active' ? 'responding…' : 'waiting…'}</div>
                      )}
                      {mine.map((t, i) => (
                        <div key={i} style={{ marginTop: i ? 7 : 0 }}>
                          <Tag phase={t.phase} round={t.round} />
                          {t.subtask && <div style={{ fontSize: 10.5, color: 'var(--color-text-3)', fontStyle: 'italic', margin: '2px 0' }}>Subtask: {t.subtask}</div>}
                          <div style={{ fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: t.error ? 'var(--color-escalation-text)' : 'var(--color-text)', marginTop: t.phase ? 3 : 0 }}>
                            {t.error ? `⚠ ${t.error}` : t.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>

          {/* 3 · Synthesis (final + qualitative provenance) */}
          <Section title="Synthesis">
            {final ? (
              <div style={{ border: '1px solid var(--color-recursive-border)', background: 'var(--color-recursive-bg)', borderRadius: 7, padding: '9px 11px' }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginBottom: 5, lineHeight: 1.5 }}>
                  Synthesized by <b style={{ color: 'var(--color-recursive-text)' }}>{final.model}</b>
                  {contributors.length > 0 && <> from {contributors.length} member{contributors.length > 1 ? 's' : ''}: {contributors.map((c, i) => (
                    <span key={c.name}>{i ? ', ' : ''}<button onClick={() => scrollToLane(c.name)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-recursive-text)', fontSize: 10, textDecoration: 'underline' }}>{c.name}</button></span>
                  ))}</>}
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--color-text)' }}>{final.text}</div>
              </div>
            ) : runError ? (
              <div style={{ fontSize: 11.5, color: 'var(--color-escalation-text)', background: 'var(--color-escalation-bg)', border: '0.5px solid var(--color-escalation-border)', borderRadius: 'var(--radius-md)', padding: '7px 10px' }}>{runError}</div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--color-text-3)', fontStyle: 'italic', padding: '4px 2px' }}>
                {running ? (synthState === 'active' ? 'Synthesizing…' : 'Awaiting member answers…') : 'No synthesis yet.'}
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  )
}

function normalizeMembers(m) {
  if (!Array.isArray(m)) return []
  // Dedupe by display name: turns/lanes/refs are all keyed by `name` (the SSE `model`
  // field), so two configured models resolving to the same name must collapse to one
  // lane rather than colliding React keys and merging turns (critic finding, T11 council).
  const seen = new Set()
  const out = []
  for (const x of m) {
    const item = typeof x === 'string' ? { name: x } : { name: x?.name || x?.id || 'model', role: x?.role }
    if (seen.has(item.name)) continue
    seen.add(item.name)
    out.push(item)
  }
  return out
}

function RouteNode({ label, state, synth }) {
  const activeNode = state === 'active'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderRadius: 5,
      background: activeNode ? 'var(--color-recursive-bg)' : 'none',
      border: activeNode ? '0.5px solid var(--color-recursive-border)' : '0.5px solid transparent',
    }}>
      <StateDot state={state} />
      <span style={{ fontSize: 11.5, color: state === 'pending' ? 'var(--color-text-3)' : 'var(--color-text)', fontWeight: synth ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
}

// Only confirmed-present icons (ti-loader-2, ti-alert-triangle); done/pending are
// CSS dots so we never depend on an icon glyph that may not be in the bundled font.
function StateDot({ state }) {
  if (state === 'active') return <i className="ti ti-loader-2 spin" style={{ fontSize: 12, color: 'var(--color-recursive-text)', flexShrink: 0 }} />
  if (state === 'error') return <i className="ti ti-alert-triangle" style={{ fontSize: 12, color: 'var(--color-escalation-text)', flexShrink: 0 }} />
  const done = state === 'done'
  return <span style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: done ? 'var(--color-available)' : 'transparent', border: done ? 'none' : '1.5px solid var(--color-border-strong)' }} />
}

function Tag({ phase, round }) {
  if (!phase) return null
  const label = (PHASE_LABEL[phase] || String(phase).toUpperCase()) + (round ? ` ${round}` : '')
  return <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-text-3)', border: '0.5px solid var(--color-border-strong)', borderRadius: 'var(--radius-sm)', padding: '1px 4px', display: 'inline-block' }}>{label}</span>
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-text-3)', textTransform: 'uppercase', margin: '0 0 5px 2px' }}>{title}</div>
      {children}
    </div>
  )
}
