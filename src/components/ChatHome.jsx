import { useState, useEffect, useRef } from 'react'
import CouncilInspector from './CouncilInspector'

// ─────────────────────────────────────────────────────────────────────────────
// Chat-first landing (T10). Ships BEHIND config.ui.chatHome (default off) — nothing
// changes for a user until David flips the flag at gate G7. Solo turns reuse the
// /api/relay streaming plumbing (byte-for-byte the same call Invoke makes);
// "convening the Council" hands the turn to /api/sandbox (the same engine the
// Sandbox view drives, roundtable mode) and streams the synthesized result back
// into the thread. The rich right-rail Council inspector is a separate task (T11);
// here the council run shows a compact inline progress line + a collapsible list of
// member turns, with the synthesis as the assistant message.
//
// Deferred (documented, NOT built here to avoid dead controls / scope creep):
//   • reasoning-effort control — /api/relay does not accept an effort param, so a
//     control would be non-functional; deferred until the relay contract supports it.
//   • in-place thread restore — saved threads are markdown, not structured messages;
//     the Recent panel opens a read-only reader rather than faking a message replay.
//   • Sandbox→"Council" rename — batches with the T11 inspector / G7 (see log).
// ─────────────────────────────────────────────────────────────────────────────
export default function ChatHome({ canonDocs = [], onNav }) {
  const [models, setModels] = useState([])
  const [brainId, setBrainId] = useState(null)
  const [selectedModel, setSelectedModel] = useState('')
  const [council, setCouncil] = useState([])          // extra model ids beyond the Brain
  const [showAdd, setShowAdd] = useState(false)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [conversation, setConversation] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [threads, setThreads] = useState([])
  const [showThreads, setShowThreads] = useState(false)
  const [viewingThread, setViewingThread] = useState(null)
  const [saveNote, setSaveNote] = useState(null)
  const [councilRun, setCouncilRun] = useState(null)   // live/last /api/sandbox run → CouncilInspector (T11)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    fetch('/api/models').then(r => r.json()).then(d => {
      const ms = d.models || []
      setModels(ms)
      setBrainId(d.brainId || null)
      const first = ms.find(m => m.available && m.id === d.brainId) || ms.find(m => m.available)
      if (first) setSelectedModel(first.id)
    }).catch(() => {})
    loadThreads()
  }, [])

  const loadThreads = () => {
    fetch('/api/threads').then(r => r.json())
      .then(t => setThreads(Array.isArray(t) ? t : [])).catch(() => {})
  }

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [conversation, streaming])

  // Dock the Council inspector open the instant a 2nd model joins, and collapse it
  // back to the quiet strip when the unit clears / New chat (proposal §3, T8 open-Q8).
  // Only fires on council-size transitions, so a manual toggle during solo chat sticks.
  useEffect(() => { setInspectorOpen(council.length > 0) }, [council.length])

  const available = models.filter(m => m.available)
  const currentModel = models.find(m => m.id === selectedModel)
  const councilActive = council.length > 0
  const noneAvailable = models.length > 0 && !available.length

  const toggleCouncil = (id) =>
    setCouncil(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id])

  const newChat = () => {
    if (streaming) return
    setConversation([]); setInput(''); setError(null); setCouncil([]); setSaveNote(null); setViewingThread(null); setCouncilRun(null)
  }

  const send = async () => {
    if (!input.trim() || !selectedModel || streaming) return
    const userMsg = { role: 'user', content: input.trim() }
    const newConv = [...conversation, userMsg]
    setConversation(newConv)
    setInput('')
    setStreaming(true)
    setError(null)
    try {
      if (councilActive) await runCouncil(newConv, userMsg.content)
      else await runSolo(newConv)
    } finally {
      setStreaming(false)
    }
  }

  // Solo turn — reuse the Invoke /api/relay streaming path.
  const runSolo = async (newConv) => {
    let assistantText = ''
    setConversation([...newConv, { role: 'assistant', content: '', streaming: true }])
    try {
      const res = await fetch('/api/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: selectedModel, messages: newConv, sourceDocs: [] }),
      })
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.text) {
              assistantText += data.text
              setConversation([...newConv, { role: 'assistant', content: assistantText, streaming: true }])
            }
            if (data.error) setError(data.error)
            if (data.done) setConversation([...newConv, { role: 'assistant', content: assistantText, streaming: false, model: data.model }])
          } catch {}
        }
      }
    } catch (e) { setError(e.message) }
    // Settle: if the stream closed without a `done` frame, keep what streamed in.
    setConversation(prev => {
      const last = prev[prev.length - 1]
      if (last && last.role === 'assistant' && last.streaming) {
        return [...prev.slice(0, -1), { ...last, streaming: false }]
      }
      return prev
    })
  }

  // Council turn — hand the task to /api/sandbox (roundtable: members answer, the
  // Brain synthesizes). Stream the synthesis back as the assistant message; show a
  // compact live progress line + collapsible member turns. (Full inspector = T11.)
  const runCouncil = async (newConv, task) => {
    // Dedupe: the Brain (selectedModel) is always the aggregator; if it also sits in
    // `council` (e.g. it was added, then chosen as Brain) it must not be sent twice as
    // a participant — the server calls a model once per participantId. (Council reconcile
    // on Brain-select is the primary guard; this Set is defence-in-depth.)
    const unit = [...new Set([selectedModel, ...council])]
    const members = unit.map(id => models.find(m => m.id === id)?.name || id)
    const base = { role: 'assistant', content: '', streaming: true, council: true, members, progress: 'Convening the council…', turns: [] }
    setConversation([...newConv, base])
    const turns = []
    let finalText = ''
    let settled = false
    const paint = (patch) => setConversation([...newConv, { ...base, turns: [...turns], ...patch }])
    // Parallel richer snapshot for the docked CouncilInspector (T11). Same `turns`
    // array; the inspector reads phase/round/subtask, so we enrich the pushes below.
    const aggName = models.find(m => m.id === selectedModel)?.name || selectedModel
    const insp = { running: true, mode: 'roundtable', members, aggregator: aggName, status: 'Convening the council…', active: null, final: null, error: null }
    const syncInsp = (patch) => { Object.assign(insp, patch); setCouncilRun({ ...insp, turns: [...turns] }) }
    syncInsp({})
    try {
      const res = await fetch('/api/sandbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task, participantIds: unit, mode: 'roundtable',
          aggregatorId: selectedModel, rounds: 2, tools: false,
          sourceDocs: [], roleAssignments: {},
        }),
      })
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let msg; try { msg = JSON.parse(line.slice(6)) } catch { continue }
          if (msg.type === 'status') { paint({ progress: msg.message }); syncInsp({ status: msg.message }) }
          else if (msg.type === 'turn-start') { paint({ progress: `${msg.model} is responding…` }); syncInsp({ active: { model: msg.model, phase: msg.phase, round: msg.round, subtask: msg.subtask }, status: `${msg.model} is responding…` }) }
          else if (msg.type === 'turn') { turns.push({ model: msg.model, text: msg.text, phase: msg.phase, round: msg.round, subtask: msg.subtask }); paint({ progress: `${msg.model} answered` }); syncInsp({ active: null, status: `${msg.model} answered` }) }
          else if (msg.type === 'turn-error') {
            // An aggregator-phase failure (synthesize/judge/compose) means there will be
            // NO `final` — surface it at the top level instead of burying it as one more
            // member turn (the member turns still show in the collapsible list + inspector).
            const aggPhase = msg.phase === 'synthesize' || msg.phase === 'judge' || msg.phase === 'compose'
            if (aggPhase) setError(`Synthesis failed: ${msg.error}`)
            turns.push({ model: msg.model, error: msg.error, phase: msg.phase }); paint({})
            syncInsp({ active: null, ...(aggPhase ? { error: `Synthesis failed: ${msg.error}` } : {}) })
          }
          else if (msg.type === 'final') { finalText = msg.text; paint({ content: msg.text, progress: `Synthesized by ${msg.model}`, finalModel: msg.model }); syncInsp({ final: { model: msg.model, text: msg.text }, active: null, status: `Synthesized by ${msg.model}` }) }
          else if (msg.type === 'done') { settled = true; setConversation([...newConv, { ...base, turns: [...turns], content: finalText, streaming: false, progress: null }]); syncInsp({ running: false, active: null }) }
          else if (msg.type === 'error') { setError(msg.error); syncInsp({ error: msg.error, running: false, active: null }) }
        }
      }
    } catch (e) { setError(e.message); syncInsp({ error: insp.error || e.message }) }
    // Settle if the stream ended without a `done` frame (error/abort/short read).
    if (!settled) {
      setConversation([...newConv, { ...base, turns: [...turns], content: finalText, streaming: false, progress: null }])
    }
    syncInsp({ running: false, active: null })
  }

  const saveThread = async () => {
    if (!conversation.length) return
    const content = conversation.map(m => {
      const who = m.role === 'user' ? 'Director' : (m.council ? `Council (${(m.members || []).join(', ')})` : (m.model || currentModel?.name || 'Assistant'))
      return `**${who}:** ${m.content}`
    }).join('\n\n')
    try {
      await fetch('/api/threads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Chat — ${new Date().toLocaleDateString()}`, content, tags: ['chat', selectedModel] }),
      })
      setSaveNote('Saved'); loadThreads()
    } catch { setSaveNote('Save failed') }
    setTimeout(() => setSaveNote(null), 3000)
  }

  return (
    <div style={{ display: 'flex', height: '100%', gap: 14, position: 'relative', minWidth: 0 }}>

      {/* ── Left mini-rail: New chat + recent ── */}
      <div style={{ width: 190, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <button
          onClick={newChat}
          disabled={streaming}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px',
            background: 'var(--color-active-bg)', color: 'var(--color-active-text)',
            border: '0.5px solid var(--color-active-border)', borderRadius: 8,
            fontSize: 13, fontWeight: 500, cursor: streaming ? 'default' : 'pointer',
            opacity: streaming ? 0.55 : 1,
          }}
        >
          <i className="ti ti-plus" style={{ fontSize: 15 }} /> New chat
        </button>

        <button
          onClick={() => setShowThreads(s => !s)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
            background: 'none', border: 'none', color: 'var(--color-text-3)',
            fontSize: 11, cursor: 'pointer', letterSpacing: '0.04em',
          }}
        >
          <i className={`ti ti-${showThreads ? 'chevron-down' : 'chevron-right'}`} style={{ fontSize: 12 }} />
          RECENT ({threads.length})
        </button>
        {showThreads && (
          <div className="scroll-y" style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 320, overflowY: 'auto' }}>
            {threads.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--color-text-3)', padding: '4px 8px' }}>No saved chats yet.</div>
            )}
            {threads.slice(0, 40).map(t => (
              <button
                key={t.id}
                onClick={() => setViewingThread(t)}
                title={t.title}
                style={{
                  textAlign: 'left', background: viewingThread?.id === t.id ? 'var(--color-border)' : 'none',
                  border: 'none', borderRadius: 5, padding: '5px 8px', cursor: 'pointer',
                  color: 'var(--color-text-2)', fontSize: 12, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >{t.title || t.id}</button>
            ))}
          </div>
        )}
      </div>

      {/* Thread reader overlay (read-only — restoring structured messages is a follow-up) */}
      {viewingThread && (
        <div style={{
          position: 'absolute', left: 204, top: 8, width: 420, maxHeight: '82%', zIndex: 120,
          background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border-strong)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: 10, borderBottom: '0.5px solid var(--color-border)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ flex: 1, fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{viewingThread.title}</span>
            <button onClick={() => setViewingThread(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', fontSize: 16 }}>
              <i className="ti ti-x" />
            </button>
          </div>
          <div className="scroll-y" style={{ padding: 12, overflowY: 'auto', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--color-text-2)' }}>
            {viewingThread.content || '(empty)'}
          </div>
        </div>
      )}

      {/* ── Center: conversation + composer ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, maxWidth: 900 }}>
        <div className="scroll-y" style={{ flex: 1, overflowY: 'auto', padding: '0 4px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 200 }}>
          {conversation.length === 0 ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--color-text-3)', maxWidth: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-brain" style={{ fontSize: 34, opacity: 0.6 }} />
              {noneAvailable ? (
                <>
                  <div style={{ fontSize: 13, color: 'var(--color-text-2)' }}>No models are available yet.</div>
                  <div style={{ fontSize: 12 }}>Cloud models need an API key; local models need Ollama running.</div>
                  {onNav && (
                    <button onClick={() => onNav('settings')} className="btn-ghost" style={{ marginTop: 6, background: 'none', border: '0.5px solid var(--color-border-strong)', borderRadius: 6, padding: '6px 14px', fontSize: 12, color: 'var(--color-text-2)' }}>Open Settings</button>
                  )}
                </>
              ) : (
                <>
                  <div style={{ fontSize: 14, color: 'var(--color-text-2)' }}>Talk to the Brain</div>
                  <div style={{ fontSize: 12, lineHeight: 1.5 }}>Ask anything. Add a second model with <i className="ti ti-plus" style={{ fontSize: 11 }} /> to convene the Council — the members answer and the Brain synthesizes.</div>
                </>
              )}
            </div>
          ) : (
            conversation.map((msg, i) => <ChatMessage key={i} msg={msg} />)
          )}
          <div ref={bottomRef} />
        </div>

        {error && (
          <div style={{ margin: '8px 0', padding: '8px 12px', background: 'var(--color-escalation-bg)', color: 'var(--color-escalation-text)', borderRadius: 6, fontSize: 12 }}>
            <i className="ti ti-alert-triangle" style={{ marginRight: 5 }} />{error}
          </div>
        )}

        {/* Composer */}
        <div style={{ borderTop: '0.5px solid var(--color-border)', marginTop: 8, paddingTop: 10 }}>
          {/* Controls row: Brain picker + council chips + add */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap', position: 'relative' }}>
            <button
              onClick={() => setShowModelPicker(s => !s)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-surface)', border: '0.5px solid var(--color-border-strong)', borderRadius: 999, padding: '4px 11px', fontSize: 12, color: 'var(--color-text)', cursor: 'pointer' }}
            >
              <i className="ti ti-brain" style={{ fontSize: 13, color: 'var(--color-accent-text)' }} />
              {currentModel?.name || 'Select a model'}
              {brainId && selectedModel === brainId && <span style={{ fontSize: 9, color: 'var(--color-text-3)', letterSpacing: '0.06em' }}>BRAIN</span>}
              <i className="ti ti-chevron-down" style={{ fontSize: 12, color: 'var(--color-text-3)' }} />
            </button>

            {council.map(id => {
              const m = models.find(x => x.id === id)
              return (
                <span key={id} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--color-recursive-bg)', border: '0.5px solid var(--color-recursive-border)', borderRadius: 999, padding: '3px 8px', fontSize: 11, color: 'var(--color-recursive-text)' }}>
                  {m?.name || id}
                  <button onClick={() => toggleCouncil(id)} aria-label={`Remove ${m?.name || id}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 12, padding: 0, display: 'flex' }}>
                    <i className="ti ti-x" style={{ fontSize: 11 }} />
                  </button>
                </span>
              )
            })}

            <button
              onClick={() => setShowAdd(s => !s)}
              title="Add a model to convene the Council"
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '0.5px dashed var(--color-border-strong)', borderRadius: 999, padding: '4px 10px', fontSize: 12, color: 'var(--color-text-2)', cursor: 'pointer' }}
            >
              <i className="ti ti-plus" style={{ fontSize: 13 }} /> {councilActive ? 'Add' : 'Council'}
            </button>

            {councilActive && (
              <span style={{ fontSize: 10, color: 'var(--color-text-3)', letterSpacing: '0.03em' }}>
                Council · {1 + council.length} models · roundtable
              </span>
            )}

            {/* Model picker popover (Brain) */}
            {showModelPicker && (
              <div style={{ position: 'absolute', bottom: '110%', left: 0, width: 300, zIndex: 110, background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border-strong)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
                <div className="scroll-y" style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {models.map(m => (
                    <div
                      key={m.id}
                      onClick={() => { if (!m.available) return; setSelectedModel(m.id); setCouncil(c => c.filter(x => x !== m.id)); setShowModelPicker(false) }}
                      style={{ padding: '8px 12px', cursor: m.available ? 'pointer' : 'not-allowed', opacity: m.available ? 1 : 0.45, background: selectedModel === m.id ? 'var(--color-active-bg)' : 'none', borderBottom: '0.5px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}
                      title={!m.available && m.unavailableReason ? m.unavailableReason : undefined}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: m.available ? 'var(--color-available)' : 'var(--color-unavailable)' }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: selectedModel === m.id ? 500 : 400 }}>{m.name}{brainId === m.id ? ' · Brain' : ''}</div>
                        {m.description && <div style={{ fontSize: 10, color: 'var(--color-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.description}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add-to-council popover */}
            {showAdd && (
              <div style={{ position: 'absolute', bottom: '110%', left: 0, width: 300, zIndex: 110, background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border-strong)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', borderBottom: '0.5px solid var(--color-border)', fontSize: 11, color: 'var(--color-text-3)' }}>Add models to the Council</div>
                <div className="scroll-y" style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {available.filter(m => m.id !== selectedModel).length === 0 && (
                    <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--color-text-3)' }}>No other models available.</div>
                  )}
                  {available.filter(m => m.id !== selectedModel).map(m => {
                    const on = council.includes(m.id)
                    return (
                      <div key={m.id} onClick={() => toggleCouncil(m.id)} style={{ padding: '8px 12px', cursor: 'pointer', background: on ? 'var(--color-active-bg)' : 'none', borderBottom: '0.5px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className={`ti ${on ? 'ti-check' : 'ti-plus'}`} style={{ fontSize: 13, color: on ? 'var(--color-active-text)' : 'var(--color-text-3)' }} />
                        <span style={{ fontSize: 12 }}>{m.name}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={councilActive ? `Ask the Council (${1 + council.length} models)…` : `Message ${currentModel?.name || 'the Brain'}…`}
              rows={3}
              style={{ flex: 1, resize: 'none', fontSize: 13, lineHeight: 1.5, padding: '8px 10px', border: '0.5px solid var(--color-border-strong)', borderRadius: 8, background: 'var(--color-surface)', color: 'var(--color-text)', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                onClick={send}
                disabled={!input.trim() || !selectedModel || streaming}
                style={{ padding: '8px 14px', background: streaming ? 'var(--color-surface-2)' : 'var(--color-active-bg)', color: streaming ? 'var(--color-text-3)' : 'var(--color-active-text)', border: streaming ? '0.5px solid var(--color-border)' : '0.5px solid var(--color-active-border)', borderRadius: 8, fontSize: 13, cursor: (!input.trim() || !selectedModel || streaming) ? 'default' : 'pointer', opacity: (!input.trim() || !selectedModel) && !streaming ? 0.55 : 1, display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <i className={`ti ${streaming ? 'ti-loader-2 spin' : 'ti-send'}`} style={{ fontSize: 15 }} />
                {streaming ? '…' : 'Send'}
              </button>
              {conversation.length > 0 && !streaming && (
                <button onClick={saveThread} className="btn-ghost" style={{ padding: '5px 10px', background: 'none', border: '0.5px solid var(--color-border-strong)', borderRadius: 8, fontSize: 11, color: saveNote ? 'var(--color-available)' : 'var(--color-text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                  <i className={`ti ${saveNote ? 'ti-check' : 'ti-bookmark'}`} style={{ fontSize: 13 }} /> {saveNote || 'Save'}
                </button>
              )}
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 4 }}>
            Enter to send · Shift+Enter for new line{councilActive ? ' · Council answers this message (not prior turns), then synthesizes' : ''}
          </div>
        </div>
      </div>

      {/* ── Right rail: Council inspector (T11) — docks open when a 2nd model joins ── */}
      <CouncilInspector run={councilRun} open={inspectorOpen} onToggle={() => setInspectorOpen(o => !o)} />
    </div>
  )
}

function ChatMessage({ msg }) {
  const isUser = msg.role === 'user'
  const [showTurns, setShowTurns] = useState(false)
  const turns = msg.turns || []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-3)', padding: '0 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
        {isUser ? 'Director' : (msg.council ? `Council${msg.finalModel ? ` · synthesized by ${msg.finalModel}` : ''}` : `Assistant${msg.model ? ` (${msg.model})` : ''}`)}
        {msg.streaming && <i className="ti ti-loader-2 spin" style={{ fontSize: 11 }} />}
      </div>

      {/* Council progress + collapsible member turns */}
      {!isUser && msg.council && (msg.progress || turns.length > 0) && (
        <div style={{ maxWidth: '90%', width: '100%', marginBottom: 2 }}>
          {msg.progress && (
            <div style={{ fontSize: 11, color: 'var(--color-text-3)', padding: '2px 4px', fontStyle: 'italic' }}>{msg.progress}</div>
          )}
          {turns.length > 0 && (
            <div>
              <button onClick={() => setShowTurns(s => !s)} style={{ background: 'none', border: 'none', color: 'var(--color-text-3)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px' }}>
                <i className={`ti ti-${showTurns ? 'chevron-down' : 'chevron-right'}`} style={{ fontSize: 11 }} />
                {turns.length} member turn{turns.length > 1 ? 's' : ''}
              </button>
              {showTurns && turns.map((t, i) => (
                <div key={i} style={{ borderLeft: '2px solid var(--color-border-strong)', margin: '4px 0 4px 8px', padding: '4px 10px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: t.error ? 'var(--color-escalation-text)' : 'var(--color-text-2)' }}>{t.model}{t.error ? ' — error' : ''}</div>
                  <div style={{ fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--color-text-2)', marginTop: 2 }}>{t.error || t.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(msg.content || (msg.streaming && !msg.council)) && (
        <div style={{
          maxWidth: '90%', padding: '10px 14px',
          background: isUser ? 'var(--color-active-bg)' : 'var(--color-surface)',
          color: isUser ? 'var(--color-active-text)' : 'var(--color-text)',
          border: isUser ? '0.5px solid var(--color-active-border)' : '0.5px solid var(--color-border)',
          borderRadius: isUser ? '12px 12px 4px 12px' : '4px 12px 12px 12px',
          fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {msg.content || (msg.streaming ? '…' : '')}
        </div>
      )}

      {!isUser && !msg.streaming && msg.content && (
        <button onClick={() => navigator.clipboard.writeText(msg.content)} style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--color-text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, padding: '0 4px' }}>
          <i className="ti ti-copy" style={{ fontSize: 13 }} /> Copy
        </button>
      )}
    </div>
  )
}
