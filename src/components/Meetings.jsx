import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Meetings — meeting → system-grade report appliance ──────────────────────
// Explainer until config.meetings.enabled (membrane precedent). LANDING lists
// meetings + import; DETAIL shows the report (checklist persists to
// frontmatter), transcript, export handoff, and delete. All synthesis is
// post-session and tool-less; Nexus ends at the report.

const card = {
  background: 'var(--color-surface)',
  border: '0.5px solid var(--color-border)',
  borderRadius: 8,
  padding: 24,
  marginBottom: 16,
}
const btn = {
  background: 'var(--color-surface-2)', border: '0.5px solid var(--color-border-strong)',
  borderRadius: 6, padding: '7px 16px', fontSize: 12, fontWeight: 500, color: 'var(--color-text)',
  cursor: 'pointer',
}
const btnGhost = { ...btn, background: 'none', border: '0.5px solid var(--color-border-mid)', color: 'var(--color-text-2)' }
const pill = (on) => ({
  fontSize: 10, padding: '1px 6px', borderRadius: 999, fontWeight: 600, letterSpacing: '0.04em',
  background: on ? 'rgba(72,152,96,0.15)' : 'rgba(138,132,120,0.12)',
  color: on ? 'var(--color-available)' : 'var(--color-text-3)',
  border: `0.5px solid ${on ? 'rgba(72,152,96,0.3)' : 'var(--color-border-mid)'}`,
})

// Minimal markdown renderer (headings, bold, italics, inline code, bullets,
// blockquotes, hr) — same spirit as Domains.jsx's; report bodies only.
function Md({ text }) {
  const lines = String(text || '').split('\n')
  const out = []
  let list = null
  const flush = () => { if (list) { out.push(<ul key={out.length} style={{ margin: '6px 0 10px 18px', padding: 0 }}>{list}</ul>); list = null } }
  const inline = (s) => {
    const parts = []
    let rest = s, k = 0
    const rx = /(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/
    while (rest) {
      const m = rest.match(rx)
      if (!m) { parts.push(rest); break }
      if (m.index > 0) parts.push(rest.slice(0, m.index))
      const tok = m[0]
      if (tok.startsWith('**')) parts.push(<strong key={k++}>{tok.slice(2, -2)}</strong>)
      else if (tok.startsWith('`')) parts.push(<code key={k++} style={{ background: 'var(--color-surface-2)', padding: '0 4px', borderRadius: 3, fontSize: '0.92em' }}>{tok.slice(1, -1)}</code>)
      else parts.push(<em key={k++}>{tok.slice(1, -1)}</em>)
      rest = rest.slice(m.index + tok.length)
    }
    return parts
  }
  for (const raw of lines) {
    const l = raw.trimEnd()
    if (/^\s*[-*] /.test(l)) {
      const item = l.replace(/^\s*[-*] /, '').replace(/^\[[ x]\]\s*/, '')
      ;(list = list || []).push(<li key={list.length} style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-2)', marginBottom: 3 }}>{inline(item)}</li>)
      continue
    }
    flush()
    if (!l.trim()) continue
    if (l.startsWith('### ')) out.push(<div key={out.length} style={{ fontSize: 12, fontWeight: 600, marginTop: 14, marginBottom: 4 }}>{l.slice(4)}</div>)
    else if (l.startsWith('## ')) out.push(<div key={out.length} style={{ fontSize: 13, fontWeight: 600, marginTop: 18, marginBottom: 6, letterSpacing: '0.01em' }}>{l.slice(3)}</div>)
    else if (l.startsWith('# ')) out.push(<div key={out.length} style={{ fontSize: 16, fontWeight: 650, marginBottom: 8 }}>{l.slice(2)}</div>)
    else if (l.startsWith('> ')) out.push(<div key={out.length} style={{ borderLeft: '2px solid var(--color-border-strong)', paddingLeft: 10, margin: '6px 0', fontSize: 13, fontStyle: 'italic', color: 'var(--color-text-2)' }}>{inline(l.slice(2))}</div>)
    else if (/^---+$/.test(l)) out.push(<hr key={out.length} style={{ border: 'none', borderTop: '0.5px solid var(--color-border)', margin: '14px 0' }} />)
    else out.push(<p key={out.length} style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-2)', margin: '6px 0' }}>{inline(l)}</p>)
  }
  flush()
  return <div>{out}</div>
}

function Explainer() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 650, marginBottom: 6 }}>
          <i className="ti ti-microphone" style={{ marginRight: 8 }} />Meetings
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-2)', lineHeight: 1.65 }}>
          Turn any multi-human conversation — a Google Meet, a Zoom, people in a room — into a
          <strong> system-grade report</strong>: what was discussed, who said what, the decisions,
          the action items, the disagreements. The report is both a document you read and a
          machine-readable artifact your own systems can pick up and act on.
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-3)', lineHeight: 1.6, marginTop: 14 }}>
          <strong>How it works today:</strong> import a transcript your meeting platform already made
          (Google Meet / Zoom export a <code>.vtt</code>, or paste "Name: line" text). Nexus synthesizes
          the report — locally by default. Live audio capture arrives in a later phase.
          <br /><br />
          <strong>What Nexus never does:</strong> no bot joins your call, no audio or transcript ever
          leaves this machine, and no agents act on meeting content inside Nexus — reports hand off to
          the systems <em>you</em> choose.
        </div>
        <div style={{ marginTop: 18, fontSize: 12, color: 'var(--color-text-3)' }}>
          Enable it in <strong>Settings → Meetings</strong>.
        </div>
      </div>
    </div>
  )
}

