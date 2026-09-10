'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight, Stamp, Timer } from 'lucide-react'
import { formatClock, formatDuration } from '@/lib/shift-time'
import {
  clockIn as clockInPure,
  clockOut as clockOutPure,
  startBreak as startBreakPure,
  endBreak as endBreakPure,
  liveBreakTotalMs,
  liveShiftElapsedMs,
  defaultTimecardState,
  type TimecardState,
} from '@/lib/timecard-log'
import { LiveClock } from './live-clock'
import { FormatToggle } from './format-toggle'
import { AccidentStreakBadge } from './accident-streak-badge'
import { WeeklyGoal } from './weekly-goal'
import { ConfirmActionModal } from './confirm-action-modal'
import { TimecardWorkStatusView } from './timecard-work-status-view'

type Screen = 'home' | 'status'
type PendingAction = 'clock-in' | 'clock-out' | null

const STORAGE_KEY = 'kyoei-timecard-state'

type PersistedState = {
  timecard: TimecardState
  hour12: boolean
  screen: Screen
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

// Parallel to HomeView, but for タイムカードモード: simple 出勤/退勤 + a single
// break timer, plus a 勤務状況 sub-page. No 連続走行時間, 累計休憩時間
// (10分/30分 rule), or 9/33時間 legal rest countdown — those are 乗務員
// モード (driver mode) only concepts and live in trip-log.ts/shift-time.ts.
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
  const [screen, setScreen] = useState<Screen>('home')
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)

  const toggleFormat = useCallback(() => setHour12((v) => !v), [])

  useEffect(() => {
    const saved = loadState()
    if (saved) {
      setState(saved.timecard)
      setHour12(saved.hour12)
      setScreen(saved.screen ?? 'home')
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const persisted: PersistedState = { timecard: state, hour12, screen }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
  }, [hydrated, state, hour12, screen])

  // Tapping the home tab (even while already on it) always jumps back to
  // the top-level home screen, out of 勤務状況をみる, matching HomeView.
  const lastHomeSignal = useRef(homeSignal)
  useEffect(() => {
    if (homeSignal === undefined) return
    if (lastHomeSignal.current === homeSignal) return
    lastHomeSignal.current = homeSignal
    setScreen('home')
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
    setScreen('home')
    setPendingAction(null)
  }

  function confirmClockOut() {
    setState((cur) => clockOutPure(cur, Date.now()))
    setScreen('home')
    setPendingAction(null)
  }

  const handleStartBreak = useCallback(() => {
    setState((cur) => startBreakPure(cur, Date.now()))
  }, [])

  const handleEndBreak = useCallback(() => {
    setState((cur) => endBreakPure(cur, Date.now()))
  }, [])

  // Second (linked) display parts (no seconds)
  const statusParts = state.clockedIn
    ? formatClock(new Date(state.shiftStartedAt ?? nowMs), clockOpts)
    : formatClock(now, clockOpts)

  const timerText = state.clockedIn
    ? formatDuration(shiftElapsedMs)
    : '00:00:00'

  if (screen === 'status' && state.clockedIn && state.shiftStartedAt != null) {
    return (
      <TimecardWorkStatusView
        now={nowMs}
        nowParts={formatClock(now, { hour12: false, seconds: false })}
        workStartedAt={state.shiftStartedAt}
        timecardState={state}
        onStartBreak={handleStartBreak}
        onEndBreak={handleEndBreak}
        onBack={() => setScreen('home')}
      />
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
        <WeeklyGoal goalId="timecard" />
      </div>

      <section
        aria-label="連動表示"
        className="rounded-3xl border border-border bg-card px-5 py-2.5"
      >
        <div className="mb-1 flex items-center justify-between">
          <span
            className={`text-base font-bold tracking-wide ${
              state.clockedIn ? 'text-secondary' : 'text-muted-foreground'
            }`}
          >
            {state.clockedIn ? '出勤時刻' : 'タイムカード'}
          </span>
          <FormatToggle hour12={hour12} onToggle={toggleFormat} />
        </div>
        <p className="text-xs font-medium text-muted-foreground">
          {statusParts.date}
          <span className="ml-2 text-foreground">{statusParts.weekday}</span>
        </p>
        <p
          className={`my-1 text-center font-mono text-3xl font-semibold tabular-nums tracking-tight ${
            state.clockedIn ? 'text-secondary' : 'text-foreground'
          }`}
        >
          {statusParts.meridiem && (
            <span className="mr-1 text-sm font-medium text-muted-foreground">
              {statusParts.meridiem}
            </span>
          )}
          {statusParts.time}
        </p>
      </section>

      <section
        aria-label="タイマー"
        className="rounded-3xl border border-border bg-card px-5 py-3 text-center"
      >
        <div className="mb-1 flex items-center justify-center gap-1">
          <Timer
            className={`h-4 w-4 ${
              state.clockedIn ? 'text-secondary' : 'text-muted-foreground'
            }`}
            aria-hidden="true"
          />
          <span
            className={`text-base font-bold tracking-wide ${
              state.clockedIn ? 'text-secondary' : 'text-muted-foreground'
            }`}
          >
            {state.clockedIn ? '勤務時間' : 'タイマー'}
          </span>
        </div>
        <p
          className={`font-mono font-bold tabular-nums tracking-tight ${
            state.clockedIn ? 'text-secondary' : 'text-muted-foreground'
          }`}
        >
          {(() => {
            const [hh, mm, ss] = timerText.split(':')
            return (
              <>
                <span className="text-4xl">{`${hh}:${mm}`}</span>
                <span className="ml-1 text-lg">{`:${ss}`}</span>
              </>
            )
          })()}
        </p>

        {state.clockedIn ? (
          <button
            type="button"
            onClick={() => setScreen('status')}
            className="mx-auto mt-1.5 flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-95"
          >
            勤務状況をみる
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          </button>
        ) : (
          <p className="mt-1.5 text-xs text-muted-foreground">
            出勤ボタンで開始します
          </p>
        )}
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
          <Stamp className="h-5 w-5" aria-hidden="true" />
          出勤
        </button>
        <button
          type="button"
          onClick={() => setPendingAction('clock-out')}
          disabled={!state.clockedIn}
          className="flex flex-col items-center justify-center gap-1 rounded-3xl border border-border bg-card py-3 text-sm font-bold leading-tight text-primary transition-all hover:border-primary/60 active:scale-[0.97] disabled:opacity-40"
        >
          <Stamp className="h-5 w-5" aria-hidden="true" />
          退勤
        </button>
      </div>

      {pendingAction === 'clock-in' && (
        <ConfirmActionModal
          message="タイムカードを押しましたか？"
          onConfirm={confirmClockIn}
          onCancel={() => setPendingAction(null)}
        />
      )}
      {pendingAction === 'clock-out' && (
        <ConfirmActionModal
          message="タイムカードを押しましたか？"
          onConfirm={confirmClockOut}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  )
}
