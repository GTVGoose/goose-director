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
// accent picker stays independent (option A, theme-system.md §5): App boot and
// Settings call `applyAccent` AFTER `applyTheme`, so the user's accent always
// wins even over a theme that lists accent vars. `studio` = `{}` = the app.css
// :root baseline, so an absent / 'studio' theme is byte-identical to today —
// that's the whole reversibility story (config.ui.theme absent ⇒ studio).
// T24 ships the named packs below. Each is a FULL palette — every
// ground/surface/border/text/posture/status/availability token, the surface
// effects (shadow/glow/scrim/selection/row-hover), the radius+border-width
// density, and the font stack — so no warm "studio" token leaks into a pack
// (Midnight's known nit; the packs fully fill). Accent stays independent
// (option A): applyAccent runs AFTER applyTheme, so a pack never lists accent
// vars. Contrast contract: every pack's body text is ≥AA (mostly AAA) on all
// four surfaces, text-2 ≥AA, text-3 recedes at ≥3:1 (WCAG large), and posture/
// status labels ≥AA on their own fills — verified with a relative-luminance
// checker across the whole set (0 sub-AA/recede failures). Fonts prefer a
// system-available stack first; a bundled display font (true pixel/CRT face)
// is a documented follow-up, not a blocker. Reduced-motion is handled globally
// in app.css, so any future [data-theme] texture/glow CSS inherits the kill.
// Packs are token-only for v1 (no [data-theme] texture layer yet) — that keeps
// the whole feature a single-file, fully-reversible data change: ui.theme
// absent ⇒ studio ⇒ byte-identical to today; picking a pack only sets vars.
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

  // ── 8-Bit — arcade dusk (dark) ── saturated primaries, square corners,
  // chunky 2–3px borders, hard offset shadow, monospace UI. NES-at-night.
  eightbit: {
    label: '8-Bit — arcade dusk',
    vars: {
      '--color-bg':            '#0d0620',
      '--color-surface':       '#170a30',
      '--color-surface-2':     '#1f0f40',
      '--color-surface-3':     '#291550',
      '--color-border':        'rgba(130,190,255,0.22)',
      '--color-border-mid':    'rgba(130,190,255,0.38)',
      '--color-border-strong': 'rgba(130,190,255,0.58)',
      '--color-text':          '#f4f2ff',
      '--color-text-2':        '#b8a8e8',
      '--color-text-3':        '#9384c8',
      '--color-text-disabled': '#5a4e80',
      '--color-active':        '#ffcc33', '--color-active-bg': '#2a1e00', '--color-active-text': '#ffdb63', '--color-active-border': '#5a4410',
      '--color-passive':       '#33aaff', '--color-passive-bg': '#001d33', '--color-passive-text': '#6cc0ff', '--color-passive-border': '#0f3450',
      '--color-recursive':     '#cc66ff', '--color-recursive-bg': '#1c0a30', '--color-recursive-text': '#dd94ff', '--color-recursive-border': '#3a1458',
      '--color-dual':          '#2ee08a', '--color-dual-bg': '#002a1a', '--color-dual-text': '#5cf0a8', '--color-dual-border': '#0e3d28',
      '--color-escalation-bg': '#2a0808', '--color-escalation-text': '#ff5c5c', '--color-escalation-border': '#5a1414',
      '--color-review-bg':     '#2a1c00', '--color-review-text': '#ffaa33', '--color-review-border': '#5a3c10',
      '--color-logged-bg':     '#002616', '--color-logged-text': '#33dd77', '--color-logged-border': '#0e3d26',
      '--color-available':     '#33dd77', '--color-unavailable': '#ff5c5c',
      '--color-available-bg':  'rgba(51,221,119,0.16)', '--color-available-border': 'rgba(51,221,119,0.34)',
      '--color-unavailable-bg':'rgba(255,92,92,0.14)',  '--color-unavailable-border': 'rgba(255,92,92,0.30)',
      '--color-neutral-bg':    'rgba(147,132,200,0.14)',
      '--shadow-popover':      '4px 4px 0 0 rgba(0,0,0,0.7)',
      '--shadow-popover-2':    '4px 4px 0 0 rgba(0,0,0,0.7)',
      '--shadow-inset-hi':     'inset 0 1px 0 rgba(255,255,255,0.06)',
      '--color-glow-rgb':      '204,102,255',
      '--color-scrim':         'rgba(5,2,15,0.7)',
      '--color-selection':     'rgba(204,102,255,0.4)',
      '--color-row-hover':     'rgba(180,168,232,0.08)',
      '--color-scrollbar-hover':'rgba(180,168,232,0.4)',
      '--radius': '0px', '--radius-lg': '0px', '--radius-sm': '0px', '--radius-md': '2px', '--radius-pill': '0px',
      '--radius-2': '0px', '--radius-5': '2px', '--radius-7': '2px', '--radius-8': '2px', '--radius-10': '2px', '--radius-13': '2px', '--radius-20': '2px',
      '--border-width': '2px', '--border-width-strong': '3px',
      '--font-ui':   "'Courier New', 'Lucida Console', monospace",
      '--font-mono': "'Courier New', 'Lucida Console', monospace",
    },
  },

  // ── Cyberpunk — neon rain (dark) ── near-black blue ground, cyan/magenta
  // neon, glow-tinted shadows, tight radii, condensed UI + tech-mono.
  cyberpunk: {
    label: 'Cyberpunk — neon rain',
    vars: {
      '--color-bg':            '#05070f',
      '--color-surface':       '#0a0e1c',
      '--color-surface-2':     '#0f1528',
      '--color-surface-3':     '#161d38',
      '--color-border':        'rgba(0,240,255,0.16)',
      '--color-border-mid':    'rgba(0,240,255,0.30)',
      '--color-border-strong': 'rgba(255,45,170,0.55)',
      '--color-text':          '#eafcff',
      '--color-text-2':        '#7fd4e0',
      '--color-text-3':        '#5a97a8',
      '--color-text-disabled': '#3a5560',
      '--color-active':        '#ff2daa', '--color-active-bg': '#26041a', '--color-active-text': '#ff66c2', '--color-active-border': '#4a0c34',
      '--color-passive':       '#00e5ff', '--color-passive-bg': '#00212a', '--color-passive-text': '#5cf0ff', '--color-passive-border': '#0a3d4a',
      '--color-recursive':     '#b14dff', '--color-recursive-bg': '#160a2a', '--color-recursive-text': '#cd8cff', '--color-recursive-border': '#2e1450',
      '--color-dual':          '#00ffa3', '--color-dual-bg': '#002419', '--color-dual-text': '#5cffc2', '--color-dual-border': '#0a3d2c',
      '--color-escalation-bg': '#26060e', '--color-escalation-text': '#ff3d6e', '--color-escalation-border': '#4a0e20',
      '--color-review-bg':     '#241800', '--color-review-text': '#ffb800', '--color-review-border': '#453000',
      '--color-logged-bg':     '#002419', '--color-logged-text': '#00ffa3', '--color-logged-border': '#0a3d2c',
      '--color-available':     '#00ffa3', '--color-unavailable': '#ff3d6e',
      '--color-available-bg':  'rgba(0,255,163,0.14)', '--color-available-border': 'rgba(0,255,163,0.30)',
      '--color-unavailable-bg':'rgba(255,61,110,0.14)','--color-unavailable-border': 'rgba(255,61,110,0.30)',
      '--color-neutral-bg':    'rgba(90,151,168,0.14)',
      '--shadow-popover':      '0 8px 28px rgba(0,240,255,0.14), 0 0 12px rgba(255,45,170,0.12)',
      '--shadow-popover-2':    '0 8px 28px rgba(0,240,255,0.14), 0 0 12px rgba(255,45,170,0.12)',
      '--shadow-inset-hi':     'inset 0 1px 0 rgba(0,240,255,0.06)',
      '--color-glow-rgb':      '255,45,170',
      '--color-scrim':         'rgba(2,3,8,0.72)',
      '--color-selection':     'rgba(0,240,255,0.28)',
      '--color-row-hover':     'rgba(0,240,255,0.05)',
      '--color-scrollbar-hover':'rgba(0,240,255,0.4)',
      '--radius': '2px', '--radius-lg': '3px', '--radius-sm': '2px', '--radius-md': '3px',
      '--radius-5': '2px', '--radius-7': '3px', '--radius-8': '4px', '--radius-10': '4px', '--radius-13': '5px',
      '--font-ui':   "'Rajdhani', 'Eurostile', 'Segoe UI', system-ui, sans-serif",
      '--font-mono': "'Share Tech Mono', 'SF Mono', 'Menlo', monospace",
    },
  },

  // ── Parchment — candlelit tome (LIGHT) ── the one light pack: warm cream
  // ground, dark-brown ink, serif UI, soft warm shadows. Tests the light
  // luminance regime end-to-end (text is dark ON light, ≥AAA on every surface).
  parchment: {
    label: 'Parchment — candlelit tome',
    vars: {
      '--color-bg':            '#e8dcc0',
      '--color-surface':       '#f0e6d0',
      '--color-surface-2':     '#e2d4b4',
      '--color-surface-3':     '#d8c8a4',
      '--color-border':        'rgba(74,54,28,0.20)',
      '--color-border-mid':    'rgba(74,54,28,0.32)',
      '--color-border-strong': 'rgba(74,54,28,0.48)',
      '--color-text':          '#2e2214',
      '--color-text-2':        '#5a4a30',
      '--color-text-3':        '#6e5c40',
      '--color-text-disabled': '#a89876',
      '--color-active':        '#9a6a10', '--color-active-bg': '#ecd9a8', '--color-active-text': '#6e4a08', '--color-active-border': '#c8a860',
      '--color-passive':       '#3a5a80', '--color-passive-bg': '#cdd8e4', '--color-passive-text': '#284566', '--color-passive-border': '#8098b4',
      '--color-recursive':     '#6a3a8a', '--color-recursive-bg': '#e0d0e4', '--color-recursive-text': '#4e2668', '--color-recursive-border': '#a480b4',
      '--color-dual':          '#2e7a4e', '--color-dual-bg': '#cce0d0', '--color-dual-text': '#1e5836', '--color-dual-border': '#78a888',
      '--color-escalation-bg': '#f0cdc0', '--color-escalation-text': '#a02818', '--color-escalation-border': '#c88070',
      '--color-review-bg':     '#f0dcb0', '--color-review-text': '#7e5210', '--color-review-border': '#c8a060',
      '--color-logged-bg':     '#cce0c8', '--color-logged-text': '#2e6a34', '--color-logged-border': '#84b080',
      '--color-available':     '#2e7a3e', '--color-unavailable': '#b02818',
      '--color-available-bg':  'rgba(46,122,62,0.16)', '--color-available-border': 'rgba(46,122,62,0.34)',
      '--color-unavailable-bg':'rgba(176,40,24,0.14)', '--color-unavailable-border': 'rgba(176,40,24,0.30)',
      '--color-neutral-bg':    'rgba(74,54,28,0.10)',
      '--shadow-popover':      '0 6px 20px rgba(74,54,28,0.28)',
      '--shadow-popover-2':    '0 6px 20px rgba(74,54,28,0.28), 0 1px 2px rgba(74,54,28,0.24)',
      '--shadow-inset-hi':     'inset 0 1px 0 rgba(255,255,255,0.4)',
      '--color-glow-rgb':      '154,106,16',
      '--color-scrim':         'rgba(40,30,16,0.5)',
      '--color-selection':     'rgba(154,106,16,0.28)',
      '--color-row-hover':     'rgba(74,54,28,0.06)',
      '--color-scrollbar-hover':'rgba(74,54,28,0.35)',
      '--radius': '3px', '--radius-lg': '5px',
      '--font-ui':   "'Iowan Old Style', 'Palatino Linotype', 'Palatino', 'Book Antiqua', Georgia, serif",
      '--font-mono': "'Courier New', 'Courier', monospace",
    },
  },

  // ── Terminal — green phosphor (dark) ── CRT green-on-black, all-mono,
  // square corners, hairline 1px rules, soft green glow shadow.
  terminal: {
    label: 'Terminal — green phosphor',
    vars: {
      '--color-bg':            '#000800',
      '--color-surface':       '#001200',
      '--color-surface-2':     '#001c00',
      '--color-surface-3':     '#002800',
      '--color-border':        'rgba(51,255,102,0.20)',
      '--color-border-mid':    'rgba(51,255,102,0.34)',
      '--color-border-strong': 'rgba(51,255,102,0.55)',
      '--color-text':          '#33ff66',
      '--color-text-2':        '#22bb44',
      '--color-text-3':        '#1c9938',
      '--color-text-disabled': '#0e5020',
      '--color-active':        '#66ff88', '--color-active-bg': '#002400', '--color-active-text': '#88ffaa', '--color-active-border': '#0e4a1c',
      '--color-passive':       '#33cc99', '--color-passive-bg': '#001e14', '--color-passive-text': '#5ce0b8', '--color-passive-border': '#0a3d2c',
      '--color-recursive':     '#88ff55', '--color-recursive-bg': '#0e2400', '--color-recursive-text': '#aaff88', '--color-recursive-border': '#1c4a0e',
      '--color-dual':          '#33ffcc', '--color-dual-bg': '#002420', '--color-dual-text': '#5cffdd', '--color-dual-border': '#0a3d38',
      '--color-escalation-bg': '#240800', '--color-escalation-text': '#ff6644', '--color-escalation-border': '#4a1408',
      '--color-review-bg':     '#242000', '--color-review-text': '#ffcc44', '--color-review-border': '#4a4008',
      '--color-logged-bg':     '#002400', '--color-logged-text': '#44ff66', '--color-logged-border': '#0e4a1c',
      '--color-available':     '#44ff66', '--color-unavailable': '#ff6644',
      '--color-available-bg':  'rgba(68,255,102,0.14)', '--color-available-border': 'rgba(68,255,102,0.30)',
      '--color-unavailable-bg':'rgba(255,102,68,0.14)', '--color-unavailable-border': 'rgba(255,102,68,0.28)',
      '--color-neutral-bg':    'rgba(51,255,102,0.10)',
      '--shadow-popover':      '0 0 16px rgba(51,255,102,0.18)',
      '--shadow-popover-2':    '0 0 16px rgba(51,255,102,0.18)',
      '--shadow-inset-hi':     'inset 0 1px 0 rgba(51,255,102,0.06)',
      '--color-glow-rgb':      '51,255,102',
      '--color-scrim':         'rgba(0,4,0,0.72)',
      '--color-selection':     'rgba(51,255,102,0.3)',
      '--color-row-hover':     'rgba(51,255,102,0.06)',
      '--color-scrollbar-hover':'rgba(51,255,102,0.4)',
      '--radius': '0px', '--radius-lg': '0px', '--radius-sm': '0px', '--radius-md': '0px', '--radius-pill': '2px',
      '--radius-2': '0px', '--radius-5': '0px', '--radius-7': '0px', '--radius-8': '0px', '--radius-10': '0px', '--radius-13': '0px', '--radius-20': '2px',
      '--border-width': '1px', '--border-width-strong': '1px',
      '--font-ui':   "'SF Mono', 'Fira Mono', 'Menlo', 'Consolas', monospace",
      '--font-mono': "'SF Mono', 'Fira Mono', 'Menlo', 'Consolas', monospace",
    },
  },

  // ── High Contrast — maximum legibility (dark, a11y) ── pure black ground,
  // pure-white text, bright rules, saturated status. Radius+font left to the
  // studio default (this pack is about colour, not shape).
  contrast: {
    label: 'High Contrast — maximum legibility',
    vars: {
      '--color-bg':            '#000000',
      '--color-surface':       '#0a0a0a',
      '--color-surface-2':     '#141414',
      '--color-surface-3':     '#1e1e1e',
      '--color-border':        'rgba(255,255,255,0.35)',
      '--color-border-mid':    'rgba(255,255,255,0.55)',
      '--color-border-strong': 'rgba(255,255,255,0.85)',
      '--color-text':          '#ffffff',
      '--color-text-2':        '#e0e0e0',
      '--color-text-3':        '#c0c0c0',
      '--color-text-disabled': '#808080',
      '--color-active':        '#ffd633', '--color-active-bg': '#332800', '--color-active-text': '#ffe066', '--color-active-border': '#665200',
      '--color-passive':       '#4db8ff', '--color-passive-bg': '#002438', '--color-passive-text': '#80ccff', '--color-passive-border': '#004a70',
      '--color-recursive':     '#c299ff', '--color-recursive-bg': '#1a0f33', '--color-recursive-text': '#d6b8ff', '--color-recursive-border': '#3a2266',
      '--color-dual':          '#4ddb99', '--color-dual-bg': '#002e1c', '--color-dual-text': '#80e6b8', '--color-dual-border': '#005c38',
      '--color-escalation-bg': '#330000', '--color-escalation-text': '#ff6666', '--color-escalation-border': '#800000',
      '--color-review-bg':     '#332200', '--color-review-text': '#ffbb44', '--color-review-border': '#805500',
      '--color-logged-bg':     '#00330f', '--color-logged-text': '#5ce67a', '--color-logged-border': '#00801f',
      '--color-available':     '#5ce67a', '--color-unavailable': '#ff6666',
      '--color-available-bg':  'rgba(92,230,122,0.18)', '--color-available-border': 'rgba(92,230,122,0.40)',
      '--color-unavailable-bg':'rgba(255,102,102,0.16)','--color-unavailable-border': 'rgba(255,102,102,0.36)',
      '--color-neutral-bg':    'rgba(255,255,255,0.12)',
      '--shadow-popover':      '0 8px 24px rgba(0,0,0,0.8)',
      '--shadow-popover-2':    '0 8px 24px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.4)',
      '--shadow-inset-hi':     'inset 0 1px 0 rgba(255,255,255,0.10)',
      '--color-glow-rgb':      '255,255,255',
      '--color-scrim':         'rgba(0,0,0,0.8)',
      '--color-selection':     'rgba(255,255,255,0.3)',
      '--color-row-hover':     'rgba(255,255,255,0.10)',
      '--color-scrollbar-hover':'rgba(255,255,255,0.6)',
      '--border-width': '1px', '--border-width-strong': '2px',
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

// ── Custom themes (T25) ─────────────────────────────────────────────────────
// A custom theme is a user-authored flat { '--token': 'value' } map, layered ON
// TOP of the active preset and UNDER the accent (accent vars aren't in the
// allow-list, so a custom theme can never touch the accent). The allow-list IS
// exactly THEME_VAR_KEYS — every token the editor exposes already lives in a
// preset's `vars`, so `applyTheme`'s existing reset loop already clears every
// key a custom theme can set; switching away / clearing needs no extra
// bookkeeping. Import (shared JSON, paste, or file) is USER-LOCAL and never
// fetches a URL; it is sanitized here AND mirrored server-side (server.mjs).
//
// SECURITY (why value validation is a positive allow-list, not a blocklist):
// several allow-listed color tokens (--color-bg, --color-surface-2/3,
// --color-border-strong, --color-scrollbar-hover, --color-selection) flow into
// the `background:` SHORTHAND in app.css, which resolves <image> values — so a
// value like `image-set("http://x" 1x)` or a CSS-escaped `\75rl(...)` would
// otherwise fetch a remote resource. We therefore validate each value against a
// strict per-TYPE shape (color / length / shadow / font / rgb-triple), reject
// ANY value containing a backslash (kills CSS escape-encoding), and reject
// image/expression/import functions. This is byte-identical to the server rule.
export const ALLOWED_CUSTOM_KEYS = new Set(THEME_VAR_KEYS)
const _CT_MAX_KEYS = 120
const _CT_MAX_VAL = 200
// per-type positive validators
const _CT_LEN    = /^-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|%)$/
const _CT_COLOR  = /^(?:#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla)\(\s*[\d.,%\s\/]+\)|[a-zA-Z]{3,20})$/
const _CT_TRIPLE = /^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/
const _CT_FONT   = /^[\w\s,'"-]+$/
const _CT_SHADOW = /^[\d.,\s#a-zA-Z()%\/-]+$/
const _CT_DANGER = /url\(|image-set|image\(|element\(|cross-fade|gradient|expression|javascript:|@import|-webkit-|-moz-/i

// Validate ONE value for ONE allow-listed key by its type. Returns true iff safe.
export function isValidCustomValue(key, v) {
  if (typeof v !== 'string') return false
  const val = v.trim()
  if (!val || val.length > _CT_MAX_VAL) return false
  if (/\\/.test(val)) return false                 // no CSS escapes, ever
  if (key.startsWith('--shadow')) return _CT_SHADOW.test(val) && !_CT_DANGER.test(val)
  if (key.startsWith('--radius') || key.startsWith('--border-width')) return _CT_LEN.test(val)
  if (key === '--font-ui' || key === '--font-mono') return _CT_FONT.test(val) && !_CT_DANGER.test(val)
  if (key === '--color-glow-rgb') return _CT_TRIPLE.test(val)
  if (key.startsWith('--color')) return _CT_COLOR.test(val)
  return false
}

export function sanitizeCustomTheme(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (Object.keys(out).length >= _CT_MAX_KEYS) break
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue
    if (!ALLOWED_CUSTOM_KEYS.has(k)) continue      // key allow-list (rejects --accent* etc.)
    if (!isValidCustomValue(k, v)) continue         // value allow-list (per-type)
    out[k] = v.trim()
  }
  return Object.keys(out).length ? out : null
}

let _defaults = null
function captureDefaults() {
  if (_defaults) return _defaults
  const cs = getComputedStyle(document.documentElement)
  _defaults = {}
  for (const k of THEME_VAR_KEYS) _defaults[k] = cs.getPropertyValue(k).trim()
  return _defaults
}

// Sticky custom-theme layer. An `undefined` custom arg ⇒ leave it AS-IS (so the
// existing one-arg applyTheme(key) callers preserve the user's custom theme when
// they only switch preset); an explicit object/null arg SETS/CLEARS it. Inits to
// null ⇒ with customTheme absent, applyTheme is byte-identical to T24.
let _customTheme = null

export function applyTheme(key, custom) {
  const t = THEMES[key] || THEMES.studio
  const root = document.documentElement
  const defaults = captureDefaults()   // MUST run before any override is set
  if (custom !== undefined) _customTheme = custom ? sanitizeCustomTheme(custom) : null
  // 1. reset every theme-controlled var to its captured default
  for (const k of THEME_VAR_KEYS) {
    const d = defaults[k]
    if (d) root.style.setProperty(k, d)
    else root.style.removeProperty(k)
  }
  // 2. apply this preset's overrides
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v)
  // 3. layer the sanitized custom theme on top (T25) — over preset, under accent
  if (_customTheme) for (const [k, v] of Object.entries(_customTheme)) root.style.setProperty(k, v)
  // 4. data-theme hook for [data-theme="…"] texture/effect CSS (used by T24 packs)
  root.dataset.theme = THEMES[key] ? key : 'studio'
}
