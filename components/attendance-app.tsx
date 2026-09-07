'use client'

import { useState } from 'react'
import { Bell, CalendarDays, Menu } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { BottomTabs, type TabId } from './bottom-tabs'
import { HomeView } from './home-view'
import { LolView } from './lol-view'

function Placeholder({
  Icon,
  title,
  description,
}: {
  Icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card">
        <Icon className="h-7 w-7 text-primary" aria-hidden="true" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        <p className="mt-1 max-w-xs text-pretty text-sm text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  )
}

export function AttendanceApp() {
  const [tab, setTab] = useState<TabId>('home')

  return (
    <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col bg-background">
      <main className="flex flex-1 flex-col px-4 pb-24 pt-6">
        {tab === 'home' && <HomeView />}
        {tab === 'lol' && <LolView />}
        {tab === 'aa' && (
          <Placeholder
            Icon={CalendarDays}
            title="AA"
            description="カレンダー・予定の機能をここに追加できます。"
          />
        )}
        {tab === 'news' && (
          <Placeholder
            Icon={Bell}
            title="おしらせ"
            description="通知やお知らせをここに表示します。"
          />
        )}
        {tab === 'menu' && (
          <Placeholder
            Icon={Menu}
            title="メニュー"
            description="設定やその他の項目をここにまとめます。"
          />
        )}
      </main>
      <BottomTabs active={tab} onChange={setTab} />
    </div>
  )
}
