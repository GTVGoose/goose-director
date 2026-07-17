import { useState } from 'react'
import Dashboard from './Dashboard.jsx'
import AgentMap from './AgentMap.jsx'
import Knowledge from './Knowledge.jsx'
import StatusLayer from './StatusLayer.jsx'
import CanonState from './CanonState.jsx'
import Library from './Library.jsx'
import RunInspector from './RunInspector.jsx'
import Projects from './Projects.jsx'
import Domains from './Domains.jsx'

// GU8.5 → full consolidation (owner directive 2026-07-17): ONE top-level
// Visibility entry holding every information surface as an explorable tab —
// Overview / Agents / Knowledge / Status / Canon / Library / Runs / Projects
// (+ Domains when domainsTab, i.e. ui.domainsInVisibility — the product IA;
// a personal build may keep Domains as its own sidebar entry instead). The
// sidebar's Observe/Monitor sections fold away when ui.visibility is on; these
// surfaces are available on demand instead of each taxing a permanent nav
// slot. Tabs reuse the exact page components — no logic is duplicated.

export default function Visibility({ agents = [], statusData = { entries: [] }, canonDocs = [], onNav = () => {}, domainsTab = false }) {
  const [tab, setTab] = useState('overview')

  const TABS = [
    { id: 'overview', label: 'Overview', sub: 'System state at a glance',
      render: () => <Dashboard agents={agents} statusData={statusData} canonDocs={canonDocs} onNav={onNav} compact /> },
    { id: 'agents', label: 'Agents', sub: 'Who runs, how, and where',
      render: () => <AgentMap agents={agents} onInvoke={() => onNav('invoke')} /> },
    { id: 'knowledge', label: 'Knowledge', sub: 'Search all canon and docs',
      render: () => <Knowledge /> },
    { id: 'status', label: 'Status', sub: 'Background agent activity',
      render: () => <StatusLayer entries={statusData.entries} /> },
    { id: 'canon', label: 'Canon', sub: "What's inside and outside",
      render: () => <CanonState docs={canonDocs} /> },
    { id: 'library', label: 'Library', sub: 'Durable artifacts',
      render: () => <Library /> },
    { id: 'runs', label: 'Runs', sub: 'Council traces',
      render: () => <RunInspector /> },
    { id: 'projects', label: 'Projects', sub: 'Context boundaries',
      render: () => <Projects /> },
    ...(domainsTab ? [{ id: 'domains', label: 'Domains', sub: 'Your life domains, one map',
      render: () => <Domains /> }] : []),
  ]
  const active = TABS.find(t => t.id === tab) || TABS[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} title={t.sub} style={{
            cursor: 'pointer', fontSize: 12, fontWeight: tab === t.id ? 600 : 400,
            padding: '6px 14px', borderRadius: 'var(--radius-md)',
            border: `0.5px solid ${tab === t.id ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
            background: tab === t.id ? 'var(--color-surface-2)' : 'transparent',
            color: tab === t.id ? 'var(--color-text)' : 'var(--color-text-2)',
          }}>{t.label}</button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {active.render()}
      </div>
    </div>
  )
}
