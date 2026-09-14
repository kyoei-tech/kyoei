import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'

/**
 * Shared 戻る button for sub-pages. `main` in attendance-app.tsx is the
 * app's one scrolling container, so `sticky top-0` here pins this header
 * to the top-left of the screen as that page's content scrolls beneath it.
 *
 * Deliberately `sticky`, not `position: fixed` — sticky sticks relative to
 * its scrolling ancestor's own box, which stays stable as mobile browser
 * chrome (the URL bar) collapses/expands. A `fixed` element anchored to the
 * document viewport would visibly drift during that same collapse, which is
 * exactly why BottomTabs (bottom-tabs.tsx) avoids `fixed` too.
 */
export function BackHeader({
  label = '戻る',
  onBack,
  trailing,
}: {
  label?: string
  onBack: () => void
  trailing?: ReactNode
}) {
  return (
    <div className="sticky top-0 z-10 -mx-4 mb-3 flex items-center justify-between gap-2 bg-background px-4 pb-2 pt-1">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 self-start rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-transform active:scale-95"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {label}
      </button>
      {trailing}
    </div>
  )
}
