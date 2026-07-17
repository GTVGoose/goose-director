import { useState, useEffect, useRef } from 'react'
import CouncilInspector from './CouncilInspector'
import { clickable } from '../lib/a11y.js'

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
// T15/T16: provider identity colors for the cloud-unit dots (visual distinctness per
// model family) + the unit-strip animations. Pure presentation; documented default
// palette — swap freely at G7.
const PROVIDER_COLOR = {
  anthropic: '#d97757', 'claude-code': '#d97757', openai: '#10a37f',
  gemini: '#4c8bf5', deepseek: '#5b6cff', mistral: '#fa8b2a',
  qwen: '#a855f7', ollama: '#4a9c59',
}
const providerColor = (p) => PROVIDER_COLOR[p] || '#8a8a94'
// Each cloud family gets its own glyph, same line style as the brain: Claude sparkles,
// OpenAI atom, Gemini diamonds, DeepSeek fish (the whale), Mistral wind, Qwen hex-Q.
const PROVIDER_ICON = {
  anthropic: 'ti-sparkles', 'claude-code': 'ti-sparkles', openai: 'ti-atom',
  gemini: 'ti-diamonds', deepseek: 'ti-fish', mistral: 'ti-wind',
  qwen: 'ti-hexagon-letter-q', ollama: 'ti-cpu',
}
const providerIcon = (p) => PROVIDER_ICON[p] || 'ti-cloud'
const UNIT_CSS = `
@keyframes nxPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(var(--color-glow-rgb),0); } 50% { box-shadow: 0 0 14px 3px rgba(var(--color-glow-rgb),0.45); } }
@keyframes nxDotGlow { 0%,100% { box-shadow: 0 0 2px 0 var(--dotc); transform: scale(1); } 50% { box-shadow: 0 0 12px 3px var(--dotc); transform: scale(1.12); } }
@keyframes nxNeuron { 0% { left: -3px; opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { left: calc(100% - 4px); opacity: 0; } }
.nx-pulse { animation: nxPulse 1.5s ease-in-out infinite; }
.nx-active-dot { animation: nxDotGlow 1.2s ease-in-out infinite; }
.nx-neuron { position: absolute; top: -2.5px; width: 7px; height: 7px; border-radius: 50%; background: rgba(var(--color-glow-rgb),0.95); box-shadow: 0 0 6px 1px rgba(var(--color-glow-rgb),0.7); animation: nxNeuron 1.25s linear infinite; }
.nx-node { transition: border-color .25s ease, box-shadow .25s ease, transform .18s ease, background .25s ease; }
.nx-node:hover { transform: translateY(-1px); border-color: var(--color-active-border) !important; }
.nx-path { transition: background .3s ease; }
`
// Working phrases — Goose-flavored (the flock as actor: geese trade the lead in the V,
// exactly what the council does). Brand voice, no lore. Rotates while the unit works.
const PHRASES = ['the wind takes it…', 'the V forms…', 'trading the lead…', 'riding the draft…', 'coming in to land…']

