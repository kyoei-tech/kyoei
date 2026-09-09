'use client'

import { useEffect, useState } from 'react'
import { useSettings } from '@/lib/settings/settings-context'
import { BottomTabs, type TabId } from './bottom-tabs'
import { HomeView } from './home-view'
import { NewsView } from './news-view'
import { MenuView, type MenuItemId } from './menu-view'
import { YardLayoutView } from './yard-layout-view'
import { StaffAttendanceView } from './staff-attendance-view'

export function AttendanceApp() {
  const [tab, setTab] = useState<TabId>('home')
  // Bumped every time the menu tab is tapped (even while already on it), so
  // remounting MenuView with this as its key always resets it back to the
  // menu's top-level list instead of staying on whatever sub-page was open.
  const [menuResetKey, setMenuResetKey] = useState(0)
  // Which menu item MenuView should open directly into on its next mount.
  // Reset to null for a normal tap on the menu tab so it lands on the list.
  const [menuInitialItem, setMenuInitialItem] = useState<MenuItemId | null>(
    null,
  )
  // Bumped every time the home tab is tapped (even while already on it), so
  // HomeView can jump back to its top-level screen out of 運行状況/休息状況.
  const [homeSignal, setHomeSignal] = useState(0)
  const { fontScaleFor } = useSettings()

  // Font size is configured per bottom tab in Settings (メニュー > 設定).
  // Since only one tab is mounted at a time, scaling the document root's
  // rem base on tab change gives every existing rem-based Tailwind class
  // an accurate per-tab scale without touching each component.
  useEffect(() => {
    document.documentElement.style.fontSize = `${16 * fontScaleFor(tab)}px`
  }, [tab, fontScaleFor])

  function handleTabChange(id: TabId) {
    if (id === 'menu') {
      setMenuInitialItem(null)
      setMenuResetKey((k) => k + 1)
    }
    if (id === 'home') {
      setHomeSignal((k) => k + 1)
    }
    setTab(id)
  }

  // Lets other tabs (e.g. the home tab's accident streak badge) jump
  // straight into a menu sub-page instead of just switching to the menu tab.
  function openMenuItem(id: MenuItemId) {
    setMenuInitialItem(id)
    setMenuResetKey((k) => k + 1)
    setTab('menu')
  }

  return (
    <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col bg-background">
      <main className="flex flex-1 flex-col px-4 pb-24 pt-6">
        {tab === 'home' && (
          <HomeView onOpenAccidentCalendar={() => openMenuItem('accidents')} />
        )}
        {tab === 'news' && <NewsView />}
        {tab === 'yard' && <YardLayoutView />}
        {tab === 'staff' && <StaffAttendanceView />}
        {tab === 'menu' && (
          <MenuView key={menuResetKey} initialItem={menuInitialItem} />
        )}
      </main>
      <BottomTabs active={tab} onChange={handleTabChange} />
    </div>
  )
}
