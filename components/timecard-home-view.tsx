'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Coffee, LogIn, LogOut, Play, Square } from 'lucide-react'
import { formatClock, formatDuration } from '@/lib/shift-time'
import {
  clockIn as clockInPure,
  clockOut as clockOutPure,
  startBreak as startBreakPure,
  endBreak as endBreakPure,
  liveBreakTotalMs,
  liveShiftElapsedMs,
  formatHoursMinutes,
  defaultTimecardState,
  type TimecardState,
} from '@/lib/timecard-log'
import { LiveClock } from './live-clock'
import { FormatToggle } from './format-toggle'
import { AccidentStreakBadge } from './accident-streak-badge'
import { WeeklyGoal } from './weekly-goal'
import { ConfirmActionModal } from './confirm-action-modal'

type PendingAction = 'clock-in' | 'clock-out' | null

const STORAGE_KEY = 'kyoei-timecard-state'

function loadState(): TimecardState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as TimecardState
  } catch {
    return null
  }
}

// Parallel to HomeView, but for タイムカードモード: simple 出勤/退勤 + a single
// break timer. No 連続走行時間, 累計休憩時間 (10分/30分 rule), or 9/33時間
// legal rest countdown — those are 乗務員モード (driver mode) only concepts.
export function TimecardHomeView({
  onOpenAccidentCalendar,
  homeSignal,
}: {
  onOpenAccidentCalendar?: () => void
  homeSignal?: number
}) {
  const [now, setNow] = useState(() => new Date())
  const [state, setState] = useState<TimecardState>(defaultTimecardState)
  const [hour12, setHour12] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)

  const toggleFormat = useCallback(() => setHour12((v) => !v), [])

  useEffect(() => {
    const saved = loadState()
    if (saved) setState(saved)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [hydrated, state])

  // Tapping the home tab always resets any transient UI; timecard mode has
  // no sub-screens, but this keeps behavior consistent with HomeView.
  const lastHomeSignal = useRef(homeSignal)
  useEffect(() => {
    if (homeSignal === undefined) return
    if (lastHomeSignal.current === homeSignal) return
    lastHomeSignal.current = homeSignal
  }, [homeSignal])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 250)
    return () => clearInterval(id)
  }, [])

  const clockOpts = { hour12, seconds: false }
  const nowMs = now.getTime()
  const shiftElapsedMs = liveShiftElapsedMs(state, nowMs)
  const breakTotalMs = liveBreakTotalMs(state, nowMs)

  function confirmClockIn() {
    setState(clockInPure(Date.now()))
    setPendingAction(null)
  }

  function confirmClockOut() {
    setState((cur) => clockOutPure(cur, Date.now()))
    setPendingAction(null)
  }

  function handleToggleBreak() {
    setState((cur) =>
      cur.onBreak
        ? endBreakPure(cur, Date.now())
        : startBreakPure(cur, Date.now()),
    )
  }

  return (
    <div className="flex flex-1 flex-col justify-evenly gap-1.5">
      <div className="flex flex-col gap-1">
        <LiveClock
          parts={formatClock(now, clockOpts)}
          hour12={hour12}
          onToggleFormat={toggleFormat}
        />
        <AccidentStreakBadge size="sm" onClick={onOpenAccidentCalendar} />
        <WeeklyGoal />
      </div>

      <section
        aria-label="勤務状況"
        className="rounded-3xl border border-border bg-card px-5 py-2.5"
      >
        <div className="mb-1 flex items-center justify-between">
          <span
            className={`text-base font-bold tracking-wide ${
              state.clockedIn ? 'text-secondary' : 'text-muted-foreground'
            }`}
          >
            {state.clockedIn ? '出勤中' : '未出勤'}
          </span>
          <FormatToggle hour12={hour12} onToggle={toggleFormat} />
        </div>
        <p
          className={`my-1 text-center font-mono text-3xl font-semibold tabular-nums tracking-tight ${
            state.clockedIn ? 'text-secondary' : 'text-foreground'
          }`}
        >
          {formatDuration(shiftElapsedMs)}
        </p>
        {state.clockedIn && (
          <p className="text-center text-xs font-medium text-muted-foreground">
            休憩時間：{formatHoursMinutes(breakTotalMs)}
          </p>
        )}
      </section>

      <section
        aria-label="休憩"
        className="rounded-3xl border border-border bg-card px-5 py-3 text-center"
      >
        <div className="mb-1 flex items-center justify-center gap-1">
          <Coffee
            className={`h-4 w-4 ${
              state.onBreak ? 'text-primary' : 'text-muted-foreground'
            }`}
            aria-hidden="true"
          />
          <span
            className={`text-base font-bold tracking-wide ${
              state.onBreak ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            休憩時間
          </span>
        </div>
        <p
          className={`font-mono text-4xl font-bold tabular-nums tracking-tight ${
            state.onBreak ? 'text-primary' : 'text-foreground'
          }`}
        >
          {formatHoursMinutes(breakTotalMs)}
        </p>
        <button
          type="button"
          onClick={handleToggleBreak}
          disabled={!state.clockedIn}
          aria-pressed={state.onBreak}
          className={`mx-auto mt-2 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors active:scale-95 disabled:opacity-40 ${
            state.onBreak
              ? 'bg-primary text-primary-foreground'
              : 'border border-border bg-muted text-foreground hover:border-primary/60'
          }`}
        >
          {state.onBreak ? (
            <>
              <Square className="h-3.5 w-3.5" aria-hidden="true" />
              休憩終了
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              休憩開始
            </>
          )}
        </button>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setPendingAction('clock-in')}
          disabled={state.clockedIn}
          aria-pressed={state.clockedIn}
          className={`flex flex-col items-center justify-center gap-1 rounded-3xl border py-3 text-sm font-bold leading-tight transition-all active:scale-[0.97] disabled:opacity-40 ${
            state.clockedIn
              ? 'border-secondary bg-secondary text-secondary-foreground shadow-lg shadow-secondary/20'
              : 'border-border bg-card text-secondary hover:border-secondary/60'
          }`}
        >
          <LogIn className="h-5 w-5" aria-hidden="true" />
          出勤
        </button>
        <button
          type="button"
          onClick={() => setPendingAction('clock-out')}
          disabled={!state.clockedIn}
          className="flex flex-col items-center justify-center gap-1 rounded-3xl border border-border bg-card py-3 text-sm font-bold leading-tight text-primary transition-all hover:border-primary/60 active:scale-[0.97] disabled:opacity-40"
        >
          <LogOut className="h-5 w-5" aria-hidden="true" />
          退勤
        </button>
      </div>

      {pendingAction === 'clock-in' && (
        <ConfirmActionModal
          message="出勤しますか？"
          onConfirm={confirmClockIn}
          onCancel={() => setPendingAction(null)}
        />
      )}
      {pendingAction === 'clock-out' && (
        <ConfirmActionModal
          message="退勤しますか？"
          onConfirm={confirmClockOut}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  )
}
