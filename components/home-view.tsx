'use client'

import { useCallback, useEffect, useState } from 'react'
import { LogIn, LogOut } from 'lucide-react'
import {
  addHours,
  formatClock,
  formatDuration,
  isSaturday,
} from '@/lib/shift-time'
import { registerSplitRest, resetSplitRestState } from '@/lib/split-rest'
import {
  startTrip,
  tapBreakCategory as tapBreakCategoryPure,
  tapResumeDriving as tapResumeDrivingPure,
  tickTrip,
  type BreakCategory,
  type TripState,
} from '@/lib/trip-log'
import { LiveClock } from './live-clock'
import { StatusDisplay } from './status-display'
import { ShiftTimer } from './shift-timer'
import { AccidentStreakBadge } from './accident-streak-badge'
import { WeeklyGoal } from './weekly-goal'
import { ConfirmActionModal } from './confirm-action-modal'
import { DrivingStatusView } from './driving-status-view'
import { RestStatusView } from './rest-status-view'

type Mode = 'idle' | 'departure' | 'return'
type Screen = 'home' | 'driving' | 'rest'
type PendingHomeAction = 'departure' | 'return' | 'split-rest' | null

const MS_PER_HOUR = 3600 * 1000
const NINE_HOURS_MS = 9 * MS_PER_HOUR
const STORAGE_KEY = 'kyoei-shift-state'

type PersistedState = {
  mode: Mode
  startedAt: number | null
  countdownOffset: number
  hour12: boolean
  trip: TripState | null
}

function loadState(): PersistedState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PersistedState
  } catch {
    return null
  }
}

