import { useState, useEffect, useRef, useCallback } from 'react'
import { api, getPin, streamJob } from './api.js'

// Job-model chat client. Send returns a jobId immediately; the SSE stream is
// only a VIEW — if the screen locks mid-answer the job keeps running on the
// Mac, and on visibilitychange we re-attach (the server replays all deltas).
// The active job id persists in localStorage so even a full app restart
// resumes cleanly. Escalated jobs also complete via Telegram push.

const ACTIVE_KEY = 'nexus-active-job'

export default function Chat() {
  const [msgs, setMsgs] = useState([])          // {role, content, via?, channel?}
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [statusLine, setStatusLine] = useState('')
  const [live, setLive] = useState('')          // streaming partial reply
  const [recording, setRecording] = useState(false)
  const bodyRef = useRef(null)
  const recRef = useRef(null)
  const wakeRef = useRef(null)
  const followingRef = useRef(null)   // jobId currently being streamed (re-entrancy guard)
  const abortRef = useRef(null)

  const scrollDown = () => requestAnimationFrame(() => {
    const el = bodyRef.current?.closest('.mnx-body')
    if (el) el.scrollTop = el.scrollHeight
  })

  const loadHistory = useCallback(async () => {
    try {
      const h = await api('/api/chat/history?n=60')
      setMsgs(h.map(m => ({ role: m.role, content: m.content, via: m.via, channel: m.channel })))
      scrollDown()
    } catch { /* offline shell handles it */ }
  }, [])

  // Follow a job to completion; reconnect-safe. Ends by reloading history
  // (the canonical thread is the source of truth, not our local state).
  // Re-entrancy guard: mount AND visibilitychange can both fire for the same
  // job — without the guard two streams open and the server replays deltas to
  // each, visibly doubling tokens until the first ends.
  const follow = useCallback(async (jobId) => {
    if (followingRef.current === jobId) return
    followingRef.current = jobId
    setBusy(true)
    setLive('')
    localStorage.setItem(ACTIVE_KEY, jobId)
    try { wakeRef.current = await navigator.wakeLock?.request('screen') } catch { /* not critical */ }
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      let done = false
      await streamJob(jobId, (d) => {
        if (d.type === 'status') setStatusLine(d.text)
        if (d.type === 'token') { setLive(prev => prev + d.text); scrollDown() }
        if (d.type === 'done' || d.type === 'error') done = true
      }, ctrl.signal)
      if (!done) {
        // Stream ended without a terminal event (proxy reap) — poll the job.
        const job = await api(`/api/chat/job/${jobId}`)
        done = job.status === 'done' || job.status === 'error'
      }
      if (done) {
        localStorage.removeItem(ACTIVE_KEY)
        setBusy(false); setLive(''); setStatusLine('')
        await loadHistory()
      }
      // else still running (rare) — leave busy; visibilitychange will re-attach.
    } catch (e) {
      if (e.name !== 'AbortError') {
        // Couldn't attach — job may still finish; keep it resumable.
        setBusy(false); setStatusLine('Connection lost — reply will land in history (and Telegram if escalated).')
      }
    } finally {
      followingRef.current = null
      try { wakeRef.current?.release() } catch { /* released on hide anyway */ }
    }
  }, [loadHistory])

  useEffect(() => {
    loadHistory()
    // A Telegram completion deep link (/m/chat?job=<id>) targets a specific
    // job; otherwise resume whatever was last active.
    const linked = new URLSearchParams(location.search).get('job')
    const pending = linked || localStorage.getItem(ACTIVE_KEY)
    if (pending) follow(pending)
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      const active = localStorage.getItem(ACTIVE_KEY)
      if (active) follow(active)
      else loadHistory()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      abortRef.current?.abort()   // stop streaming + setState when Chat unmounts
    }
  }, [follow, loadHistory])

  const send = async () => {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    setMsgs(m => [...m, { role: 'user', content: text, channel: 'pwa' }])
    scrollDown()
    try {
      const { job } = await api('/api/chat', { method: 'POST', body: JSON.stringify({ text }) })
      follow(job.id)
    } catch (e) {
      setMsgs(m => [...m, { role: 'assistant', content: `⚠️ Couldn't reach the Mac (${e.message}). Nothing was sent — try again, or use Telegram.` }])
    }
  }

  // Voice input: MediaRecorder → server-side whisper → composer text. The
  // Director reviews the transcript before sending — same trust rule as the
  // domain preview cards.
  const toggleRec = async () => {
    if (recording) { recRef.current?.stop(); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      const chunks = []
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setRecording(false)
        setStatusLine('Transcribing…')
        try {
          const blob = new Blob(chunks, { type: mime || 'audio/webm' })
          const r = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': blob.type, 'x-voice-pin': getPin() },
            body: blob,
          })
          const data = await r.json()
          if (data.text) setDraft(d => (d ? d + ' ' : '') + data.text)
          else setStatusLine(data.error || 'Transcription unavailable — type it instead.')
        } catch { setStatusLine('Transcription failed — type it instead.') }
        if (!statusLine) setStatusLine('')
      }
      recRef.current = rec
      rec.start()
      setRecording(true)
      setStatusLine('Recording — tap again to stop')
    } catch { setStatusLine('Mic unavailable (check site permissions).') }
  }

  return (
    <>
      <div className="mnx-chat" ref={bodyRef}>
        {msgs.length === 0 && !busy && (
          <div className="mnx-empty">One brain, every surface — this is the same conversation as Telegram and voice.<br />Prefix with “deep” to force the cloud path.</div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`mnx-bubble ${m.role}`}>
            {m.via && m.via !== 'local' ? '🧠 ' : ''}{m.content}
            {m.channel && m.channel !== 'pwa' && <div className="meta">via {m.channel}</div>}
          </div>
        ))}
        {live && <div className="mnx-bubble assistant">{live}</div>}
        {statusLine && <div className="mnx-status-line">{statusLine}</div>}
      </div>
      <div className="mnx-composer">
        <button className={`mnx-icon-btn ${recording ? 'rec' : ''}`} onClick={toggleRec} title="Voice input">
          <i className={`ti ${recording ? 'ti-player-stop' : 'ti-microphone'}`} />
        </button>
        <textarea
          rows={1}
          placeholder={busy ? 'Umbruh is working…' : 'Message the Nexus…'}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
        />
        <button className="mnx-icon-btn primary" disabled={busy || !draft.trim()} onClick={send}>
          <i className="ti ti-send" />
        </button>
      </div>
    </>
  )
}
