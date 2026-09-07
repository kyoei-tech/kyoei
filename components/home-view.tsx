'use client'

import { useCallback, useEffect, useState } from 'react'
import { LogIn, LogOut } from 'lucide-react'
import {
  addHours,
  formatClock,
  formatDuration,
  isSaturday,
} from '@/lib/shift-time'
import { LiveClock } from './live-clock'
import { StatusDisplay } from './status-display'
import { ShiftTimer } from './shift-timer'

type Mode = 'idle' | 'departure' | 'return'

const DISPLAY_OFFSETS = [3, 9, 33]
const MS_PER_HOUR = 3600 * 1000

export function HomeView() {
  const [now, setNow] = useState(() => new Date())
  const [mode, setMode] = useState<Mode>('idle')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [displayOffset, setDisplayOffset] = useState(() =>
    isSaturday(new Date()) ? 33 : 9,
  )
  const [countdownOffset, setCountdownOffset] = useState(() =>
    isSaturday(new Date()) ? 33 : 9,
  )

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 250)
    return () => clearInterval(id)
  }, [])

  const handleDeparture = useCallback(() => {
    setMode('departure')
    setStartedAt(Date.now())
  }, [])

  const handleReturn = useCallback(() => {
    const saturday = isSaturday(new Date())
    setDisplayOffset(saturday ? 33 : 9)
    setCountdownOffset(saturday ? 33 : 9)
    setMode('return')
    setStartedAt(Date.now())
  }, [])

  const cycleDisplayOffset = useCallback(() => {
    setDisplayOffset((current) => {
      const index = DISPLAY_OFFSETS.indexOf(current)
      return DISPLAY_OFFSETS[(index + 1) % DISPLAY_OFFSETS.length]
    })
  }, [])

  // Second (linked) display parts
  let statusParts = formatClock(now)
  if (mode === 'departure' && startedAt != null) {
    statusParts = formatClock(new Date(startedAt))
  } else if (mode === 'return' && startedAt != null) {
    statusParts = formatClock(addHours(new Date(startedAt), displayOffset))
  }

  // Timer text
  let timerText = '00:00:00'
  let finished = false
  if (mode === 'departure' && startedAt != null) {
    timerText = formatDuration(now.getTime() - startedAt)
  } else if (mode === 'return' && startedAt != null) {
    const remaining = startedAt + countdownOffset * MS_PER_HOUR - now.getTime()
    timerText = formatDuration(remaining)
    finished = remaining <= 0
  }

  return (
    <div className="flex flex-col gap-4">
      <LiveClock parts={formatClock(now)} />

      <StatusDisplay
        parts={statusParts}
        mode={mode}
        displayOffset={displayOffset}
        onCycleOffset={cycleDisplayOffset}
      />

      <ShiftTimer
        mode={mode}
        text={timerText}
        finished={finished}
        countdownOffset={countdownOffset}
        onSelectCountdown={setCountdownOffset}
      />

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={handleDeparture}
          aria-pressed={mode === 'departure'}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-3xl border py-6 text-lg font-bold transition-all active:scale-[0.97] ${
            mode === 'departure'
              ? 'border-secondary bg-secondary text-secondary-foreground shadow-lg shadow-secondary/20'
              : 'border-border bg-card text-secondary hover:border-secondary/60'
          }`}
        >
          <LogOut className="h-6 w-6" aria-hidden="true" />
          出庫
        </button>
        <button
          type="button"
          onClick={handleReturn}
          aria-pressed={mode === 'return'}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-3xl border py-6 text-lg font-bold transition-all active:scale-[0.97] ${
            mode === 'return'
              ? 'border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20'
              : 'border-border bg-card text-primary hover:border-primary/60'
          }`}
        >
          <LogIn className="h-6 w-6" aria-hidden="true" />
          帰庫
        </button>
      </div>
    </div>
  )
}
