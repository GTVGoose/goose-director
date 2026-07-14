import { personalNav } from '../personal-extensions.jsx'

export default function Sidebar({ view, onNav, escalations, reviews, vaultName, chatHome, councilLabel, membrane, library, runInspector, projects, visibility, builder, visibilityActive }) {

  // `navTo` overrides the destination (default = id); `activeOverride` lets one
  // entry (e.g. Visibility) stay highlighted across several views.
  const nav = (id, icon, label, sub, badge, activeOverride, navTo) => {
    const active = activeOverride !== undefined ? activeOverride : (view === id)
    return (
    <button
      key={id}
      onClick={() => onNav(navTo || id)}
      className={active ? undefined : 'nav-btn'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '7px 10px',
        width: '100%',
        background: active
          ? 'var(--color-accent-bg)'
          : 'none',
        border: 'none',
        borderLeft: active
          ? '2px solid var(--color-accent)'
          : '2px solid transparent',
        borderRadius: '0 var(--radius) var(--radius) 0',
        fontSize: 13,
        color: active ? 'var(--color-text)' : 'var(--color-text-2)',
        fontWeight: active ? 500 : 400,
        textAlign: 'left',
        cursor: 'pointer',
        marginBottom: 1,
        transition: 'background var(--dur-fast), color var(--dur-fast), border-color var(--dur-fast)',
      }}
    >
      <i className={`ti ti-${icon}`} style={{
        fontSize: 15,
        flexShrink: 0,
        color: active ? 'var(--color-accent-text)' : 'var(--color-text-3)',
      }}></i>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 13 }}>{label}</span>
          {badge && (
            <span style={{
              background: badge.color === 'red' ? 'var(--color-escalation-bg)' : 'var(--color-review-bg)',
              color: badge.color === 'red' ? 'var(--color-escalation-text)' : 'var(--color-review-text)',
              border: `0.5px solid ${badge.color === 'red' ? 'var(--color-escalation-border)' : 'var(--color-review-border)'}`,
              fontSize: 10,
              fontWeight: 600,
              padding: '1px 5px',
              borderRadius: 'var(--radius-pill)',
              minWidth: 18,
              textAlign: 'center',
            }}>{badge.count}</span>
          )}
        </div>
        {sub && !active && (
          <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 1, lineHeight: 1.3 }}>{sub}</div>
        )}
      </div>
    </button>
    )
  }

  // Render a personal-overlay nav item by id (or null if absent / gated off).
  const pnav = (id, labelOverride, subOverride) => {
    const it = personalNav.find(x => x.id === id)
    if (!it) return null
    if (id === 'membrane' && !membrane) return null
    return nav(it.id, it.icon, labelOverride || it.label, subOverride || it.sub)
  }
  const hasPnav = (id) => personalNav.some(x => x.id === id)

  const section = (label) => (
    <div key={`sec-${label}`} style={{
      fontSize: 9,
      fontWeight: 600,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: 'var(--color-text-3)',
      padding: '14px 12px 4px',
    }}>{label}</div>
  )

  const statusBadge = escalations > 0
    ? { color: 'red', count: escalations }
    : reviews > 0 ? { color: 'amber', count: reviews } : null

  // Personal-only nav (from personal-extensions.jsx; empty in the product build).
  // Items are appended after "Act"; a new section header is emitted whenever an
  // item's section differs from the running one.
  const renderPersonalNav = () => {
    const out = []
    let cur = 'Act'
    // Membrane (T14) is hidden in the shipped product unless ui.membrane is set. Filter
    // it out BEFORE the section walk so its 'Shared' header isn't emitted empty.
    const items = personalNav.filter(it => it.id !== 'membrane' || membrane)
    for (const item of items) {
      if (item.section !== cur) { out.push(section(item.section)); cur = item.section }
      // Flag-gated "Sandbox" → "Council" rename (label-only; view id stays `sandbox`).
      const label = (councilLabel && item.id === 'sandbox') ? 'Council' : item.label
      const sub = (councilLabel && item.id === 'sandbox') ? 'Many models, one council' : item.sub
      out.push(nav(item.id, item.icon, label, sub))
    }
    return out
  }

  return (
    <div style={{
      width: 'var(--sidebar-width)',
      background: 'var(--color-surface)',
      borderRight: '0.5px solid var(--color-border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Identity — top padding clears the macOS traffic-light controls
          (hiddenInset titlebar) so NEXUS / the console name isn't clipped.
          Pinned: only the nav below scrolls. */}
      <div style={{
        padding: '40px 12px 16px',
        borderBottom: '0.5px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: 'var(--color-text)',
          lineHeight: 1,
        }}>NEXUS</div>
        <div style={{
          fontSize: 10,
          color: 'var(--color-text-3)',
          marginTop: 4,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>{vaultName ? `${vaultName} Console` : 'Director Console'}</div>
      </div>

      {/* Scrollable nav — the identity card above and version bar below stay pinned. */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        paddingTop: 6,
      }}>
        {/* WORK — task-first surfaces (audit IA: Chats · Projects · Library · …) */}
        {section('Work')}
        {nav('chat', 'messages', 'Chat', 'Solo or council — one composer')}
        {projects && nav('projects', 'folders', 'Projects', 'Durable context boundaries')}
        {library && nav('library', 'files', 'Library', 'Durable artifacts and outputs')}
        {/* Invoke + Sandbox folded INTO Chat (David's IA review, 2026-07-14 pm):
            role + doc-attach live in the composer popover; the council protocols
            (roundtable/debate/orchestrator/director) in the protocol selector.
            Views stay renderable (AgentMap still deep-links to invoke; stale
            view state must not white-screen) — they just leave the nav. */}

        {/* Personal top-level surfaces: Domains + Signal keep their own entries. */}
        {(hasPnav('domains') || hasPnav('signal')) && section('Domains')}
        {pnav('domains')}
        {pnav('signal')}

        {/* SYSTEM — the whole observation layer under ONE Visibility workspace
            (audit Finding 2). Membrane folds in here as a tab; Overview/Agents/
            Knowledge/Runs/Canon/Status are its tabs, rendered in the main area. */}
        {section('System')}
        {nav('dashboard', 'eye', 'Visibility', 'Overview · Agents · Knowledge · Runs · Canon', statusBadge, visibilityActive)}

        <div style={{ flex: 1 }} />

        {/* BOTTOM */}
        {builder && nav('builder', 'wand', 'Builder', 'Build your first agentic system')}
        {pnav('updates')}
        {nav('settings', 'settings', 'Settings', 'API keys and configuration')}
      </div>

      <div style={{
        padding: '10px 12px',
        borderTop: '0.5px solid var(--color-border)',
        fontSize: 10,
        color: 'var(--color-text-3)',
        letterSpacing: '0.03em',
      }}>
        Nexus v0.3 · {vaultName || 'no vault connected'}
      </div>
    </div>
  )
}
