'use client'

import { useState } from 'react'
import { BottomTabs, type TabId } from './bottom-tabs'
import { HomeView } from './home-view'
import { AAView } from './aa-view'
import { NewsView } from './news-view'
import { MenuView } from './menu-view'
import { YardLayoutView } from './yard-layout-view'
import { StaffAttendanceView } from './staff-attendance-view'

export function AttendanceApp() {
  const [tab, setTab] = useState<TabId>('home')

  return (
    <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col bg-background">
      <main className="flex flex-1 flex-col px-4 pb-24 pt-6">
        {tab === 'home' && <HomeView />}
        {tab === 'aa' && <AAView />}
        {tab === 'news' && <NewsView />}
        {tab === 'yard' && <YardLayoutView />}
        {tab === 'staff' && <StaffAttendanceView />}
        {tab === 'menu' && <MenuView />}
      </main>
      <BottomTabs active={tab} onChange={setTab} />
    </div>
  )
}
