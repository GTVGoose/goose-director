// Accent presets for UI personalization. Each maps onto the console's four
// accent CSS variables; the default (violet) matches the original Goose look.
export const ACCENTS = {
  violet: { label: 'Violet — the unseen layer', main: '#6a54b8', text: '#9880d8', bg: '#0e0a20', border: '#1e1640' },
  ember:  { label: 'Ember — firelight',         main: '#c8a44a', text: '#ddc070', bg: '#1a1508', border: '#3a2e10' },
  tide:   { label: 'Tide — cold blue',          main: '#4a7ca8', text: '#6a9ec8', bg: '#08121e', border: '#142030' },
  grove:  { label: 'Grove — the bridge',        main: '#348a72', text: '#50a888', bg: '#061812', border: '#0e3024' },
  rose:   { label: 'Rose — signal red',         main: '#b8546a', text: '#d88098', bg: '#200a10', border: '#401620' },
}

export function applyAccent(key) {
  const a = ACCENTS[key] || ACCENTS.violet
  const root = document.documentElement.style
  root.setProperty('--color-accent', a.main)
  root.setProperty('--color-accent-text', a.text)
  root.setProperty('--color-accent-bg', a.bg)
  root.setProperty('--color-accent-border', a.border)
}

// ── Full-UI themes (T23) ──────────────────────────────────────────────────
// A theme is a flat map of CSS-var → value; only keys that DIFFER from the
// default "studio" baseline need listing. `applyTheme` RESETS every
// theme-controlled var to its captured default first, then applies the theme's
// overrides — so switching themes never leaves a stale override behind. The
// accent picker stays independent (option A): App boot and Settings call
// `applyAccent` AFTER `applyTheme`, so the user's accent always wins even over a
// theme that lists accent vars. `studio` = `{}` = the app.css :root baseline, so
// an absent / 'studio' theme is byte-identical to today (config.ui.theme absent
// ⇒ studio). T23 ships the engine + one dark proof theme (Midnight).
export const THEMES = {
  studio: { label: 'Studio — warm mineral (default)', vars: {} },
  midnight: {
    label: 'Midnight — cool slate',
    vars: {
      '--color-bg':            '#0a0c12',
      '--color-surface':       '#10131c',
      '--color-surface-2':     '#171b27',
      '--color-surface-3':     '#1e2333',
      '--color-border':        'rgba(210,224,255,0.09)',
      '--color-border-mid':    'rgba(210,224,255,0.14)',
      '--color-border-strong': 'rgba(210,224,255,0.22)',
      '--color-text':          '#e6ebf5',
      '--color-text-2':        '#9aa4bc',
      '--color-text-3':        '#727c95',
      '--radius':              '6px',
      '--radius-lg':           '10px',
    },
  },
}

// The union of every key any theme overrides — the exact set `applyTheme` must
// be able to reset. Captured (computed) from :root ONCE, lazily, before the
// first override lands, so applyTheme('studio') restores the app.css baseline
// exactly (getComputedStyle returns resolved rgb()/px, which set back cleanly).
const THEME_VAR_KEYS = [...new Set(
  Object.values(THEMES).flatMap(t => Object.keys(t.vars))
)]
let _defaults = null
function captureDefaults() {
  if (_defaults) return _defaults
  const cs = getComputedStyle(document.documentElement)
  _defaults = {}
  for (const k of THEME_VAR_KEYS) _defaults[k] = cs.getPropertyValue(k).trim()
  return _defaults
}

export function applyTheme(key) {
  const t = THEMES[key] || THEMES.studio
  const root = document.documentElement
  const defaults = captureDefaults()   // MUST run before any override is set
  // 1. reset every theme-controlled var to its captured default
  for (const k of THEME_VAR_KEYS) {
    const d = defaults[k]
    if (d) root.style.setProperty(k, d)
    else root.style.removeProperty(k)
  }
  // 2. apply this theme's overrides
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v)
  // 3. data-theme hook for [data-theme="…"] texture/effect CSS (used by T24 packs)
  root.dataset.theme = THEMES[key] ? key : 'studio'
}
