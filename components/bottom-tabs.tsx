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

export function BottomTabs({
  active,
  onChange,
}: {
  active: TabId
  onChange: (id: TabId) => void
}) {
  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-md items-stretch justify-around border-t border-border bg-card/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur"
    >
      {TABS.map(({ id, label, Icon }) => {
        const isActive = id === active
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
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
