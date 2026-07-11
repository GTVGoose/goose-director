import { useState, useEffect, useRef } from 'react'

const MODES = {
  roundtable: {
    label: 'Roundtable',
    sub: 'Mixture-of-Agents — each model answers, one synthesizes',
    aggLabel: 'Aggregator',
    finalLabel: 'SYNTHESIS',
    icon: 'users-group',
  },
  debate: {
    label: 'Debate',
    sub: 'Models critique each other over rounds, a judge rules',
    aggLabel: 'Judge',
    finalLabel: 'VERDICT',
    icon: 'message-2-share',
  },
  orchestrator: {
    label: 'Orchestrator',
    sub: 'A director decomposes the task and delegates to workers',
    aggLabel: 'Director',
    finalLabel: 'FINAL',
    icon: 'sitemap',
  },
  director: {
    label: 'Umbruh Director',
    sub: 'Umbruh plans, routes each part to the best model, uses tools, and composes',
    aggLabel: 'Director backend (Umbruh)',
    finalLabel: 'UMBRUH',
    icon: 'wand',
  },
  ab: {
    label: 'Champion vs Challenger',
    sub: 'Trial an Umbruh persona update: same prompt + backend, both personas side by side',
    aggLabel: 'Backend',
    finalLabel: 'TRIAL',
    icon: 'columns',
  },
}

// phase → visual treatment
const PHASE_STYLE = {
  propose: { tone: 'active', label: 'PROPOSE' },
  debate: { tone: 'passive', label: 'DEBATE' },
  plan: { tone: 'recursive', label: 'PLAN' },
  work: { tone: 'dual', label: 'WORKER' },
  tool: { tone: 'passive', label: 'TOOL' },
  champion: { tone: 'dual', label: 'CHAMPION' },
  challenger: { tone: 'recursive', label: 'CHALLENGER' },
}

function toneVars(tone) {
  return {
    bg: `var(--color-${tone}-bg)`,
    text: `var(--color-${tone}-text)`,
    border: `var(--color-${tone}-border)`,
  }
}

