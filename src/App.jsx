import { useState, useEffect, useRef } from 'react'
import Sidebar from './components/Sidebar.jsx'
import Dashboard from './components/Dashboard.jsx'
import AgentMap from './components/AgentMap.jsx'
import StatusLayer from './components/StatusLayer.jsx'
import CanonState from './components/CanonState.jsx'
import Invoke from './components/Invoke.jsx'
import Automations from './components/Automations.jsx'
import ChatHome from './components/ChatHome.jsx'
import Knowledge from './components/Knowledge.jsx'
import Library from './components/Library.jsx'
import RunInspector from './components/RunInspector.jsx'
import Projects from './components/Projects.jsx'
import Visibility from './components/Visibility.jsx'
import Builder from './components/Builder.jsx'
import Settings from './components/Settings.jsx'
import Help from './components/Help.jsx'
import Setup from './components/Setup.jsx'
import Onboarding from './components/Onboarding.jsx'
import { applyAccent, applyTheme, sanitizeCustomTheme } from './theme.js'
import { personalViews, personalViewMeta } from './personal-extensions.jsx'

export default function App() {
  const [view, setView] = useState('dashboard')
  const didInitView = useRef(false)   // flip the landing to Chat once, only if the flag is on (G7)
  const userNavigated = useRef(false) // set once the user picks a view — the boot flip must not override it
  // All user-initiated navigation goes through this so a sidebar click that lands
  // before /api/config resolves can't be yanked to Chat by the boot flip below.
  const navigate = (v) => { userNavigated.current = true; setView(v) }
  const [agents, setAgents] = useState([])
  const [statusData, setStatusData] = useState({ entries: [] })
  const [canonDocs, setCanonDocs] = useState([])
  const [health, setHealth] = useState(null)
  const [ui, setUi] = useState({})
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const refresh = async () => {
    setLoading(true)
    try {
      const [agentsRes, statusRes, canonRes, healthRes, configRes] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/status'),
        fetch('/api/canon'),
        fetch('/api/health'),
        fetch('/api/config'),
      ])
      setAgents(await agentsRes.json())
      setStatusData(await statusRes.json())
      setCanonDocs(await canonRes.json())
      setHealth(await healthRes.json())
      const cfg = await configRes.json()
      setUi(cfg.ui || {})
      // Theme first (sets the full-token baseline, incl. any accent a theme
      // suggests), THEN accent — so the user's explicit accent choice layers on
      // top (theme-system.md §5, option A). ui.theme absent ⇒ studio ⇒ today.
      // Preset first (full-token baseline), THEN the user's custom theme layered
      // on top (T25 — absent ⇒ sanitize returns null ⇒ identical to today), THEN
      // accent (line below) so the explicit accent choice always wins (option A).
      applyTheme(cfg.ui?.theme, sanitizeCustomTheme(cfg.ui?.customTheme))
      applyAccent(cfg.ui?.accent)
      document.title = cfg.vaultName ? `Nexus — ${cfg.ui?.consoleName || cfg.vaultName}` : 'Nexus'
      // Chat-first landing (T10) — flag-gated (G7). Boot into Chat once, on first
      // load only, and only if the user hasn't already navigated. Default off →
      // the landing stays Overview, byte-identical to today.
      if (!didInitView.current) {
        didInitView.current = true
        if (cfg.ui?.chatHome && !userNavigated.current) setView('chat')
      }
      setLastRefresh(new Date())
    } catch (e) {
      console.error('API error:', e)
    }
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  const escalations = statusData.entries.filter(e => e.status === 'ESCALATION_REQUIRED').length
  const reviews = statusData.entries.filter(e => e.status === 'REVIEW_WHEN_READY').length

  // First-run onboarding (T18b) — the OUTERMOST gate. Shows once config has loaded
  // (health non-null, set alongside ui in refresh()), iff onboarding isn't suppressed
  // and hasn't been completed/skipped. `ui.onboarding` uniquely defaults ON-when-absent
  // (fresh install greets the buyer); the C lineage / dev builds set it false. It grants
  // nothing — every step writes intent only. Finishing/skipping sets ui.onboardingComplete
  // and falls through to the <Setup> gate below if no repo is connected yet.
  if (health && ui.onboarding !== false && ui.onboardingComplete !== true) {
    return <Onboarding health={health} refresh={refresh} />
  }

  // First run / broken harness: repo missing → walk through vault connection
  if (health && health.repoFound === false) {
    return <Setup onDone={refresh} />
  }

  const VIEW_META = {
    dashboard: { label: 'Overview',      sub: 'System state' },
    chat:      { label: 'Chat',          sub: 'Talk to the Brain' },
    agents:    { label: 'Agents',        sub: 'Roster — click an agent for detail' },
    knowledge: { label: 'Knowledge',     sub: 'Canon index' },
    library:   { label: 'Library',       sub: 'Durable artifacts — versions, provenance, export' },
    runs:      { label: 'Runs',          sub: 'Council run traces — plan, workers, tools, synthesis' },
    projects:  { label: 'Projects',      sub: 'Durable context — instructions, routing, scoped work' },
    visibility:{ label: 'Visibility',    sub: 'Library, runs, and projects in one workspace' },
    builder:   { label: 'Builder',       sub: 'Build your first agentic system, stage by stage' },
    status:    { label: 'Status Layer',  sub: 'Background activity' },
    canon:     { label: 'Canon State',   sub: 'Boundary map' },
    invoke:    { label: 'Invoke',        sub: 'Send work to agents and models' },
    automations: { label: 'Automations',  sub: 'Scheduled prompts that run themselves' },
    help:      { label: 'Help',          sub: 'Guides and glossary' },
    settings:  { label: 'Settings',     sub: 'API keys and configuration' },
    ...personalViewMeta,   // extension views (populated by the product overlay)
  }
  // Flag-gated "Sandbox" → "Council" rename (T10 wiring; flip is part of G7). Default
  // off → the label stays "Sandbox". Label-only; the view id / endpoint stay `sandbox`.
  if (ui.councilLabel && VIEW_META.sandbox) {
    VIEW_META.sandbox = { ...VIEW_META.sandbox, label: 'Council' }
  }

  const meta = VIEW_META[view] || VIEW_META.dashboard

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        view={view}
        onNav={navigate}
        escalations={escalations}
        reviews={reviews}
        vaultName={ui.consoleName || health?.vaultName}
        chatHome={!!ui.chatHome}
        councilLabel={!!ui.councilLabel}
        membrane={!!ui.membrane}
        library={!!ui.library}
        runInspector={!!ui.runInspector}
        projects={!!ui.projects}
        visibility={!!ui.visibility}
        builder={!!ui.builder}
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
              onClick={() => navigate('status')}
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
          padding: (view === 'invoke' || view === 'chat') ? '16px 20px' : '20px',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {view === 'dashboard' && (
            <Dashboard agents={agents} statusData={statusData} canonDocs={canonDocs} onNav={navigate} compact={!!(ui.overviewCompact || ui.chatHome)} />
          )}
          {view === 'chat' && <ChatHome canonDocs={canonDocs} onNav={navigate} />}
          {view === 'agents' && <AgentMap agents={agents} onInvoke={() => navigate('invoke')} />}
          {view === 'status' && <StatusLayer entries={statusData.entries} />}
          {view === 'canon' && <CanonState docs={canonDocs} />}
          {view === 'invoke' && <Invoke canonDocs={canonDocs} onNav={navigate} />}
          {view === 'automations' && <Automations />}
          {view === 'knowledge' && <Knowledge />}
          {view === 'library' && ui.library && <Library />}
          {view === 'runs' && ui.runInspector && <RunInspector />}
          {view === 'projects' && ui.projects && <Projects />}
          {view === 'visibility' && ui.visibility && <Visibility agents={agents} statusData={statusData} canonDocs={canonDocs} onNav={navigate} domainsTab={!!ui.domainsInVisibility} />}
          {view === 'builder' && ui.builder && <Builder />}
          {view === 'help' && <Help />}
          {view === 'settings' && <Settings />}
          {/* extension views (populated by the product overlay). Membrane (T14) is
              gated behind ui.membrane — hidden in the shipped product, so even a stale
              view:'membrane' renders nothing until the flag is set. */}
          {personalViews[view] && !(view === 'membrane' && !ui.membrane) && personalViews[view]({ canonDocs, onNav: navigate })}
        </main>
      </div>
    </div>
  )
}
