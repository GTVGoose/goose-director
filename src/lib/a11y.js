// Keyboard-accessibility helper (T22b). Many pickers in the app are clickable
// <div onClick> rows — mouse-only, never focusable, and they never receive the
// :focus-visible ring. Spread `clickable(onActivate, enabled)` onto such a div
// to make it a proper button for keyboard users: it wires onClick + an
// Enter/Space onKeyDown to the SAME handler, sets role="button", and makes the
// element focusable only when enabled (tabIndex 0 vs -1 so disabled rows aren't
// tab-stops). Purely additive — mouse behavior is unchanged.
export function clickable(onActivate, enabled = true) {
  return {
    onClick: onActivate,
    onKeyDown: (e) => {
      // Only activate on a key press aimed at the row ITSELF. A row may wrap a
      // nested real control (e.g. a delete <button>); without this guard the
      // nested control's bubbled Enter/Space would trigger the row AND get its
      // own default activation cancelled by preventDefault.
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault()
        onActivate(e)
      }
    },
    role: 'button',
    tabIndex: enabled ? 0 : -1,
    'aria-disabled': enabled ? undefined : true,
  }
}
