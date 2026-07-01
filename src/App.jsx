import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar.jsx'
import Dashboard from './components/Dashboard.jsx'
import AgentMap from './components/AgentMap.jsx'
import StatusLayer from './components/StatusLayer.jsx'
import CanonState from './components/CanonState.jsx'
import Invoke from './components/Invoke.jsx'
import Sandbox from './components/Sandbox.jsx'
import Knowledge from './components/Knowledge.jsx'
import Membrane from './components/Membrane.jsx'
import Settings from './components/Settings.jsx'

export default function App() {
  const [view, setView] = useState('dashboard')
  const [agents, setAgents] = useState([])
  const [statusData, setStatusData] = useState({ entries: [] })
  const [canonDocs, setCanonDocs] = useState([])
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const refresh = async () => {
    setLoading(true)
    try {
      const [agentsRes, statusRes, canonRes, healthRes] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/status'),
        fetch('/api/canon'),
        fetch('/api/health'),
      ])
      setAgents(await agentsRes.json())
      setStatusData(await statusRes.json())
      setCanonDocs(await canonRes.json())
      setHealth(await healthRes.json())
      setLastRefresh(new Date())
    } catch (e) {
      console.error('API error:', e)
    }
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  const escalations = statusData.entries.filter(e => e.status === 'ESCALATION_REQUIRED').length
  const reviews = statusData.entries.filter(e => e.status === 'REVIEW_WHEN_READY').length

  const VIEW_META = {
    dashboard: { label: 'Overview',      sub: 'System state' },
    agents:    { label: 'Agents',        sub: 'Posture map' },
    knowledge: { label: 'Knowledge',     sub: 'Canon index' },
    status:    { label: 'Status Layer',  sub: 'Background activity' },
    canon:     { label: 'Canon State',   sub: 'Boundary map' },
    invoke:    { label: 'Invoke',        sub: 'Send work to agents and models' },
    sandbox:   { label: 'Sandbox',       sub: 'Multi-model council' },
    membrane:  { label: 'Membrane',      sub: 'SFS Vault shared-intelligence layer' },
    settings:  { label: 'Settings',     sub: 'API keys and configuration' },
  }

  const meta = VIEW_META[view] || VIEW_META.dashboard

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        view={view}
        onNav={setView}
        escalations={escalations}
        reviews={reviews}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Command bar */}
        <div style={{
          height: 46,
          background: 'var(--color-surface)',
          borderBottom: '0.5px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: 16,
          flexShrink: 0,
          WebkitAppRegion: 'drag',  // macOS: drag window from topbar
        }}>
          {/* Traffic light spacer for hiddenInset titlebar */}
          <div style={{ width: 60, flexShrink: 0, WebkitAppRegion: 'no-drag' }} />

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: '0.01em' }}>{meta.label}</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-3)', letterSpacing: '0.02em' }}>— {meta.sub}</span>
          </div>

          <div style={{ flex: 1 }} />

          {/* Escalation pill */}
          {escalations > 0 && (
            <button
              onClick={() => setView('status')}
              style={{
                background: 'var(--color-escalation-bg)',
                border: '0.5px solid var(--color-escalation-border)',
                color: 'var(--color-escalation-text)',
                borderRadius: 'var(--radius)',
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.04em',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                WebkitAppRegion: 'no-drag',
              }}
            >
              <i className="ti ti-alert-triangle" style={{ fontSize: 12 }}></i>
              {escalations} ESCALATION{escalations > 1 ? 'S' : ''}
            </button>
          )}

          {/* Refresh */}
          {health?.repoFound === false && (
            <span style={{ fontSize: 11, color: 'var(--color-text-3)', WebkitAppRegion: 'no-drag' }}>
              repo not found — static data
            </span>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            style={{
              background: 'none',
              border: '0.5px solid var(--color-border-mid)',
              borderRadius: 'var(--radius)',
              padding: '4px 10px',
              fontSize: 11,
              color: loading ? 'var(--color-text-3)' : 'var(--color-text-2)',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              letterSpacing: '0.03em',
              WebkitAppRegion: 'no-drag',
            }}
          >
            <i className={`ti ti-refresh`} style={{ fontSize: 13 }}></i>
            {loading ? 'Syncing…' : lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </button>
        </div>

        {/* Main content */}
        <main style={{
          flex: 1,
          overflowY: 'auto',
          padding: view === 'invoke' ? '16px 20px' : '20px',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {view === 'dashboard' && (
            <Dashboard agents={agents} statusData={statusData} canonDocs={canonDocs} onNav={setView} />
          )}
          {view === 'agents' && <AgentMap agents={agents} onInvoke={() => setView('invoke')} />}
          {view === 'status' && <StatusLayer entries={statusData.entries} />}
          {view === 'canon' && <CanonState docs={canonDocs} />}
          {view === 'invoke' && <Invoke canonDocs={canonDocs} />}
          {view === 'sandbox' && <Sandbox canonDocs={canonDocs} />}
          {view === 'knowledge' && <Knowledge />}
          {view === 'membrane' && <Membrane />}
          {view === 'settings' && <Settings />}
        </main>
      </div>
    </div>
  )
}