function ImportCard({ onImported }) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const fileRef = useRef(null)

  const doImport = async () => {
    if (!text.trim()) { setMsg({ ok: false, text: 'Paste a transcript or choose a file first.' }); return }
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(`/api/meetings/import?title=${encodeURIComponent(title)}`, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: text,
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Import failed')
      setMsg({ ok: true, text: `Imported — ${d.events} lines, ${d.participants.length || 'no named'} speakers.` })
      setText(''); setTitle('')
      onImported(d.id)
    } catch (e) { setMsg({ ok: false, text: e.message }) }
    setBusy(false)
  }

  const pickFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const rd = new FileReader()
    rd.onload = () => { setText(String(rd.result || '')); if (!title) setTitle(f.name.replace(/\.(vtt|txt)$/i, '')) }
    rd.readAsText(f)
    e.target.value = ''
  }

  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Import a meeting transcript</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 14, lineHeight: 1.5 }}>
        Google Meet / Zoom transcript exports (<code>.vtt</code>) or plain "Name: what they said" text.
      </div>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Meeting title (optional)"
        style={{ width: '100%', marginBottom: 10 }} />
      <textarea value={text} onChange={e => setText(e.target.value)} rows={6}
        placeholder={'WEBVTT\n00:00:01.000 --> 00:00:04.000\n<v Goose>I think we should ship the report contract first.</v>\n…or…\nGoose: I think we should ship the report contract first.\nBoris: Agreed, but the consent screen is the blocker.'}
        style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12, marginBottom: 12 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button style={btn} disabled={busy} onClick={doImport}>{busy ? 'Importing…' : 'Import'}</button>
        <button style={btnGhost} onClick={() => fileRef.current?.click()}>Choose file…</button>
        <input ref={fileRef} type="file" accept=".vtt,.txt,text/*" onChange={pickFile} style={{ display: 'none' }} />
        {msg && <span style={{ fontSize: 12, color: msg.ok ? 'var(--color-available)' : 'var(--color-unavailable)' }}>{msg.text}</span>}
      </div>
    </div>
  )
}

