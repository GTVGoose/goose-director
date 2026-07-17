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
          (Google Meet / Zoom export a <code>.vtt</code>, or paste "Name: line" text). the local record is transcribed on-device, then your system's model processes it into the report.
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

// Client-side capture: streams → AudioContext(16k) → Int16 PCM chunks POSTed
// per channel every ~3 s. In-person = mic only ('room'); call = mic ('me') +
// a screen-share of the meeting tab/window with audio ('them') — that channel
// split is what gives real Me/Them attribution.
function useRecorder() {
  const [state, setState] = useState('idle') // idle | recording | uploading
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState(null)
  const rig = useRef(null)

  const cleanup = () => {
    const r = rig.current
    if (!r) return
    for (const s of r.streams) for (const t of s.getTracks()) t.stop()
    for (const c of r.ctxs) c.close().catch(() => {})
    clearInterval(r.timer)
    rig.current = null
  }

  const start = async (mode, id) => {
    setError(null)
    const streams = [], ctxs = [], pumps = []
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      streams.push(mic)
      const channels = [[mic, mode === 'call' ? 'me' : 'room']]
      if (mode === 'call') {
        const disp = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        if (!disp.getAudioTracks().length) {
          for (const t of disp.getTracks()) t.stop()
          throw new Error('No audio in the share — pick the meeting TAB (or window) and tick "Share audio".')
        }
        for (const t of disp.getVideoTracks()) t.stop() // audio only
        streams.push(disp)
        channels.push([disp, 'them'])
      }
      for (const [stream, ch] of channels) {
        const ctx = new AudioContext({ sampleRate: 16000 })
        ctxs.push(ctx)
        const src = ctx.createMediaStreamSource(stream)
        const node = ctx.createScriptProcessor(4096, 1, 1)
        let buf = []
        node.onaudioprocess = (e) => {
          const f = e.inputBuffer.getChannelData(0)
          const i16 = new Int16Array(f.length)
          for (let i = 0; i < f.length; i++) i16[i] = Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767)))
          buf.push(i16)
        }
        src.connect(node); node.connect(ctx.destination)
        const flush = async () => {
          if (!buf.length) return
          const parts = buf; buf = []
          const total = parts.reduce((n, p) => n + p.length, 0)
          const joined = new Int16Array(total)
          let o = 0; for (const p of parts) { joined.set(p, o); o += p.length }
          await fetch(`/api/meetings/${id}/audio?ch=${ch}`, {
            method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: joined.buffer,
          }).catch(() => {})
        }
        pumps.push({ flush, iv: setInterval(flush, 3000) })
      }
      const t0 = Date.now()
      rig.current = { streams, ctxs, pumps, timer: setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000) }
      setElapsed(0)
      setState('recording')
      return true
    } catch (e) {
      for (const s of streams) for (const t of s.getTracks()) t.stop()
      for (const c of ctxs) c.close().catch(() => {})
      setError(e.message)
      return false
    }
  }

  const stop = async (id) => {
    const r = rig.current
    setState('uploading')
    if (r) { for (const p of r.pumps) { clearInterval(p.iv); await p.flush() } }
    cleanup()
    await fetch(`/api/meetings/${id}/session/stop`, { method: 'POST' }).catch(() => {})
    setState('idle')
  }

  useEffect(() => cleanup, [])
  return { state, elapsed, error, start, stop }
}

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function RecordCard({ onRecordingDone }) {
  const rec = useRecorder()
  const [title, setTitle] = useState('')
  const [attested, setAttested] = useState(false)
  const [meetingId, setMeetingId] = useState(null)
  const [mode, setMode] = useState(null)
  const [asr, setAsr] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => { fetch('/api/meetings/asr-status').then(r => r.json()).then(setAsr).catch(() => {}) }, [])

  const begin = async (m) => {
    setErr(null)
    try {
      const r = await fetch('/api/meetings/session/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: m, title, attested }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Could not start')
      const ok = await rec.start(m, d.id)
      if (!ok) { await fetch(`/api/meetings/${d.id}`, { method: 'DELETE' }).catch(() => {}); return }
      setMeetingId(d.id); setMode(m)
    } catch (e) { setErr(e.message) }
  }

  const end = async () => {
    const id = meetingId
    setMeetingId(null); setMode(null); setTitle(''); setAttested(false)
    await rec.stop(id)
    onRecordingDone(id)
  }

  if (rec.state !== 'idle' && meetingId) {
    return (
      <div style={{ ...card, border: '0.5px solid rgba(216,80,80,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#d85050', animation: 'pulse 1.2s ease-in-out infinite' }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>Recording{mode === 'call' ? ' call' : ''} — {fmtTime(rec.elapsed)}</div>
          <div style={{ flex: 1 }} />
          <button style={{ ...btn, borderColor: 'rgba(216,80,80,0.5)' }} onClick={end}>
            {rec.state === 'uploading' ? 'Finishing…' : '■ Stop'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 8 }}>
          Audio is buffered locally and transcribed on this machine when you stop.
          {mode === 'call' && ' Your mic is "Me"; the shared tab’s audio is "Them".'}
        </div>
        <style>{'@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}'}</style>
      </div>
    )
  }

  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Record a meeting</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 14, lineHeight: 1.5 }}>
        One button. Stop → the local record is transcribed on this machine, then handed to your system's model, which processes it into the report.
      </div>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Meeting title (optional)" style={{ width: '100%', marginBottom: 12 }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-2)', marginBottom: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={attested} onChange={e => setAttested(e.target.checked)} style={{ width: 'auto' }} />
        I've told everyone in this conversation that it's being recorded
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button style={{ ...btn, opacity: attested && asr?.ok ? 1 : 0.45 }} disabled={!attested || !asr?.ok} onClick={() => begin('in-person')}>
          <i className="ti ti-microphone" /> Record in-person
        </button>
        <button style={{ ...btn, opacity: attested && asr?.ok ? 1 : 0.45 }} disabled={!attested || !asr?.ok} onClick={() => begin('call')}>
          <i className="ti ti-device-laptop" /> Record a call
        </button>
        <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
          {asr === null ? '' : asr.ok ? `transcription: ${asr.model} (local)` : asr.error}
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 10, lineHeight: 1.5 }}>
        "Record a call": your browser asks what to share — pick the meeting tab/window and tick <strong>Share audio</strong>.
        That audio becomes "Them", your mic is "Me". Everything is transcribed locally; audio never leaves this machine.
      </div>
      {(rec.error || err) && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-unavailable)' }}>{rec.error || err}</div>}
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

