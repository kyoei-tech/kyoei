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
 *
 * Three variants cover every 戻る button in the app:
 *  - "primary" (default): the bold filled pill used to leave a top-level
 *    sub-page and return to the previous menu/tab.
 *  - "subtle": the bordered card-style pill used to step back one level
 *    within a feature's own drill-down (e.g. カテゴリー一覧 -> 質問一覧).
 *  - "icon": a small circular icon-only button paired with inline content
 *    (e.g. a title) via `trailing`, used inside a feature's own detail
 *    header row rather than as a page's top banner.
 */
export function BackHeader({
  label = '戻る',
  onBack,
  trailing,
  variant = 'primary',
}: {
  label?: string
  onBack: () => void
  trailing?: ReactNode
  variant?: 'primary' | 'subtle' | 'icon'
}) {
  return (
    <div className="sticky top-0 z-10 -mx-4 mb-3 flex items-center gap-2 bg-background px-4 pb-2 pt-1">
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={onBack}
          aria-label={label}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-accent active:scale-90"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onBack}
          className={
            variant === 'subtle'
              ? 'flex w-fit shrink-0 items-center gap-1.5 self-start rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-95'
              : 'flex shrink-0 items-center gap-1.5 self-start rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-transform active:scale-95'
          }
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {label}
        </button>
      )}
      {trailing && (
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          {trailing}
        </div>
      )}
    </div>
  )
}