// T17: cost-meter formatters. Costs are ESTIMATES from the server's built-in pricing
// table (see /api/usage + recordUsage); scale the precision so tiny spends stay legible.
const fmtUSD = (n) => {
  const v = Number(n) || 0
  if (v === 0) return '$0.00'
  if (v < 0.01) return '$' + v.toFixed(4)
  if (v < 1) return '$' + v.toFixed(3)
  return '$' + v.toFixed(2)
}
const fmtTok = (n) => (Number(n) || 0).toLocaleString('en-US')

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
  // T15/T16 unit strip: which part of the unit is working right now (drives the
  // pulse/neuron animations), the local-model "representation" node, and the
  // rotating status phrase. All presentation — the run protocol is unchanged.
  const [unit, setUnit] = useState({ brain: false, local: false, cloud: false, activeName: null })
  const [localPick, setLocalPick] = useState('')       // which local (ollama) model the local node represents
  const [showLocalPicker, setShowLocalPicker] = useState(false)
  const [phraseIdx, setPhraseIdx] = useState(0)
  // T17 cost meter: live /api/usage snapshot, the last-turn spend delta, and the
  // breakdown popover. Usage surfaces NOWHERE else in the UI today (audit: server has
  // /api/usage, no view reads it), so this readout + popover IS the spend surface.
  const [usage, setUsage] = useState(null)
  const [usageDelta, setUsageDelta] = useState(null)
  const [showUsage, setShowUsage] = useState(false)
  const bottomRef = useRef(null)

  // Fetch the roster. Availability is probed server-side (cached ~5 min) and can flip
  // as keys/balances/rate-limits change, so this ALSO runs when a picker opens — a
  // transient probe failure at boot must not hide a provider for the whole session.
  // On refresh (initial=false) the current Brain/local/council picks are preserved.
  const loadModels = (initial = false) => {
    fetch('/api/models').then(r => r.json()).then(d => {
      const ms = d.models || []
      setModels(ms)
      setBrainId(d.brainId || null)
      if (initial) {
        const first = ms.find(m => m.available && m.id === d.brainId) || ms.find(m => m.available)
        if (first) setSelectedModel(first.id)
      }
      setLocalPick(lp => {
        if (lp && ms.some(m => m.id === lp && m.provider === 'ollama')) return lp
        const firstLocal = ms.find(m => m.provider === 'ollama' && m.available) || ms.find(m => m.provider === 'ollama')
        return firstLocal ? firstLocal.id : lp
      })
    }).catch(() => {})
  }

  useEffect(() => {
    loadModels(true)
    loadThreads()
    fetchUsage()
  }, [])

  // T17: keep the meter moving while a turn is in flight (server accrues spend as
  // members answer), then send() settles it with a per-turn delta. Cheap: one GET/3s,
  // only while streaming.
  useEffect(() => {
    if (!streaming) return
    const t = setInterval(fetchUsage, 3000)
    return () => clearInterval(t)
  }, [streaming])

  const fetchUsage = () => fetch('/api/usage').then(r => r.json()).then(setUsage).catch(() => {})

  // Rotate the thinking phrase while anything in the unit is working (T16).
  useEffect(() => {
    if (!streaming) { setPhraseIdx(0); return }
    const t = setInterval(() => setPhraseIdx(i => i + 1), 2200)
    return () => clearInterval(t)
  }, [streaming])

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

  // T15 unit-strip derivations. The strip is pure presentation over the same
  // selectedModel/council state — the run protocol is untouched.
  const localModels = models.filter(m => m.provider === 'ollama')
  const localModel = models.find(m => m.id === localPick && m.provider === 'ollama') || localModels[0] || null
  const localInUnit = !!localModel && (localModel.id === selectedModel || council.includes(localModel.id))
  const cloudRoster = models.filter(m => m.provider !== 'ollama' && m.id !== selectedModel)
  const cloudMemberCount = council.filter(id => models.find(m => m.id === id)?.provider !== 'ollama').length
  // Bubble shows at most 5 dots (members first, then available) + a "+N" overflow badge,
  // so the strip stays one calm line even with many providers configured.
  const cloudDots = [...cloudRoster]
    .sort((a, b) => (council.includes(b.id) - council.includes(a.id)) || (b.available - a.available))
    .slice(0, 5)
  const cloudOverflow = cloudRoster.length - cloudDots.length
  const phrase = PHRASES[phraseIdx % PHRASES.length]
  const unitWorking = unit.brain || unit.local || unit.cloud
  const unitStatusLine = unitWorking
    ? `${unit.activeName || (unit.brain ? (currentModel?.name || 'Brain') : unit.local ? (localModel?.name || 'Local model') : 'Cloud unit')} — ${phrase}`
    : councilActive ? `Unit assembled · ${1 + council.length} minds · roundtable` : null

  const toggleCouncil = (id) =>
    setCouncil(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id])

  // Local node: picking a model makes it the node's representation AND swaps it
  // into the unit in place of any other local member; picking it again stands it down.
  const chooseLocal = (id) => {
    setLocalPick(id)
    setShowLocalPicker(false)
    if (id === selectedModel) return // it IS the Brain — already in the unit
    setCouncil(c => {
      const nonLocal = c.filter(x => models.find(mm => mm.id === x)?.provider !== 'ollama')
      return c.includes(id) ? nonLocal : [...nonLocal, id]
    })
  }

  const newChat = () => {
    if (streaming) return
    setConversation([]); setInput(''); setError(null); setCouncil([]); setSaveNote(null); setViewingThread(null); setCouncilRun(null); setUsageDelta(null)
  }

  const send = async () => {
    if (!input.trim() || !selectedModel || streaming) return
    const userMsg = { role: 'user', content: input.trim() }
    const newConv = [...conversation, userMsg]
    setConversation(newConv)
    setInput('')
    setStreaming(true)
    setError(null)
    // T17: baseline the meter before the turn so we can show a per-turn delta after.
    const baseCost = usage?.costUSD || 0
    const baseTok = (usage?.inTok || 0) + (usage?.outTok || 0)
    try {
      if (councilActive) await runCouncil(newConv, userMsg.content)
      else await runSolo(newConv)
    } finally {
      setStreaming(false)
      // Settle the meter with a fresh read + this turn's delta (best-effort).
      try {
        const fresh = await fetch('/api/usage').then(r => r.json())
        setUsage(fresh)
        const dCost = (fresh.costUSD || 0) - baseCost
        const dTok = ((fresh.inTok || 0) + (fresh.outTok || 0)) - baseTok
        if (dCost > 0 || dTok > 0) setUsageDelta({ cost: dCost, tok: dTok })
      } catch {}
    }
  }

  // Solo turn — reuse the Invoke /api/relay streaming path.
  const runSolo = async (newConv) => {
    let assistantText = ''
    setConversation([...newConv, { role: 'assistant', content: '', streaming: true }])
    // T16: light up whichever node is actually answering — the Brain, unless the
    // selected model is a local (ollama) one, in which case the local node works.
    const soloIsLocal = models.find(m => m.id === selectedModel)?.provider === 'ollama'
    setUnit({ brain: !soloIsLocal, local: soloIsLocal, cloud: false, activeName: null })
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
    setUnit({ brain: false, local: false, cloud: false, activeName: null })
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
          if (msg.type === 'status') {
            paint({ progress: msg.message }); syncInsp({ status: msg.message })
            // T16: an aggregator-phase status (synthesize/judge/compose) means the Brain
            // is working — same detection the inspector uses for every mode.
            if (/synthesi|judg|compos/i.test(msg.message || '')) setUnit({ brain: true, local: false, cloud: false, activeName: null })
          }
          else if (msg.type === 'turn-start') {
            paint({ progress: `${msg.model} is responding…` }); syncInsp({ active: { model: msg.model, phase: msg.phase, round: msg.round, subtask: msg.subtask }, status: `${msg.model} is responding…` })
            // T16: light the node that owns this member (SSE carries the display name).
            const mm = models.find(x => x.name === msg.model)
            const isLocal = mm?.provider === 'ollama'
            setUnit({ brain: false, local: isLocal, cloud: !isLocal, activeName: msg.model })
          }
          else if (msg.type === 'turn') { turns.push({ model: msg.model, text: msg.text, phase: msg.phase, round: msg.round, subtask: msg.subtask }); paint({ progress: `${msg.model} answered` }); syncInsp({ active: null, status: `${msg.model} answered` }); setUnit(u => ({ ...u, activeName: null })) }
          else if (msg.type === 'turn-error') {
            // An aggregator-phase failure (synthesize/judge/compose) means there will be
            // NO `final` — surface it at the top level instead of burying it as one more
            // member turn (the member turns still show in the collapsible list + inspector).
            const aggPhase = msg.phase === 'synthesize' || msg.phase === 'judge' || msg.phase === 'compose'
            if (aggPhase) setError(`Synthesis failed: ${msg.error}`)
            turns.push({ model: msg.model, error: msg.error, phase: msg.phase }); paint({})
            syncInsp({ active: null, ...(aggPhase ? { error: `Synthesis failed: ${msg.error}` } : {}) })
            setUnit(u => ({ ...u, activeName: null }))
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
    setUnit({ brain: false, local: false, cloud: false, activeName: null })
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
            border: '0.5px solid var(--color-active-border)', borderRadius: 'var(--radius-8)',
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
                  border: 'none', borderRadius: 'var(--radius-5)', padding: '5px 8px', cursor: 'pointer',
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
          position: 'absolute', left: 204, right: 12, top: 8, maxWidth: 420, maxHeight: '82%', zIndex: 120,
          background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border-strong)',
          borderRadius: 'var(--radius-10)', boxShadow: 'var(--shadow-popover)', overflow: 'hidden',
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

        {/* ── T17 live cost meter — always visible above the conversation (default
              placement; alt considered: under the brain node in the composer strip,
              but that row is already dense with the unit picker). Session $ + tokens,
              a per-turn delta, and the full per-model breakdown one click away. ── */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end', marginBottom: 6, flexShrink: 0 }}>
          <button
            onClick={() => { setShowUsage(s => !s); fetchUsage() }}
            title="Session tokens + estimated spend (this app run). Click for the per-model breakdown."
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '4px 11px',
              background: 'var(--color-surface)', borderRadius: 'var(--radius-pill)', cursor: 'pointer', fontSize: 11,
              border: `0.5px solid ${usage?.overBudget ? 'var(--color-escalation-text)' : 'var(--color-border-strong)'}`,
              color: usage?.overBudget ? 'var(--color-escalation-text)' : 'var(--color-text-2)',
            }}
          >
            <i className="ti ti-coin" style={{ fontSize: 13, opacity: 0.8 }} />
            <span style={{ fontWeight: 600 }}>{fmtUSD(usage?.costUSD)}</span>
            <span style={{ color: 'var(--color-text-3)' }}>· {fmtTok((usage?.inTok || 0) + (usage?.outTok || 0))} tok</span>
            {usageDelta && (usageDelta.cost > 0 || usageDelta.tok > 0) && (
              <span style={{ color: 'var(--color-text-3)', fontStyle: 'italic' }}>
                (+{fmtUSD(usageDelta.cost)} · +{fmtTok(usageDelta.tok)})
              </span>
            )}
            {usage?.budgetUSD > 0 && (
              <span style={{ color: usage?.overBudget ? 'var(--color-escalation-text)' : 'var(--color-text-3)' }}>
                · {fmtUSD(usage?.remainingUSD)} left
              </span>
            )}
            <i className="ti ti-chevron-down" style={{ fontSize: 10, color: 'var(--color-text-3)' }} />
          </button>

          {showUsage && (
            <div style={{ position: 'absolute', top: '112%', right: 0, width: 322, zIndex: 115, background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border-strong)', borderRadius: 'var(--radius-10)', boxShadow: 'var(--shadow-popover)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', borderBottom: '0.5px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>Session spend</span>
                <button
                  onClick={async () => { try { await fetch('/api/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reset: true }) }) } catch {} setUsageDelta(null); fetchUsage() }}
                  className="btn-ghost"
                  style={{ background: 'none', border: '0.5px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', padding: '3px 9px', fontSize: 10, color: 'var(--color-text-3)', cursor: 'pointer' }}
                >Reset</button>
                <button onClick={() => setShowUsage(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', fontSize: 15 }}><i className="ti ti-x" /></button>
              </div>
              <div style={{ padding: '9px 12px', fontSize: 11, color: 'var(--color-text-3)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div>Total <b style={{ color: 'var(--color-text-2)' }}>{fmtUSD(usage?.costUSD)}</b> · {fmtTok(usage?.inTok)} in / {fmtTok(usage?.outTok)} out · {usage?.calls || 0} calls</div>
                {usage?.since && <div>Since {new Date(usage.since).toLocaleString()}</div>}
                {usage?.budgetUSD > 0
                  ? <div>Budget {fmtUSD(usage.budgetUSD)}/day · {fmtUSD(usage.remainingUSD)} left{usage.overBudget ? ' · over budget' : ''}</div>
                  : <div>No daily budget set</div>}
              </div>
              <div className="scroll-y" style={{ maxHeight: 220, overflowY: 'auto', borderTop: '0.5px solid var(--color-border)' }}>
                {Object.keys(usage?.byModel || {}).length === 0 ? (
                  <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--color-text-3)' }}>No spend recorded yet this session.</div>
                ) : Object.entries(usage.byModel).sort((a, b) => (b[1].costUSD || 0) - (a[1].costUSD || 0)).map(([id, b]) => {
                  const name = models.find(m => m.id === id)?.name || id
                  return (
                    <div key={id} style={{ padding: '7px 12px', borderBottom: '0.5px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <i className={`ti ${providerIcon(b.provider)}`} style={{ fontSize: 13, color: providerColor(b.provider), flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                        <div style={{ fontSize: 10, color: 'var(--color-text-3)' }}>{fmtTok((b.inTok || 0) + (b.outTok || 0))} tok · {b.calls || 0} calls</div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)' }}>{fmtUSD(b.costUSD)}</span>
                    </div>
                  )
                })}
              </div>
              <div style={{ padding: '8px 12px', fontSize: 10, color: 'var(--color-text-3)', borderTop: '0.5px solid var(--color-border)' }}>
                Estimates from the built-in pricing table. Local (Ollama) runs are $0.
              </div>
            </div>
          )}
        </div>

        <div className="scroll-y" style={{ flex: 1, overflowY: 'auto', padding: '0 4px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 200 }}>
          {conversation.length === 0 ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--color-text-3)', maxWidth: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-brain" style={{ fontSize: 34, opacity: 0.6 }} />
              {noneAvailable ? (
                <>
                  <div style={{ fontSize: 13, color: 'var(--color-text-2)' }}>No models are available yet.</div>
                  <div style={{ fontSize: 12 }}>Cloud models need an API key; local models need Ollama running.</div>
                  {onNav && (
                    <button onClick={() => onNav('settings')} className="btn-ghost" style={{ marginTop: 6, background: 'none', border: '0.5px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', padding: '6px 14px', fontSize: 12, color: 'var(--color-text-2)' }}>Open Settings</button>
                  )}
                </>
              ) : (
                <>
                  <div style={{ fontSize: 14, color: 'var(--color-text-2)' }}>What are we working on?</div>
                  <div style={{ fontSize: 12, lineHeight: 1.5 }}>You're speaking to the Brain — it conducts the whole unit. Tap the local node or the cloud bubble by the composer to bring more minds in; the Brain synthesizes what they return.</div>
                </>
              )}
            </div>
          ) : (
            conversation.map((msg, i) => <ChatMessage key={i} msg={msg} />)
          )}
          <div ref={bottomRef} />
        </div>

        {error && (
          <div style={{ margin: '8px 0', padding: '8px 12px', background: 'var(--color-escalation-bg)', color: 'var(--color-escalation-text)', borderRadius: 'var(--radius-md)', fontSize: 12 }}>
            <i className="ti ti-alert-triangle" style={{ marginRight: 5 }} />{error}
          </div>
        )}

        {/* Composer */}
        <div style={{ borderTop: '0.5px solid var(--color-border)', marginTop: 8, paddingTop: 10 }}>
          {/* ── T15 unit strip: Brain ─ neuron path ─ local node ─ path ─ cloud bubble.
                The whole unit is visible in one glance; T16 animations show who is
                working (pulse on the node, neuron traveling down the live path,
                rotating status phrase) without opening the inspector. ── */}
          <style>{UNIT_CSS}</style>
          <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 2, position: 'relative', minHeight: 66, width: '100%' }}>

            {/* Brain node */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 104, minWidth: 44, flexShrink: 1 }}>
              <button
                onClick={() => { if (!showModelPicker) loadModels(); setShowModelPicker(s => !s); setShowAdd(false); setShowLocalPicker(false) }}
                className={`nx-node${unit.brain ? ' nx-pulse' : ''}`}
                title={`Brain — ${currentModel?.name || 'select a model'}. Conducts the unit and synthesizes. Click to change.`}
                style={{ width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', border: `1.5px solid ${unit.brain ? 'var(--color-active-border)' : 'var(--color-border-strong)'}`, cursor: 'pointer', flexShrink: 0 }}
              >
                <i className="ti ti-brain" style={{ fontSize: 22, color: 'var(--color-accent-text)' }} />
              </button>
              <div style={{ fontSize: 8, color: 'var(--color-text-3)', letterSpacing: '0.12em', fontWeight: 600 }}>BRAIN</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-2)', textAlign: 'center', lineHeight: 1.25, maxWidth: 104, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: -2 }}>
                {currentModel?.name || 'Select a model'}
              </div>
            </div>

            {/* Path: brain ↔ local — flexes so the chain spans the chat box */}
            <div className="nx-path" style={{ position: 'relative', flex: 1, minWidth: 12, height: 1.5, borderRadius: 'var(--radius-2)', marginTop: 21, background: unit.local ? 'rgba(var(--color-glow-rgb),0.4)' : 'var(--color-border-strong)' }}>
              {unit.local && <span className="nx-neuron" />}
            </div>

            {/* Local model node */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 104, minWidth: 44, flexShrink: 1 }}>
              <button
                onClick={() => { if (!showLocalPicker) loadModels(); setShowLocalPicker(s => !s); setShowAdd(false); setShowModelPicker(false) }}
                className={`nx-node${unit.local ? ' nx-pulse' : ''}`}
                title={localModel ? `Local model — ${localModel.name}${localInUnit ? ' (in the unit)' : ' (standing by)'}. Click to change or bring it in.` : 'No local model detected — is Ollama running?'}
                style={{ width: 42, height: 42, borderRadius: 'var(--radius-13)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: localInUnit ? `${providerColor('ollama')}1a` : 'var(--color-surface)', border: `1.5px ${localInUnit ? 'solid' : 'dashed'} ${unit.local ? 'var(--color-active-border)' : localInUnit ? providerColor('ollama') : 'var(--color-border-strong)'}`, cursor: 'pointer', opacity: localModel ? 1 : 0.45, flexShrink: 0 }}
              >
                <i className="ti ti-cpu" style={{ fontSize: 20, color: localInUnit ? providerColor('ollama') : 'var(--color-text-3)' }} />
              </button>
              <div style={{ fontSize: 8, color: 'var(--color-text-3)', letterSpacing: '0.12em', fontWeight: 600 }}>LOCAL</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-2)', textAlign: 'center', lineHeight: 1.25, maxWidth: 104, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: -2 }}>
                {localModel ? localModel.name : 'none found'}
              </div>
            </div>

            {/* Path: local ↔ cloud unit */}
            <div className="nx-path" style={{ position: 'relative', flex: 1, minWidth: 12, height: 1.5, borderRadius: 'var(--radius-2)', marginTop: 21, background: unit.cloud ? 'rgba(var(--color-glow-rgb),0.4)' : 'var(--color-border-strong)' }}>
              {unit.cloud && <span className="nx-neuron" />}
            </div>

            {/* Cloud unit bubble */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <button
                onClick={() => { if (!showAdd) loadModels(); setShowAdd(s => !s); setShowModelPicker(false); setShowLocalPicker(false) }}
                className={`nx-node${unit.cloud ? ' nx-pulse' : ''}`}
                title="The cloud unit. Click to add or remove council members."
                style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 16px', borderRadius: 'var(--radius-pill)', background: 'var(--color-surface)', border: `1.5px ${cloudMemberCount > 0 ? 'solid' : 'dashed'} ${unit.cloud ? 'var(--color-active-border)' : cloudMemberCount > 0 ? 'var(--color-active-border)' : 'var(--color-border-strong)'}`, cursor: 'pointer' }}
              >
                {cloudDots.map(m => {
                  const inUnit = council.includes(m.id)
                  const active = unit.activeName === m.name
                  const c = providerColor(m.provider)
                  return (
                    <span
                      key={m.id}
                      title={`${m.name}${inUnit ? ' · in the unit' : m.degraded ? ' · slow to respond' : m.available ? '' : ' · needs a key'}`}
                      className={active ? 'nx-active-dot' : ''}
                      style={{ '--dotc': c, width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: inUnit ? `${c}26` : 'transparent', border: `1.5px solid ${inUnit ? c : 'var(--color-border-strong)'}`, opacity: m.available ? 1 : 0.35 }}
                    >
                      <i className={`ti ${providerIcon(m.provider)}`} style={{ fontSize: 13, color: inUnit || active ? c : 'var(--color-text-3)' }} />
                    </span>
                  )
                })}
                {cloudOverflow > 0 && (
                  <span style={{ fontSize: 9, color: 'var(--color-text-3)', flexShrink: 0 }}>+{cloudOverflow}</span>
                )}
                <i className="ti ti-chevron-down" style={{ fontSize: 11, color: 'var(--color-text-3)' }} />
              </button>
              <div style={{ fontSize: 8, color: 'var(--color-text-3)', letterSpacing: '0.12em', fontWeight: 600 }}>CLOUD UNIT</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-2)', textAlign: 'center', lineHeight: 1.25, marginTop: -2 }}>
                {cloudMemberCount > 0 ? `${cloudMemberCount} convened` : 'tap to convene'}
              </div>
            </div>


            {/* Model picker popover (Brain) */}
            {showModelPicker && (
              <div style={{ position: 'absolute', bottom: '110%', left: 0, width: 300, zIndex: 110, background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border-strong)', borderRadius: 'var(--radius-10)', boxShadow: 'var(--shadow-popover)', overflow: 'hidden' }}>
                <div className="scroll-y" style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {models.map(m => (
                    <div
                      key={m.id}
                      {...clickable(() => { if (!m.available) return; setSelectedModel(m.id); setCouncil(c => c.filter(x => x !== m.id)); setShowModelPicker(false) }, m.available)}
                      style={{ padding: '8px 12px', cursor: m.available ? 'pointer' : 'not-allowed', opacity: m.available ? 1 : 0.45, background: selectedModel === m.id ? 'var(--color-active-bg)' : 'none', borderBottom: '0.5px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}
                      title={m.degraded ? (m.note || 'slow to respond') : (!m.available && m.unavailableReason ? m.unavailableReason : undefined)}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: m.degraded ? 'var(--color-review-text)' : m.available ? 'var(--color-available)' : 'var(--color-unavailable)' }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: selectedModel === m.id ? 500 : 400 }}>{m.name}{brainId === m.id ? ' · Brain' : ''}</div>
                        {m.description && <div style={{ fontSize: 10, color: 'var(--color-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.description}</div>}
                        {m.degraded && <div style={{ fontSize: 10, color: 'var(--color-review-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.note || 'slow to respond'}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Local-model picker popover (T15) */}
            {showLocalPicker && (
              <div style={{ position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)', width: 300, zIndex: 110, background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border-strong)', borderRadius: 'var(--radius-10)', boxShadow: 'var(--shadow-popover)', overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', borderBottom: '0.5px solid var(--color-border)', fontSize: 11, color: 'var(--color-text-3)' }}>Local model — pick one to bring it into the unit; pick it again to stand it down</div>
                <div className="scroll-y" style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {localModels.length === 0 && (
                    <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--color-text-3)' }}>No local models found — is Ollama running?</div>
                  )}
                  {localModels.map(m => {
                    const isBrain = m.id === selectedModel
                    const on = isBrain || council.includes(m.id)
                    return (
                      <div key={m.id} {...clickable(() => { if (!m.available) return; chooseLocal(m.id) }, m.available)} title={!m.available && m.unavailableReason ? m.unavailableReason : undefined} style={{ padding: '8px 12px', cursor: m.available ? 'pointer' : 'not-allowed', opacity: m.available ? 1 : 0.45, background: on ? 'var(--color-active-bg)' : 'none', borderBottom: '0.5px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className={`ti ${on ? 'ti-check' : 'ti-plus'}`} style={{ fontSize: 13, color: on ? 'var(--color-active-text)' : 'var(--color-text-3)' }} />
                        <span style={{ fontSize: 12, flex: 1 }}>{m.name}</span>
                        {isBrain && <span style={{ fontSize: 9, color: 'var(--color-text-3)', letterSpacing: '0.06em' }}>BRAIN</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Cloud-unit popover — add/remove council members (cloud models only;
                the local model has its own node, the Brain its own circle) */}
            {showAdd && (
              <div style={{ position: 'absolute', bottom: '110%', right: 0, width: 300, zIndex: 110, background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border-strong)', borderRadius: 'var(--radius-10)', boxShadow: 'var(--shadow-popover)', overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', borderBottom: '0.5px solid var(--color-border)', fontSize: 11, color: 'var(--color-text-3)' }}>Convene the cloud unit — tap to add or remove</div>
                <div className="scroll-y" style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {cloudRoster.length === 0 && (
                    <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--color-text-3)' }}>No cloud models configured.</div>
                  )}
                  {cloudRoster.map(m => {
                    const on = council.includes(m.id)
                    return (
                      <div
                        key={m.id}
                        {...clickable(() => { if (m.available) toggleCouncil(m.id) }, m.available)}
                        title={m.degraded ? (m.note || 'slow to respond') : (!m.available && m.unavailableReason ? String(m.unavailableReason) : undefined)}
                        style={{ padding: '8px 12px', cursor: m.available ? 'pointer' : 'not-allowed', opacity: m.available ? 1 : 0.45, background: on ? 'var(--color-active-bg)' : 'none', borderBottom: '0.5px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}
                      >
                        <i className={`ti ${providerIcon(m.provider)}`} style={{ fontSize: 15, flexShrink: 0, color: on ? providerColor(m.provider) : 'var(--color-text-3)' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12 }}>{m.name}</div>
                          {(m.degraded || !m.available) && <div style={{ fontSize: 10, color: m.degraded ? 'var(--color-review-text)' : 'var(--color-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.degraded ? (m.note || 'slow to respond') : String(m.unavailableReason || 'unavailable').slice(0, 60)}</div>}
                        </div>
                        <i className={`ti ${on ? 'ti-check' : 'ti-plus'}`} style={{ fontSize: 13, color: on ? 'var(--color-active-text)' : 'var(--color-text-3)' }} />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Live status line (T16) — who's working, without opening the inspector */}
          <div style={{ height: 16, marginBottom: 6, fontSize: 11, color: 'var(--color-text-3)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {unitStatusLine}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={councilActive ? `Ask the Council (${1 + council.length} models)…` : `Message ${currentModel?.name || 'the Brain'}…`}
              rows={3}
              style={{ flex: 1, resize: 'none', fontSize: 13, lineHeight: 1.5, padding: '8px 10px', border: '0.5px solid var(--color-border-strong)', borderRadius: 'var(--radius-8)', background: 'var(--color-surface)', color: 'var(--color-text)', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                onClick={send}
                disabled={!input.trim() || !selectedModel || streaming}
                style={{ padding: '8px 14px', background: streaming ? 'var(--color-surface-2)' : 'var(--color-active-bg)', color: streaming ? 'var(--color-text-3)' : 'var(--color-active-text)', border: streaming ? '0.5px solid var(--color-border)' : '0.5px solid var(--color-active-border)', borderRadius: 'var(--radius-8)', fontSize: 13, cursor: (!input.trim() || !selectedModel || streaming) ? 'default' : 'pointer', opacity: (!input.trim() || !selectedModel) && !streaming ? 0.55 : 1, display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <i className={`ti ${streaming ? 'ti-loader-2 spin' : 'ti-send'}`} style={{ fontSize: 15 }} />
                {streaming ? '…' : 'Send'}
              </button>
              {conversation.length > 0 && !streaming && (
                <button onClick={saveThread} className="btn-ghost" style={{ padding: '5px 10px', background: 'none', border: '0.5px solid var(--color-border-strong)', borderRadius: 'var(--radius-8)', fontSize: 11, color: saveNote ? 'var(--color-available)' : 'var(--color-text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
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
