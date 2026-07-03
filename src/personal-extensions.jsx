// ─────────────────────────────────────────────────────────────────────────────
// PERSONAL EXTENSIONS — Goose's personal Nexus only.
//
// This is the ONE file that holds Goose-only console features. The B↔C sync
// (sync-nexus.command) treats it as PROTECTED and never overwrites it, so
// App.jsx / Sidebar.jsx can stay byte-identical between the product console (B)
// and this personal Nexus (C). Add personal-only views (Umbruh interface,
// Sandbox, Membrane, etc.) here — never by editing App.jsx / Sidebar.jsx.
//
// The product build (B) ships an EMPTY version of this file.
// ─────────────────────────────────────────────────────────────────────────────
import Sandbox from './components/Sandbox.jsx'
import Membrane from './components/Membrane.jsx'
import Updates from './components/Updates.jsx'
import SignalDesk from './components/SignalDesk.jsx'

// Nav entries appended after the shared "Act" section. `section` starts a new
// sidebar group when it differs from the running section (which begins at 'Act').
export const personalNav = [
  { section: 'Act',    id: 'sandbox',  icon: 'users-group',     label: 'Sandbox',  sub: 'Many models, one council' },
  { section: 'Act',    id: 'signal',   icon: 'antenna',         label: 'Signal Desk', sub: 'Fleet forks + daily brief' },
  { section: 'Studio', id: 'membrane', icon: 'topology-star-3', label: 'Membrane', sub: 'SFS Vault shared intelligence' },
  { section: 'Studio', id: 'updates',  icon: 'cloud-download',  label: 'Updates',  sub: 'Pull shared UI from the product' },
]

// Command-bar labels for personal views (merged over the shared VIEW_META).
export const personalViewMeta = {
  sandbox:  { label: 'Sandbox',  sub: 'Multi-model council' },
  signal:   { label: 'Signal Desk', sub: 'Signal fleet forks + Signal Brief' },
  membrane: { label: 'Membrane', sub: 'SFS Vault shared-intelligence layer' },
  updates:  { label: 'Updates',  sub: 'Sync shared UI from the product console' },
}

// Render functions for personal views, keyed by view id. Receive shared props.
export const personalViews = {
  sandbox:  ({ canonDocs }) => <Sandbox canonDocs={canonDocs} />,
  signal:   () => <SignalDesk />,
  membrane: () => <Membrane />,
  updates:  () => <Updates />,
}
