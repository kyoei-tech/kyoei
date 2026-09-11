import { useRef } from 'react'
import { Bell, ClipboardCheck, House, Menu, Warehouse } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type TabId = 'home' | 'yard' | 'staff' | 'news' | 'menu'

const TABS: { id: TabId; label: string; Icon: LucideIcon }[] = [
  { id: 'home', label: 'ホーム', Icon: House },
  { id: 'yard', label: 'ヤード配置', Icon: Warehouse },
  { id: 'staff', label: '出勤簿', Icon: ClipboardCheck },
  { id: 'news', label: 'おしらせ', Icon: Bell },
  { id: 'menu', label: 'メニュー', Icon: Menu },
]

// Tapping the home tab 5 times within this window is a hidden gesture that
// switches between 乗務員モード and タイムカードモード. It has no visible
// affordance on purpose (office staff who only use timecard mode never need
// to see it), and does not interfere with normal single taps on the tab.
const SECRET_TAP_COUNT = 5
const SECRET_TAP_WINDOW_MS = 2000

export function BottomTabs({
  active,
  onChange,
  onSecretHomeGesture,
}: {
  active: TabId
  onChange: (id: TabId) => void
  onSecretHomeGesture?: () => void
}) {
  const homeTapCountRef = useRef(0)
  const homeTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleHomeTap() {
    homeTapCountRef.current += 1
    if (homeTapTimerRef.current) clearTimeout(homeTapTimerRef.current)
    if (homeTapCountRef.current >= SECRET_TAP_COUNT) {
      homeTapCountRef.current = 0
      onSecretHomeGesture?.()
      return
    }
    homeTapTimerRef.current = setTimeout(() => {
      homeTapCountRef.current = 0
    }, SECRET_TAP_WINDOW_MS)
  }

  return (
    // Deliberately NOT `position: fixed` — see attendance-app.tsx for why:
    // as a normal flex child of the app shell it can never drift when the
    // mobile browser chrome collapses/expands during scroll.
    <nav
      aria-label="メインナビゲーション"
      className="flex w-full shrink-0 items-stretch justify-around border-t border-border bg-card/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur"
    >
      {TABS.map(({ id, label, Icon }) => {
        const isActive = id === active
        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              if (id === 'home') handleHomeTap()
              onChange(id)
            }}
            aria-current={isActive ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[0.65rem] font-medium transition-colors ${
              isActive
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon
              className="h-5 w-5"
              strokeWidth={isActive ? 2.4 : 1.8}
              aria-hidden="true"
            />
            {label}
          </button>
        )
      })}
    </nav>
  )
}
