import { useState, useEffect, useCallback } from 'react'
import { getPin, setPin, clearPin, api, probe, flushOutbox, outboxCount } from './api.js'
import Chat from './Chat.jsx'
import Domains from './Domains.jsx'
import Status from './Status.jsx'
import './mobile.css'

// Mini Nexus — the pocket surface (plan 2026-07-11). Three views over the
// Mac's brain: Chat (job-model client), Domains (read + quick-append), Status
// (the notify() event log). The offline states are part of the product: the
// precached shell always renders, and the failure screen tells the Director
// WHICH link is broken and hands off to Telegram (the store-and-forward spine).

const TABS = [
  { id: 'chat', icon: 'ti-message-circle', label: 'Chat' },
  { id: 'domains', icon: 'ti-layout-grid', label: 'Domains' },
  { id: 'status', icon: 'ti-antenna', label: 'Status' },
]

const pathTab = () => {
  const m = /^\/m\/?(\w*)/.exec(location.pathname)
  return TABS.some(t => t.id === m?.[1]) ? m[1] : 'chat'
}

export default function MobileApp() {
  const [tab, setTab] = useState(pathTab)
  const [authed, setAuthed] = useState(false)
  const [link, setLink] = useState('ok')       // ok | unauthorized | tailnet | offline
  const [checked, setChecked] = useState(false)
  const [queued, setQueued] = useState(outboxCount())

  // Register the service worker for the /m scope only — the desktop console
  // stays uncontrolled. Best effort: dev servers don't emit sw.js.
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/m' }).catch(() => {})
    }
  }, [])

  const recheck = useCallback(async () => {
    const state = await probe()
    setLink(state)
    setChecked(true)
    if (state === 'ok' && getPin()) {
      try {
        await api('/api/events?n=1')
        setAuthed(true)
        setQueued(await flushOutbox())   // safe: server dedupes on UUID
      } catch (e) {
        if (e.status === 401 || e.status === 403) { setAuthed(false) }
      }
    }
  }, [])

  useEffect(() => {
    recheck()
    const onVis = () => { if (document.visibilityState === 'visible') recheck() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', recheck)
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', recheck) }
  }, [recheck])

  const go = (id) => {
    setTab(id)
    history.replaceState(null, '', `/m/${id === 'chat' ? '' : id}`)
  }

  if (!checked) return <div className="mnx-gate"><div className="sigil" /></div>

  if (link === 'tailnet' || link === 'offline') {
    return (
      <div className="mnx-gate">
        <div className="sigil" style={{ opacity: 0.35, boxShadow: 'none' }} />
        <h1>Nexus unreachable</h1>
        {link === 'offline' ? (
          <p>Your phone looks fully offline. Anything you save to a domain will queue and sync when you're back.</p>
        ) : (
          <p>You're online, but the Mac isn't answering. Check that <strong>Tailscale is ON</strong> — or the Mac may be asleep. Telegram still reaches it the moment it wakes.</p>
        )}
        {queued > 0 && <p style={{ color: 'var(--color-active-text)' }}>{queued} domain update{queued === 1 ? '' : 's'} queued for sync.</p>}
        <a className="tg" href="tg://resolve">Send it via Telegram instead</a>
        <button className="big" onClick={recheck}>Retry</button>
      </div>
    )
  }

  if (!authed) return <PinGate onDone={() => { setAuthed(true); recheck() }} />

  return (
    <div className="mnx">
      <div className="mnx-header">
        <div>
          <div className="title">Mini Nexus</div>
          <div className="sub">{queued > 0 ? `${queued} update${queued === 1 ? '' : 's'} queued` : 'linked to the Mac'}</div>
        </div>
        <div className={`mnx-dot ${link === 'ok' ? 'ok' : ''}`} />
      </div>
      <div className="mnx-body">
        {tab === 'chat' && <Chat />}
        {tab === 'domains' && <Domains onQueuedChange={setQueued} />}
        {tab === 'status' && <Status />}
      </div>
      <div className="mnx-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`mnx-tab ${tab === t.id ? 'active' : ''}`} onClick={() => go(t.id)}>
            <i className={`ti ${t.icon}`} /> {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function PinGate({ onDone }) {
  const [val, setVal] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!val.trim()) { setErr('Enter your PIN'); return }
    setBusy(true)
    setErr('Reaching Nexus…')
    setPin(val.trim())
    try {
      await api('/api/events?n=1')
      onDone()
    } catch (e) {
      clearPin()
      setErr(e.status === 403 ? e.message : 'Wrong PIN')
      setBusy(false)
    }
  }

  return (
    <div className="mnx-gate">
      <div className="sigil" />
      <h1>Mini Nexus</h1>
      <p>Pocket window into the Goose system. Enter the mobile PIN set in goose.config.json.</p>
      <input
        type="password" inputMode="numeric" autoComplete="off"
        value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
      />
      <div className="err">{err}</div>
      <button className="big" disabled={busy} onClick={submit}>{busy ? 'Connecting…' : 'Enter'}</button>
    </div>
  )
}