export default function Sandbox({ canonDocs = [] }) {
  const [models, setModels] = useState([])
  const [agentRoles, setAgentRoles] = useState([])
  const [ollamaRunning, setOllamaRunning] = useState(true)

  const [mode, setMode] = useState('roundtable')
  const [participants, setParticipants] = useState([])     // model ids
  const [aggregatorId, setAggregatorId] = useState('')
  const [backendId, setBackendId] = useState('')
  const [rounds, setRounds] = useState(2)
  const [toolsOn, setToolsOn] = useState(true)
  const [roleAssignments, setRoleAssignments] = useState({})
  const [selectedDocs, setSelectedDocs] = useState([])
  const [showDocs, setShowDocs] = useState(false)
  const [showRoles, setShowRoles] = useState(false)

  const [task, setTask] = useState('')
  const [events, setEvents] = useState([])   // {kind:'turn'|'error'|'final', ...}
  const [status, setStatus] = useState('')
  const [active, setActive] = useState(null) // {model, phase, round}
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [runMode, setRunMode] = useState('roundtable')
  const bottomRef = useRef(null)

  useEffect(() => {
    fetch('/api/models').then(r => r.json()).then(d => {
      setModels(d.models || [])
      setAgentRoles(d.agentRoles || [])
      setOllamaRunning(d.ollamaRunning !== false)
      const avail = (d.models || []).filter(m => m.available)
      // default: first two available as participants
      setParticipants(avail.slice(0, 2).map(m => m.id))
      // default aggregator: prefer a cloud model, else first available
      const agg = avail.find(m => m.provider !== 'ollama') || avail[0]
      if (agg) setAggregatorId(agg.id)
      // A/B backend default: prefer an Umbruh variant, else first available
      const backend = avail.find(m => /umbruh/i.test(m.id)) || avail[0]
      if (backend) setBackendId(backend.id)
    })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events, active, status])

  // In Director mode, default the Director backend to Claude Max — the empirical
  // conductor (fast, error-catching, $0 subscription; see UMBRUH_OPERATING_TIERS).
  // Fall back to a local Umbruh only if Claude Max isn't available.
  useEffect(() => {
    if (mode !== 'director') return
    const u = models.find(m => m.available && m.id === 'claude-max')
      || models.find(m => m.available && /umbruh/i.test(m.id))
    if (u) setAggregatorId(u.id)
  }, [mode, models])

  const meta = MODES[mode]
  const available = models.filter(m => m.available)
  const toggleParticipant = (id) => {
    setParticipants(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  const minParticipants = (mode === 'orchestrator' || mode === 'director') ? 1 : 2
  const canRun = mode === 'ab'
    ? !!(task.trim() && backendId && !running)
    : !!(task.trim() && participants.length >= minParticipants && aggregatorId && !running)

  const run = async () => {
    if (!canRun) return
    setEvents([])
    setStatus('')
    setActive(null)
    setError(null)
    setRunning(true)
    setRunMode(mode)

    try {
      const res = await fetch('/api/sandbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: task.trim(),
          participantIds: participants,
          mode,
          aggregatorId,
          backendId,
          rounds: Number(rounds) || 2,
          sourceDocs: selectedDocs.map(d => ({ title: d.title, path: d.path })),
          roleAssignments,
          directorId: aggregatorId,
          tools: toolsOn,
        }),
      })
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let msg
          try { msg = JSON.parse(line.slice(6)) } catch { continue }
          if (msg.type === 'status') setStatus(msg.message)
          else if (msg.type === 'turn-start') setActive({ model: msg.model, phase: msg.phase, round: msg.round, subtask: msg.subtask })
          else if (msg.type === 'turn') { setEvents(e => [...e, { kind: 'turn', ...msg }]); setActive(null) }
          else if (msg.type === 'turn-error') { setEvents(e => [...e, { kind: 'error', ...msg }]); setActive(null) }
          else if (msg.type === 'final') { setEvents(e => [...e, { kind: 'final', ...msg }]); setActive(null) }
          else if (msg.type === 'done') { setRunning(false); setActive(null); setStatus('Complete') }
          else if (msg.type === 'error') { setError(msg.error); setRunning(false) }
        }
      }
    } catch (e) {
      setError(e.message)
    }
    setRunning(false)
    setActive(null)
  }

  const saveSession = async () => {
    const content = events.map(ev => {
      if (ev.kind === 'final') return `## ${MODES[runMode].finalLabel} — ${ev.model}\n\n${ev.text}`
      if (ev.kind === 'error') return `### ${ev.model} (${ev.phase}) — ERROR\n\n${ev.error}`
      const ps = PHASE_STYLE[ev.phase]
      const tag = ev.phase === 'debate' ? `ROUND ${ev.round}` : (ps?.label || ev.phase)
      return `### ${ev.model} — ${tag}${ev.subtask ? `\n*Subtask: ${ev.subtask}*` : ''}\n\n${ev.text}`
    }).join('\n\n---\n\n')
    const body = {
      title: `Sandbox (${MODES[runMode].label}) — ${new Date().toLocaleDateString()}`,
      content: `**Task:** ${task}\n\n${content}`,
      tags: ['sandbox', runMode, ...participants],
      role: `sandbox:${runMode}`,
      modelName: participants.join(', '),
    }
    await fetch('/api/threads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setStatus('Saved to Knowledge Navigator')
  }

  return (
    <div style={{ display: 'flex', height: '100%', gap: 16, position: 'relative' }}>

      {/* ── Config column ── */}
      <div style={{ width: 270, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>

        {/* Mode */}
        <Panel title="Mode">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {Object.entries(MODES).map(([id, m]) => (
              <div
                key={id}
                onClick={() => setMode(id)}
                style={{
                  padding: '7px 9px', borderRadius: 6, cursor: 'pointer',
                  border: mode === id ? '1px solid var(--color-recursive-border)' : '0.5px solid var(--color-border)',
                  background: mode === id ? 'var(--color-recursive-bg)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className={`ti ti-${m.icon}`} style={{ fontSize: 14, color: mode === id ? 'var(--color-recursive-text)' : 'var(--color-text-3)' }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: mode === id ? 'var(--color-text)' : 'var(--color-text-2)' }}>{m.label}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 2, paddingLeft: 20, lineHeight: 1.4 }}>{m.sub}</div>
              </div>
            ))}
          </div>
        </Panel>

        {mode !== 'ab' && (<>
        {/* Participants */}
        <Panel title={`Participants (${participants.length})`}>
          {!ollamaRunning && (
            <div style={{ fontSize: 10, color: 'var(--color-review-text)', marginBottom: 6 }}>Ollama offline — local models unavailable</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {models.map(m => {
              const on = participants.includes(m.id)
              return (
                <div
                  key={m.id}
                  onClick={() => m.available && toggleParticipant(m.id)}
                  title={!m.available && m.unavailableReason ? m.unavailableReason : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '5px 7px', borderRadius: 5,
                    border: on ? '0.5px solid var(--color-border-strong)' : '0.5px solid var(--color-border)',
                    background: on ? 'var(--color-border)' : 'none',
                    cursor: m.available ? 'pointer' : 'not-allowed', opacity: m.available ? 1 : 0.4,
                  }}
                >
                  <span style={{
                    width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                    border: '1px solid var(--color-border-strong)',
                    background: on ? 'var(--color-recursive)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {on && <i className="ti ti-check" style={{ fontSize: 10, color: '#fff' }} />}
                  </span>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: m.available ? 'var(--color-available)' : 'var(--color-unavailable)' }} />
                  <span style={{ fontSize: 12, color: 'var(--color-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                  {m.autoDetected && <span style={{ fontSize: 8, color: 'var(--color-text-3)', border: '0.5px solid var(--color-border-mid)', borderRadius: 3, padding: '0 3px' }}>AUTO</span>}
                </div>
              )
            })}
          </div>
        </Panel>

        {/* Aggregator / Judge / Director */}
        <Panel title={meta.aggLabel}>
          <select value={aggregatorId} onChange={e => setAggregatorId(e.target.value)} style={{ width: '100%', fontSize: 12 }}>
            {available.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 5, lineHeight: 1.4 }}>
            {mode === 'roundtable' && 'Synthesizes all members into one answer.'}
            {mode === 'debate' && 'Judges the final round (weighs reasoning, not votes).'}
            {mode === 'orchestrator' && 'Plans the subtasks and composes the result.'}
            {mode === 'director' && 'Umbruh runs here and conducts the ensemble — routing each part to the models above, then composing in its own voice.'}
          </div>
        </Panel>

        {mode === 'director' && (
          <Panel title="Tools">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={toolsOn} onChange={e => setToolsOn(e.target.checked)} />
              <span>Let the ensemble use tools</span>
            </label>
            <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 5, lineHeight: 1.4 }}>
              run_bash · read/write files · fetch_url · open_app — on your Mac. Umbruh decides per subtask which need tools. Off = plan &amp; reason only.
            </div>
          </Panel>
        )}
        </>)}

        {/* A/B backend */}
        {mode === 'ab' && (
          <Panel title="Backend model">
            <select value={backendId} onChange={e => setBackendId(e.target.value)} style={{ width: '100%', fontSize: 12 }}>
              {available.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 5, lineHeight: 1.4 }}>
              Runs the same prompt through this model twice — champion persona (umbruh-persona.md) vs challenger (umbruh-persona.candidate.md) — so the persona is the only variable.
            </div>
          </Panel>
        )}

        {/* Rounds (debate only) */}
        {mode === 'debate' && (
          <Panel title="Rounds">
            <input type="number" min={1} max={5} value={rounds} onChange={e => setRounds(e.target.value)} style={{ width: '100%', fontSize: 12 }} />
          </Panel>
        )}

        {/* Roles (optional) */}
        {mode !== 'ab' && (
        <div>
          <button onClick={() => setShowRoles(!showRoles)} style={miniBtn}>
            <i className={`ti ti-${showRoles ? 'chevron-down' : 'chevron-right'}`} style={{ fontSize: 12 }} /> Assign agent roles
          </button>
          {showRoles && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {participants.map(id => {
                const m = models.find(x => x.id === id)
                if (!m) return null
                return (
                  <div key={id} style={{ fontSize: 11 }}>
                    <span style={{ color: 'var(--color-text-2)' }}>{m.name}</span>
                    <select
                      value={roleAssignments[id] || ''}
                      onChange={e => setRoleAssignments(r => ({ ...r, [id]: e.target.value }))}
                      style={{ width: '100%', fontSize: 11, marginTop: 2 }}
                    >
                      <option value="">No role (open)</option>
                      {agentRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        )}

        {/* Source docs (optional) */}
        <div>
          <button onClick={() => setShowDocs(!showDocs)} style={miniBtn}>
            <i className={`ti ti-${showDocs ? 'chevron-down' : 'chevron-right'}`} style={{ fontSize: 12 }} /> Source docs ({selectedDocs.length})
          </button>
          {showDocs && (
            <div style={{ marginTop: 6, maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {canonDocs.slice(0, 40).map((d, i) => {
                const on = selectedDocs.find(s => s.path === d.path)
                return (
                  <div key={i} onClick={() => setSelectedDocs(s => on ? s.filter(x => x.path !== d.path) : [...s, d])}
                    style={{ fontSize: 11, padding: '3px 5px', borderRadius: 4, cursor: 'pointer', color: on ? 'var(--color-text)' : 'var(--color-text-2)', background: on ? 'var(--color-border)' : 'none' }}>
                    {on ? '✓ ' : ''}{d.title}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Main: task + transcript ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Task input */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <textarea
            value={task}
            onChange={e => setTask(e.target.value)}
            placeholder={`Give the ${participants.length || 'selected'} models a task to work on together…`}
            rows={2}
            style={{ flex: 1, fontSize: 13, resize: 'vertical' }}
          />
          <button
            onClick={run}
            disabled={!canRun}
            style={{
              alignSelf: 'stretch', padding: '0 18px', borderRadius: 6,
              border: '0.5px solid var(--color-recursive-border)',
              background: canRun ? 'var(--color-recursive-bg)' : 'var(--color-surface)',
              color: canRun ? 'var(--color-recursive-text)' : 'var(--color-text-3)',
              fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
              cursor: canRun ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap',
            }}
          >
            <i className={`ti ti-${running ? 'loader-2' : 'player-play'}`} style={{ fontSize: 15 }} />
            {running ? 'Running…' : 'Run council'}
          </button>
        </div>

        {mode !== 'ab' && participants.length < minParticipants && (
          <div style={{ fontSize: 11, color: 'var(--color-review-text)', marginBottom: 8 }}>
            Select at least {minParticipants} participant{minParticipants > 1 ? 's' : ''} for {meta.label} mode.
          </div>
        )}

        {/* Transcript */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
          {events.length === 0 && !running && (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--color-text-3)', maxWidth: 380 }}>
              <i className={`ti ti-${meta.icon}`} style={{ fontSize: 30, opacity: 0.5 }} />
              <div style={{ fontSize: 13, marginTop: 10, color: 'var(--color-text-2)' }}>{meta.label}</div>
              <div style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>{meta.sub}. Pick participants, write a task, and run the council.</div>
            </div>
          )}

          {runMode === 'ab' ? (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {['champion', 'challenger'].map(side => (
                <div key={side} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: `var(--color-${PHASE_STYLE[side].tone}-text)`, paddingLeft: 2 }}>
                    {PHASE_STYLE[side].label}
                  </div>
                  {events.filter(e => e.phase === side).map((ev, i) => <EventCard key={i} ev={ev} finalLabel={MODES[runMode].finalLabel} />)}
                </div>
              ))}
            </div>
          ) : (
            events.map((ev, i) => <EventCard key={i} ev={ev} finalLabel={MODES[runMode].finalLabel} />)
          )}

          {active && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-2)', fontSize: 12, padding: '4px 2px' }}>
              <i className="ti ti-loader-2" style={{ fontSize: 14 }} />
              <span><b>{active.model}</b> is {active.phase === 'plan' ? 'planning' : active.phase === 'work' ? 'working' : 'responding'}{active.round ? ` · round ${active.round}` : ''}…</span>
            </div>
          )}

          {error && (
            <div style={{ fontSize: 12, color: 'var(--color-escalation-text)', background: 'var(--color-escalation-bg)', border: '0.5px solid var(--color-escalation-border)', borderRadius: 6, padding: '8px 12px' }}>
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Footer status + save */}
        {(status || events.length > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--color-border)' }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-3)', flex: 1 }}>{status}</span>
            {events.length > 0 && !running && (
              <button onClick={saveSession} style={{ ...miniBtn, border: '0.5px solid var(--color-border-strong)', padding: '5px 10px' }}>
                <i className="ti ti-bookmark" style={{ fontSize: 13 }} /> Save session
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function EventCard({ ev, finalLabel }) {
  if (ev.kind === 'error') {
    return (
      <div style={{ borderRadius: 8, border: '0.5px solid var(--color-escalation-border)', background: 'var(--color-escalation-bg)', padding: '8px 12px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-escalation-text)' }}>{ev.model} — {ev.phase} failed</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-2)', marginTop: 3 }}>{ev.error}</div>
      </div>
    )
  }
  if (ev.kind === 'final') {
    return (
      <div style={{ borderRadius: 8, border: '1px solid var(--color-recursive-border)', background: 'var(--color-recursive-bg)', padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-recursive-text)' }}>{finalLabel}</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>· {ev.model}</span>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--color-text)' }}>{ev.text}</div>
      </div>
    )
  }
  // regular turn
  const ps = PHASE_STYLE[ev.phase] || { tone: 'passive', label: ev.phase?.toUpperCase() }
  const t = toneVars(ps.tone)
  const tag = ev.phase === 'debate' ? `ROUND ${ev.round}` : ps.label
  return (
    <div style={{ borderRadius: 8, border: `0.5px solid ${t.border}`, background: t.bg, padding: '10px 13px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{ev.model}</span>
        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', color: t.text, border: `0.5px solid ${t.border}`, borderRadius: 3, padding: '1px 5px' }}>{tag}</span>
      </div>
      {ev.subtask && <div style={{ fontSize: 11, color: 'var(--color-text-2)', fontStyle: 'italic', marginBottom: 5 }}>Subtask: {ev.subtask}</div>}
      <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--color-text)' }}>{ev.text}</div>
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <div style={{ background: 'var(--color-surface)', border: '0.5px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ padding: '7px 12px', borderBottom: '0.5px solid var(--color-border)' }}>
        <span className="glyph-label">{title}</span>
      </div>
      <div style={{ padding: '10px 12px' }}>{children}</div>
    </div>
  )
}

const miniBtn = {
  background: 'none', border: 'none', color: 'var(--color-text-2)', cursor: 'pointer',
  fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, padding: 0,
}