const STATUS_LABEL = { recording: '● REC', processing: '◌ TRANSCRIBING', synthesizing: '◌ SYNTHESIZING', error: '✕ ERROR' }

function Landing({ meetings, onOpen, onImported, onRecordingDone }) {
  const [showImport, setShowImport] = useState(false)
  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <RecordCard onRecordingDone={onRecordingDone} />
      <div style={{ fontSize: 11, color: 'var(--color-text-3)', margin: '0 0 16px 4px', cursor: 'pointer' }} onClick={() => setShowImport(s => !s)}>
        <i className={`ti ti-chevron-${showImport ? 'up' : 'right'}`} /> Or import a transcript your platform already made
      </div>
      {showImport && <ImportCard onImported={onImported} />}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Meetings</div>
        {!meetings.length && (
          <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>Nothing yet — record your first meeting above.</div>
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
            <span style={pill(m.hasReport)}>{STATUS_LABEL[m.status] || (m.hasReport ? '● REPORT' : '○ TRANSCRIPT')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Detail({ id, exportDestinations, synthesisMode, onBack, onDeleted }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState(synthesisMode || 'cloud-assisted')
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

  // While a recording is being transcribed/synthesized in the background,
  // poll until it lands.
  const working = data?.meta?.status === 'processing' || data?.meta?.status === 'synthesizing'
  useEffect(() => {
    if (!working) return
    const iv = setInterval(load, 2500)
    return () => clearInterval(iv)
  }, [working, load])

  const generate = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(`/api/meetings/${id}/report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed')
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

        {working && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-2)', marginBottom: 6 }}>
            <i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} />
            {data.meta.status === 'processing' ? 'Transcribing locally…' : 'Writing the report…'}
            <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
          </div>
        )}
        {data.meta?.status === 'error' && (
          <div style={{ fontSize: 12, color: 'var(--color-unavailable)', marginBottom: 6 }}>Processing failed: {data.meta.error}</div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <select value={mode} onChange={e => setMode(e.target.value)} style={{ fontSize: 12 }}>
            <option value="cloud-assisted">Synthesize with cloud model</option>
            <option value="local">Synthesize locally (needs Ollama)</option>
          </select>
          <button style={btn} disabled={busy || working || !data.transcript.length} onClick={generate}>
            {busy ? 'Synthesizing…' : data.report ? 'Regenerate report' : 'Generate report'}
          </button>
          {data.report && exportDestinations.length > 0 && (
            <>
              <select value={dest} onChange={e => setDest(e.target.value)} style={{ fontSize: 12, maxWidth: 260 }}>
                {exportDestinations.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <button style={btn} onClick={doExport}><i className="ti ti-share" /> File report to your systems</button>
            </>
          )}
          {data.report && !exportDestinations.length && (
            <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>Add export destinations in Settings → Meetings to hand reports off.</span>
          )}
        </div>
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
            Derived from unverified speech — verify before acting. Execution belongs to your systems, via the filed report.
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
  return <Landing meetings={meetings} onOpen={setOpenId}
    onImported={(id) => { refresh(); setOpenId(id) }}
    onRecordingDone={(id) => { refresh(); setOpenId(id) }} />
}