export function HomeView({
  onOpenAccidentCalendar,
}: {
  onOpenAccidentCalendar?: () => void
}) {
  const [now, setNow] = useState(() => new Date())
  const [mode, setMode] = useState<Mode>('idle')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [countdownOffset, setCountdownOffset] = useState(() =>
    isSaturday(new Date()) ? 33 : 9,
  )
  const [hour12, setHour12] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [screen, setScreen] = useState<Screen>('home')
  const [trip, setTrip] = useState<TripState | null>(null)
  const [pendingHomeAction, setPendingHomeAction] =
    useState<PendingHomeAction>(null)

  const toggleFormat = useCallback(() => setHour12((v) => !v), [])

  // Restore persisted state on mount (after hydration to avoid SSR mismatch)
  useEffect(() => {
    const saved = loadState()
    if (saved) {
      setMode(saved.mode)
      setStartedAt(saved.startedAt)
      setCountdownOffset(saved.countdownOffset)
      setHour12(saved.hour12)
      setTrip(saved.trip ?? null)
    }
    setHydrated(true)
  }, [])

  // Persist whenever the tracked state changes
  useEffect(() => {
    if (!hydrated) return
    const state: PersistedState = {
      mode,
      startedAt,
      countdownOffset,
      hour12,
      trip,
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [hydrated, mode, startedAt, countdownOffset, hour12, trip])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 250)
    return () => clearInterval(id)
  }, [])

  // Applies the 30-minute 累計休憩時間 auto-reset rule as time passes.
  useEffect(() => {
    if (!trip) return
    setTrip((cur) => (cur ? tickTrip(cur, now.getTime()) : cur))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run per tick
  }, [now])

  const restElapsedMs =
    mode === 'return' && startedAt != null ? now.getTime() - startedAt : 0
  const isSplitRestEligible = mode === 'return' && restElapsedMs < NINE_HOURS_MS

  function startDeparture(now: number, splitRestRemainingMs: number | null) {
    setMode('departure')
    setStartedAt(now)
    setTrip(startTrip(now, splitRestRemainingMs))
    setScreen('home')
  }

  function confirmDeparture() {
    // A normal (non-split) departure means a full legal rest was taken,
    // which clears any in-progress split-rest sequence.
    resetSplitRestState()
    startDeparture(Date.now(), null)
    setPendingHomeAction(null)
  }

  function confirmSplitRestDeparture() {
    const { remainingMs, satisfied } = registerSplitRest(restElapsedMs)
    startDeparture(Date.now(), satisfied ? null : remainingMs)
    setPendingHomeAction(null)
  }

  function confirmReturn() {
    setCountdownOffset(isSaturday(new Date()) ? 33 : 9)
    setMode('return')
    setStartedAt(Date.now())
    setTrip(null)
    setScreen('home')
    setPendingHomeAction(null)
  }

  const handleTapCategory = useCallback((category: BreakCategory) => {
    setTrip((cur) => (cur ? tapBreakCategoryPure(cur, category, Date.now()) : cur))
  }, [])

  const handleResumeDriving = useCallback(() => {
    setTrip((cur) => (cur ? tapResumeDrivingPure(cur, Date.now()) : cur))
  }, [])

  const handleOpenStatus = useCallback(() => {
    if (mode === 'departure') setScreen('driving')
    else if (mode === 'return') setScreen('rest')
  }, [mode])

  // Second (linked) display parts (no seconds)
  const clockOpts = { hour12, seconds: false }
  let statusParts = formatClock(now, clockOpts)
  if (mode === 'departure' && startedAt != null) {
    statusParts = formatClock(new Date(startedAt), clockOpts)
  } else if (mode === 'return' && startedAt != null) {
    statusParts = formatClock(
      addHours(new Date(startedAt), countdownOffset),
      clockOpts,
    )
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

  if (screen === 'driving' && mode === 'departure' && startedAt != null && trip) {
    return (
      <DrivingStatusView
        now={now.getTime()}
        nowParts={formatClock(now, { hour12: false, seconds: false })}
        departureAt={startedAt}
        trip={trip}
        onTapCategory={handleTapCategory}
        onResumeDriving={handleResumeDriving}
        onBack={() => setScreen('home')}
      />
    )
  }

  if (screen === 'rest' && mode === 'return' && startedAt != null) {
    return (
      <RestStatusView
        nowParts={formatClock(now, { hour12: false, seconds: false })}
        returnedAt={startedAt}
        restElapsedMs={restElapsedMs}
        countdownOffset={countdownOffset}
        onSelectCountdown={setCountdownOffset}
        onBack={() => setScreen('home')}
      />
    )
  }

  return (
    <div className="flex flex-1 flex-col justify-evenly gap-3">
      <div className="flex flex-col gap-2">
        <LiveClock
          parts={formatClock(now, clockOpts)}
          hour12={hour12}
          onToggleFormat={toggleFormat}
        />
        <AccidentStreakBadge size="sm" onClick={onOpenAccidentCalendar} />
        <WeeklyGoal />
      </div>

      <StatusDisplay
        parts={statusParts}
        mode={mode}
        hour12={hour12}
        onToggleFormat={toggleFormat}
      />

      <ShiftTimer
        mode={mode}
        text={timerText}
        finished={finished}
        countdownOffset={countdownOffset}
        onSelectCountdown={setCountdownOffset}
        onOpenStatus={handleOpenStatus}
      />

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() =>
            setPendingHomeAction(isSplitRestEligible ? 'split-rest' : 'departure')
          }
          aria-pressed={mode === 'departure'}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-3xl border py-6 text-lg font-bold transition-all active:scale-[0.97] ${
            mode === 'departure'
              ? 'border-secondary bg-secondary text-secondary-foreground shadow-lg shadow-secondary/20'
              : 'border-border bg-card text-secondary hover:border-secondary/60'
          }`}
        >
          <LogOut className="h-6 w-6" aria-hidden="true" />
          {isSplitRestEligible ? '分割休息による出庫' : '出庫'}
        </button>
        <button
          type="button"
          onClick={() => setPendingHomeAction('return')}
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

      {pendingHomeAction === 'departure' && (
        <ConfirmActionModal
          message="出庫を開始しますか？"
          onConfirm={confirmDeparture}
          onCancel={() => setPendingHomeAction(null)}
        />
      )}
      {pendingHomeAction === 'return' && (
        <ConfirmActionModal
          message="帰庫を開始しますか？"
          onConfirm={confirmReturn}
          onCancel={() => setPendingHomeAction(null)}
        />
      )}
      {pendingHomeAction === 'split-rest' && (
        <ConfirmActionModal
          message="分割休息による出庫"
          confirmLabel="確認しました"
          cancelLabel={null}
          onConfirm={confirmSplitRestDeparture}
          body={
            <p className="rounded-xl bg-destructive/10 px-3 py-2.5 text-sm font-bold leading-relaxed text-destructive">
              分割休息は1回3時間以上とること。
              <br />
              2分割の場合は合計10時間以上、
              <br />
              3分割の場合は合計12時間以上になるように休息をとること。
            </p>
          }
        />
      )}
    </div>
  )
}
