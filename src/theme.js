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