function Landing({ meetings, onOpen, onImported }) {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <ImportCard onImported={onImported} />
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Meetings</div>
        {!meetings.length && (
          <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>Nothing yet — import your first transcript above.</div>
        )}
        {meetings.map(m => (
          <div key={m.id} onClick={() => onOpen(m.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px', borderTop: '0.5px solid var(--color-border)', cursor: 'pointer' }}>
            <i className="ti ti-file-text" style={{ color: 'var(--color-text-3)' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
                {m.date} · {m.participants.length ? m.participants.join(', ') : 'speakers unlabeled'}
              </div>
            </div>
            {m.actionStats && <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{m.actionStats.done}/{m.actionStats.total} actions</span>}
            {m.exports > 0 && <i className="ti ti-share" title="Exported" style={{ color: 'var(--color-available)', fontSize: 14 }} />}
            <span style={pill(m.hasReport)}>{m.hasReport ? '● REPORT' : '○ TRANSCRIPT'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Detail({ id, exportDestinations, synthesisMode, onBack, onDeleted }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirmInfo, setConfirmInfo] = useState(null)
  const [mode, setMode] = useState(synthesisMode || 'local')
  const [dest, setDest] = useState(exportDestinations[0] || '')
  const [msg, setMsg] = useState(null)
  const [showTranscript, setShowTranscript] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/meetings/${id}`).then(r => r.json()).then(d => {
      setData(d)
      if (d.report) fetch(`/api/meetings/${id}/events`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'report-opened' }),
      }).catch(() => {})
    }).catch(() => {})
  }, [id])
  useEffect(() => { load() }, [load])

  const generate = async (confirm = false) => {
    setBusy(true); setMsg(null); setConfirmInfo(null)
    try {
      const r = await fetch(`/api/meetings/${id}/report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, confirm }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed')
      if (d.needsConfirm) { setConfirmInfo(d); setBusy(false); return }
      setMsg({ ok: true, text: 'Report generated.' })
      load()
    } catch (e) { setMsg({ ok: false, text: e.message }) }
    setBusy(false)
  }

  const toggleItem = async (item) => {
    await fetch(`/api/meetings/${id}/items`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: item.id, status: item.status === 'done' ? 'open' : 'done' }),
    }).catch(() => {})
    load()
  }

  const doExport = async () => {
    setMsg(null)
    try {
      const r = await fetch(`/api/meetings/${id}/export`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dest }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Export failed')
      setMsg({ ok: true, text: `Report handed off → ${d.path}` })
      load()
    } catch (e) { setMsg({ ok: false, text: e.message }) }
  }

  const doDelete = async () => {
    if (!window.confirm('Delete this meeting and all its artifacts (transcript, report, events)?')) return
    await fetch(`/api/meetings/${id}`, { method: 'DELETE' }).catch(() => {})
    onDeleted()
  }

  if (!data) return <div style={{ padding: 40, fontSize: 12, color: 'var(--color-text-3)' }}>Loading…</div>
  const fm = data.report?.frontmatter

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button style={btnGhost} onClick={onBack}><i className="ti ti-arrow-left" /> All meetings</button>
        <div style={{ flex: 1 }} />
        <button style={{ ...btnGhost, color: 'var(--color-unavailable)' }} onClick={doDelete}>Delete</button>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <div style={{ fontSize: 15, fontWeight: 650 }}>{data.meta?.title}</div>
          <span style={pill(!!data.report)}>{data.report ? '● REPORT' : '○ TRANSCRIPT ONLY'}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 14 }}>
          {data.meta?.date} · {data.meta?.source} · {(data.meta?.participants || []).join(', ') || 'speakers unlabeled'}
          {fm?.provenance && <> · synthesized by <code>{fm.provenance.model}</code> ({fm.provenance.processingMode})</>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <select value={mode} onChange={e => setMode(e.target.value)} style={{ fontSize: 12 }}>
            <option value="local">Synthesize locally (private, needs Ollama)</option>
            <option value="cloud-assisted">Synthesize with cloud model (labeled)</option>
          </select>
          <button style={btn} disabled={busy} onClick={() => generate(false)}>
            {busy ? 'Synthesizing…' : data.report ? 'Regenerate report' : 'Generate report'}
          </button>
          {data.report && exportDestinations.length > 0 && (
            <>
              <select value={dest} onChange={e => setDest(e.target.value)} style={{ fontSize: 12, maxWidth: 260 }}>
                {exportDestinations.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <button style={btn} onClick={doExport}><i className="ti ti-share" /> Hand off report</button>
            </>
          )}
          {data.report && !exportDestinations.length && (
            <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>Add export destinations in Settings → Meetings to hand reports off.</span>
          )}
        </div>
        {confirmInfo && (
          <div style={{ marginTop: 12, padding: 12, border: '0.5px solid var(--color-border-strong)', borderRadius: 6, fontSize: 12, color: 'var(--color-text-2)' }}>
            Cloud pass via <code>{confirmInfo.model}</code> — estimated ≈ ${confirmInfo.estUSD}. The transcript leaves this machine for this one labeled pass.
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button style={btn} onClick={() => generate(true)}>Confirm — run cloud pass</button>
              <button style={btnGhost} onClick={() => setConfirmInfo(null)}>Cancel</button>
            </div>
          </div>
        )}
        {msg && <div style={{ marginTop: 10, fontSize: 12, color: msg.ok ? 'var(--color-available)' : 'var(--color-unavailable)' }}>{msg.text}</div>}
      </div>

      {fm && (fm.actionItems || []).length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Action items</div>
          {fm.actionItems.map(a => (
            <label key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '6px 0', cursor: 'pointer', borderTop: '0.5px solid var(--color-border)' }}>
              <input type="checkbox" checked={a.status === 'done'} onChange={() => toggleItem(a)} style={{ width: 'auto', marginTop: 3 }} />
              <span style={{ fontSize: 13, color: a.status === 'done' ? 'var(--color-text-3)' : 'var(--color-text-2)', textDecoration: a.status === 'done' ? 'line-through' : 'none', lineHeight: 1.5 }}>
                {a.text}{a.owner && <span style={{ color: 'var(--color-text-3)' }}> — {a.owner}</span>}
              </span>
            </label>
          ))}
          <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 10 }}>
            Derived from unverified speech — verify before acting. Execution belongs to your systems, via the handed-off report.
          </div>
        </div>
      )}

      {data.report && (
        <div style={card}><Md text={data.report.body} /></div>
      )}

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setShowTranscript(s => !s)}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Transcript</div>
          <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{data.transcript.length} lines · stays on this machine, never exported</span>
          <i className={`ti ti-chevron-${showTranscript ? 'up' : 'down'}`} style={{ color: 'var(--color-text-3)' }} />
        </div>
        {showTranscript && (
          <div style={{ marginTop: 12, maxHeight: 420, overflowY: 'auto', fontSize: 12, lineHeight: 1.6 }}>
            {data.transcript.map((e, i) => (
              <div key={i} style={{ marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: 'var(--color-text-2)' }}>{e.speaker || '—'}</span>
                <span style={{ color: 'var(--color-text-3)' }}>: {e.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Meetings() {
  const [enabled, setEnabled] = useState(null)
  const [meetings, setMeetings] = useState([])
  const [exportDestinations, setExportDestinations] = useState([])
  const [synthesisMode, setSynthesisMode] = useState('local')
  const [openId, setOpenId] = useState(null)

  const refresh = useCallback(() => {
    fetch('/api/meetings').then(r => r.json()).then(d => {
      setEnabled(!!d.enabled)
      setMeetings(d.meetings || [])
      setExportDestinations(d.exportDestinations || [])
      setSynthesisMode(d.synthesisMode || 'local')
    }).catch(() => setEnabled(false))
  }, [])
  useEffect(() => { refresh() }, [refresh])

  if (enabled === null) return <div style={{ padding: 40, fontSize: 12, color: 'var(--color-text-3)' }}>Loading…</div>
  if (!enabled) return <Explainer />
  if (openId) return <Detail id={openId} exportDestinations={exportDestinations} synthesisMode={synthesisMode}
    onBack={() => { setOpenId(null); refresh() }} onDeleted={() => { setOpenId(null); refresh() }} />
  return <Landing meetings={meetings} onOpen={setOpenId} onImported={(id) => { refresh(); setOpenId(id) }} />
}
