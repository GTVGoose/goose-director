import { useState, useEffect, useCallback } from 'react'

// Automations — scheduled prompts that run themselves (shared core, both
// lineages). Replaces the Invoke/Council sidebar entries: one-off work happens
// in Chat now; this surface owns the RECURRING work — morning briefs, digests,
// watch checks — the way chat apps do "scheduled tasks / routines". Runs are
// tool-less by design (see automations.mjs).

const card = {
  background: 'var(--color-surface)',
  border: '0.5px solid var(--color-border)',
  borderRadius: 8,
  padding: 24,
  marginBottom: 16,
}
const btn = {
  background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border-strong)',
  borderRadius: 6, padding: '7px 16px', fontSize: 12, fontWeight: 500, color: 'var(--color-text)', cursor: 'pointer',
}
const btnGhost = { ...btn, background: 'none', border: '0.5px solid var(--color-border-mid)', color: 'var(--color-text-2)' }

function scheduleLabel(s) {
  if (!s) return '—'
  if (s.kind === 'daily') return `daily at ${s.at}`
  const m = s.everyMinutes
  if (m % 1440 === 0) return `every ${m / 1440} day${m > 1440 ? 's' : ''}`
  if (m % 60 === 0) return `every ${m / 60} hour${m > 60 ? 's' : ''}`
  return `every ${m} min`
}

function Md({ text }) {
  // ultra-light rendering for run results: headings/bold/bullets as text blocks
  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--color-text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {String(text || '')}
    </div>
  )
}

function CreateCard({ models, onCreated }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState('daily')
  const [at, setAt] = useState('08:30')
  const [every, setEvery] = useState('60')
  const [modelId, setModelId] = useState('')
  const [msg, setMsg] = useState(null)

  const create = async () => {
    setMsg(null)
    const schedule = mode === 'daily' ? { kind: 'daily', at } : { kind: 'interval', everyMinutes: Number(every) }
    try {
      const r = await fetch('/api/automations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, prompt, schedule, modelId: modelId || null }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed')
      setName(''); setPrompt(''); setOpen(false)
      onCreated()
    } catch (e) { setMsg({ ok: false, text: e.message }) }
  }

  if (!open) return (
    <div style={{ marginBottom: 16 }}>
      <button style={btn} onClick={() => setOpen(true)}><i className="ti ti-plus" /> New automation</button>
    </div>
  )
  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>New automation</div>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Name — e.g. Morning brief" style={{ width: '100%', marginBottom: 10 }} />
      <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}
        placeholder="The prompt to run on schedule — e.g. Summarize what matters today for a solo founder shipping an AI console: one paragraph, three priorities."
        style={{ width: '100%', fontSize: 12.5, marginBottom: 10 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <select value={mode} onChange={e => setMode(e.target.value)} style={{ fontSize: 12 }}>
          <option value="daily">Daily at…</option>
          <option value="interval">Every…</option>
        </select>
        {mode === 'daily'
          ? <input type="time" value={at} onChange={e => setAt(e.target.value)} style={{ fontSize: 12 }} />
          : <select value={every} onChange={e => setEvery(e.target.value)} style={{ fontSize: 12 }}>
              <option value="30">30 minutes</option>
              <option value="60">hour</option>
              <option value="180">3 hours</option>
              <option value="360">6 hours</option>
              <option value="720">12 hours</option>
              <option value="1440">day</option>
            </select>}
        <select value={modelId} onChange={e => setModelId(e.target.value)} style={{ fontSize: 12 }}>
          <option value="">Model: the Brain (default)</option>
          {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button style={btn} onClick={create}>Create</button>
        <button style={btnGhost} onClick={() => setOpen(false)}>Cancel</button>
        {msg && <span style={{ fontSize: 12, color: 'var(--color-unavailable)' }}>{msg.text}</span>}
      </div>
    </div>
  )
}

function Row({ a, onChanged }) {
  const [openRun, setOpenRun] = useState(false)
  const [busy, setBusy] = useState(false)
  const latest = (a.runs || [])[0]

  const patch = async (body) => {
    await fetch(`/api/automations/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {})
    onChanged()
  }
  const runNow = async () => {
    setBusy(true)
    await fetch(`/api/automations/${a.id}/run`, { method: 'POST' }).catch(() => {})
    setBusy(false)
    setOpenRun(true)
    onChanged()
  }
  const del = async () => {
    if (!window.confirm(`Delete "${a.name}" and its run history?`)) return
    await fetch(`/api/automations/${a.id}`, { method: 'DELETE' }).catch(() => {})
    onChanged()
  }

  return (
    <div style={{ borderTop: '0.5px solid var(--color-border)', padding: '12px 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} title={a.enabled ? 'Enabled' : 'Paused'}>
          <input type="checkbox" checked={!!a.enabled} onChange={e => patch({ enabled: e.target.checked })} style={{ width: 'auto' }} />
        </label>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 550, display: 'flex', alignItems: 'center', gap: 8 }}>
            {a.name}
            {a.unread && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-accent, #7c6cf0)' }} title="New result" />}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
            {scheduleLabel(a.schedule)}{a.lastRun ? ` · last ran ${new Date(a.lastRun).toLocaleString()}` : ' · never ran'}
            {latest && !latest.ok && <span style={{ color: 'var(--color-unavailable)' }}> · last run failed</span>}
          </div>
        </div>
        <button style={btnGhost} disabled={busy} onClick={runNow}>{busy ? 'Running…' : 'Run now'}</button>
        {latest && <button style={btnGhost} onClick={() => { setOpenRun(o => !o); if (a.unread) patch({ markRead: true }) }}>
          {openRun ? 'Hide result' : 'Latest result'}
        </button>}
        <button style={{ ...btnGhost, color: 'var(--color-unavailable)' }} onClick={del}><i className="ti ti-trash" /></button>
      </div>
      {openRun && latest && (
        <div style={{ margin: '10px 0 4px 30px', padding: 14, border: '0.5px solid var(--color-border)', borderRadius: 6, maxHeight: 380, overflowY: 'auto' }}>
          <div style={{ fontSize: 10.5, color: 'var(--color-text-3)', marginBottom: 8 }}>
            {new Date(latest.t).toLocaleString()} · {latest.ok ? latest.model : 'failed'}
          </div>
          {latest.ok ? <Md text={latest.text} /> : <div style={{ fontSize: 12, color: 'var(--color-unavailable)' }}>{latest.error}</div>}
        </div>
      )}
    </div>
  )
}

export default function Automations() {
  const [items, setItems] = useState([])
  const [models, setModels] = useState([])

  const refresh = useCallback(() => {
    fetch('/api/automations').then(r => r.json()).then(d => setItems(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])
  useEffect(() => {
    refresh()
    fetch('/api/config').then(r => r.json()).then(() => {}).catch(() => {})
    fetch('/api/models').then(r => r.json()).then(d => setModels(Array.isArray(d) ? d : (d.models || []))).catch(() => {})
    const iv = setInterval(refresh, 20_000)
    return () => clearInterval(iv)
  }, [refresh])

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <CreateCard models={models} onCreated={refresh} />
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Automations</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 12, lineHeight: 1.5 }}>
          Prompts that run themselves on a schedule — a morning brief, a daily digest, a recurring check.
          Runs are text-only (no tools) and land here; one-off work belongs in Chat.
        </div>
        {!items.length && <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>Nothing yet — create your first automation above.</div>}
        {items.map(a => <Row key={a.id} a={a} onChanged={refresh} />)}
      </div>
    </div>
  )
}
