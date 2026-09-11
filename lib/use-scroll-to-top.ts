'use client'

import { useEffect } from 'react'

/**
 * Scrolls the app's content area to the top whenever any value in `deps`
 * changes (or on mount if `deps` is omitted).
 *
 * Several screens in this app swap their visible content in place (e.g.
 * opening a settings/detail sub-page from a list) without a route change,
 * so the browser keeps whatever scroll position the previous content had.
 * That makes the new content appear to open "from the middle" instead of
 * from the top. Call this at the top of a component that represents a
 * freshly-opened sub-page to guarantee it always starts scrolled to the top.
 *
 * Targets `#app-scroll-container` (the `<main>` in attendance-app.tsx)
 * rather than `window` — the app shell is a fixed-height flexbox with its
 * own internal scroll area, not a scrolling `body`, so `window.scrollTo`
 * would be a no-op.
 */
export function useScrollToTop(deps: React.DependencyList = []) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps is caller-controlled by design
  useEffect(() => {
    document.getElementById('app-scroll-container')?.scrollTo(0, 0)
  }, deps)
}
