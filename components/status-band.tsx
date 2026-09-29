'use client'

import { useEffect, useState } from 'react'
import { useSettings } from '@/lib/settings/settings-context'
import { readDriverMode, readTimecardClockedIn } from '@/lib/app-status'

// A thin band, deliberately the same bg-brand-lime as BottomTabs right below
// it (see attendance-app.tsx), so the two read as one fixed footer piece
// while always surfacing the current 出帰庫/出退勤 status no matter which
// tab is open. Polls the shift/timecard localStorage state directly rather
// than lifting HomeView/TimecardHomeView's state up, since this is a
// read-only reflection of it.
const POLL_MS = 500

export function StatusBand() {
  const { appMode } = useSettings()
  const [, setRefresh] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setRefresh((n) => n + 1), POLL_MS)
    return () => clearInterval(id)
  }, [])

  if (appMode === 'timecard') {
    const clockedIn = readTimecardClockedIn()
    return (
      <div
        aria-live="polite"
        className={`flex shrink-0 items-center justify-center bg-brand-lime py-1 text-xs font-bold tracking-wide ${
          clockedIn ? 'text-white' : 'text-orange-600'
        }`}
      >
        {clockedIn ? '出勤中' : '退勤済み'}
      </div>
    )
  }

  const mode = readDriverMode()
  if (mode === 'idle') return null

  return (
    <div
      aria-live="polite"
      className={`flex shrink-0 items-center justify-center bg-brand-lime py-1 text-xs font-bold tracking-wide ${
        mode === 'departure' ? 'text-white' : 'text-orange-600'
      }`}
    >
      {mode === 'departure' ? '運行中' : '休息中'}
    </div>
  )
}
