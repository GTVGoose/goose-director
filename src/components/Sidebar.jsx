import { personalNav } from '../personal-extensions.jsx'

export default function Sidebar({ view, onNav, escalations, reviews, vaultName, chatHome, councilLabel, membrane, library, runInspector, projects, visibility, builder }) {

  const nav = (id, icon, label, sub, badge) => (
    <button
      key={id}
      onClick={() => onNav(id)}
      className={view === id ? undefined : 'nav-btn'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '7px 10px',
        width: '100%',
        background: view === id
          ? 'var(--color-accent-bg)'
          : 'none',
        border: 'none',
        borderLeft: view === id
          ? '2px solid var(--color-accent)'
          : '2px solid transparent',
        borderRadius: '0 var(--radius) var(--radius) 0',
        fontSize: 13,
        color: view === id ? 'var(--color-text)' : 'var(--color-text-2)',
        fontWeight: view === id ? 500 : 400,
        textAlign: 'left',
        cursor: 'pointer',
        marginBottom: 1,
        transition: 'background var(--dur-fast), color var(--dur-fast), border-color var(--dur-fast)',
      }}
    >
      <i className={`ti ti-${icon}`} style={{
        fontSize: 15,
        flexShrink: 0,
        color: view === id ? 'var(--color-accent-text)' : 'var(--color-text-3)',
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
        {sub && view !== id && (
          <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 1, lineHeight: 1.3 }}>{sub}</div>
        )}
      </div>
    </button>
  )

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
        {/* Chat-first landing (T10) — flag-gated (G7). Default off → not rendered,
            so the nav is byte-identical to today until David flips ui.chatHome. */}
        {chatHome && section('Do')}
        {chatHome && nav('chat', 'messages', 'Chat', 'Talk to the Brain')}

        {/* Full Visibility consolidation (owner directive 2026-07-17): with
            ui.visibility on, EVERY information surface — Overview, Agents,
            Knowledge, Status, Canon, Library, Runs, Projects — lives as a tab
            inside the single Visibility entry, and the Observe/Monitor sidebar
            sections fold away entirely. The status badge (escalations/reviews)
            moves onto the Visibility entry so the signal survives the fold.
            With the flag off, the classic expanded nav renders unchanged. */}
        {!visibility && section('Observe')}
        {!visibility && nav('dashboard', 'layout-dashboard', 'Overview', 'System state at a glance')}
        {!visibility && nav('agents', 'users', 'Agents', 'Who runs, how, and where')}
        {!visibility && nav('knowledge', 'books', 'Knowledge', 'Search all canon and docs')}
        {/* GU8.1/8.3: standalone Library/Projects entries — only meaningful in
            the expanded (non-consolidated) IA. */}
        {!visibility && library && nav('library', 'files', 'Library', 'Durable artifacts and outputs')}
        {!visibility && projects && nav('projects', 'folders', 'Projects', 'Durable context boundaries')}

        {visibility && section('System')}
        {visibility && nav('visibility', 'eye', 'Visibility', 'Explore the system — overview to records', statusBadge)}

        {!visibility && section('Monitor')}
        {!visibility && runInspector && nav('runs', 'list-details', 'Runs', 'Council run traces')}
        {!visibility && nav('status', 'bell', 'Status Layer', 'Background agent activity', statusBadge)}
        {!visibility && nav('canon', 'git-branch', 'Canon State', 'What\'s inside and outside')}

        {section('Act')}
        {/* GU10.2: Agentic System Builder — flag-gated (ui.builder, default off; flip is G7). */}
        {builder && nav('builder', 'wand', 'Builder', 'Build your first agentic system')}
        {/* Invoke + Council folded into Chat (owner directive 2026-07-17): the
            chat landing conducts one-off work and convenes the council rail.
            Recurring work gets its own surface: */}
        {nav('automations', 'repeat', 'Automations', 'Scheduled prompts that run themselves')}
        {renderPersonalNav()}

        <div style={{ flex: 1 }} />

        {nav('help', 'help', 'Help', 'Guides and glossary')}
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
