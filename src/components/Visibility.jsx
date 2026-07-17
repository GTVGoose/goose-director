import { useState } from 'react'
import Library from './Library.jsx'
import RunInspector from './RunInspector.jsx'
import Projects from './Projects.jsx'

// GU8.5: the compartmentalized Visibility workspace (audit Finding 2 —
// "create one top-level Visibility entry; inside it, preserve the pages as
// tabs"). One nav item groups Library / Runs / Projects behind ui.visibility,
// so the observation surfaces are available on demand instead of each taxing a
// permanent nav slot. Flag-gated (default off; the default IA flip is gate G7).
//
// The three sub-views reuse the exact components from GU8.1–8.3 — no logic is
// duplicated; this is purely the container + tab bar the audit asked for.

const TABS = [
  { id: 'library', label: 'Library', sub: 'Durable artifacts', C: Library },
  { id: 'runs', label: 'Runs', sub: 'Council traces', C: RunInspector },
  { id: 'projects', label: 'Projects', sub: 'Context boundaries', C: Projects },
]

export default function Visibility() {
  const [tab, setTab] = useState('library')
  const Active = TABS.find(t => t.id === tab)?.C || Library

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
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
      <div style={{ flex: 1, minHeight: 0 }}>
        <Active />
      </div>
    </div>
  )
}
