'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LogIn, LogOut } from 'lucide-react'
import {
  addHours,
  formatClock,
  formatDuration,
  isSaturday,
} from '@/lib/shift-time'
import { registerSplitRest, resetSplitRestState } from '@/lib/split-rest'
import {
  finalizeTotals,
  liveContinuousDrivingMs,
  startTrip,
  tapBreakCategory as tapBreakCategoryPure,
  tapResumeDriving as tapResumeDrivingPure,
  tickTrip,
  type BreakCategory,
  type TripState,
} from '@/lib/trip-log'
import { saveCompletedTrip } from '@/lib/trip-history'
import { useSettings } from '@/lib/settings/settings-context'
import {
  initialNotifyState,
  tickNotifyState,
  type NotifyState,
} from '@/lib/notifications/driving-notifications'
import { deliverNotification } from '@/lib/notifications/push-notifications'
import { usePushNotificationRules } from '@/lib/notifications/push-rules'
import {
  clearDrivingSession,
  syncDrivingSession,
} from '@/lib/notifications/driving-session-sync'
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
  screen: Screen
  notify?: NotifyState
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
  homeSignal,
}: {
  onOpenAccidentCalendar?: () => void
  homeSignal?: number
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
  const [notify, setNotify] = useState<NotifyState>(initialNotifyState)
  const [pendingHomeAction, setPendingHomeAction] =
    useState<PendingHomeAction>(null)
  const { pushNotificationsEnabled } = useSettings()
  const { data: notificationRules } = usePushNotificationRules()

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
      setScreen(saved.screen ?? 'home')
      setNotify(saved.notify ?? initialNotifyState())
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
      screen,
      notify,
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [
    hydrated,
    mode,
    startedAt,
    countdownOffset,
    hour12,
    trip,
    screen,
    notify,
  ])

  // Tapping the home tab (even while already on it) always jumps back to
  // the top-level home screen, out of 運行状況/休息状況. Only react when the
  // signal's value actually changes from what we last saw, so mounting (or
  // Strict Mode's dev-only double-invoke of this effect) never overrides the
  // screen we just restored from storage.
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

  // Applies the 30-minute 累計休憩時間 auto-reset rule as time passes, and
  // (when enabled) checks the editable push-notification rules (see
  // lib/notifications/push-rules.ts) against the freshly ticked timers so a
  // reset-driven event (累計休息時間) and the trip state that caused it stay
  // in sync.
  useEffect(() => {
    if (!trip) return
    const nowMs = now.getTime()
    const tickedTrip = tickTrip(trip, nowMs)
    if (tickedTrip !== trip) {
      setTrip(tickedTrip)
      // The 30-min 累計休憩時間 auto-reset just flipped breakSatisfied — the
      // server-side driving-timer job needs to see that transition too.
      if (startedAt != null) void syncDrivingSession(tickedTrip, startedAt)
    }

    if (pushNotificationsEnabled && notificationRules.length > 0) {
      const continuousMs = liveContinuousDrivingMs(tickedTrip, nowMs)
      const drivingMs =
        mode === 'departure' && startedAt != null ? nowMs - startedAt : 0
      const { state, events } = tickNotifyState(
        notify,
        {
          continuousMs,
          drivingMs,
          breakSatisfied: tickedTrip.breakSatisfied,
        },
        notificationRules,
      )
      setNotify(state)
      for (const event of events) {
        void deliverNotification(event.title, event.message)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run per tick
  }, [now])

  const restElapsedMs =
    mode === 'return' && startedAt != null ? now.getTime() - startedAt : 0
  const isSplitRestEligible = mode === 'return' && restElapsedMs < NINE_HOURS_MS

  function startDeparture(now: number, splitRestRemainingMs: number | null) {
    const newTrip = startTrip(now, splitRestRemainingMs)
    setMode('departure')
    setStartedAt(now)
    setTrip(newTrip)
    setNotify(initialNotifyState())
    setScreen('home')
    void syncDrivingSession(newTrip, now)
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
    const returnedAt = Date.now()
    // The trip just ended, so this is the one moment its final per-category
    // totals (including whatever segment was still running) are known —
    // record it to 運行履歴 before the in-progress trip state is cleared.
    if (trip && startedAt != null) {
      void saveCompletedTrip({
        departedAt: startedAt,
        returnedAt,
        totals: finalizeTotals(trip, returnedAt),
        splitRestRemainingMs: trip.splitRestRemainingMs,
      })
    }
    // Trip is over — nothing left for the server-side driving-timer job to
    // evaluate against this device.
    void clearDrivingSession()
    setCountdownOffset(isSaturday(new Date()) ? 33 : 9)
    setMode('return')
    setStartedAt(returnedAt)
    setTrip(null)
    setScreen('home')
    setPendingHomeAction(null)
  }

  const handleTapCategory = useCallback(
    (category: BreakCategory) => {
      setTrip((cur) => {
        if (!cur) return cur
        const next = tapBreakCategoryPure(cur, category, Date.now())
        if (startedAt != null) void syncDrivingSession(next, startedAt)
        return next
      })
    },
    [startedAt],
  )

  const handleResumeDriving = useCallback(() => {
    setTrip((cur) => {
      if (!cur) return cur
      const next = tapResumeDrivingPure(cur, Date.now())
      if (startedAt != null) void syncDrivingSession(next, startedAt)
      return next
    })
  }, [startedAt])

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

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() =>
            setPendingHomeAction(isSplitRestEligible ? 'split-rest' : 'departure')
          }
          aria-pressed={mode === 'departure'}
          className={`flex flex-col items-center justify-center gap-1 rounded-3xl border py-3 text-sm font-bold leading-tight transition-all active:scale-[0.97] ${
            mode === 'departure'
              ? 'border-secondary bg-secondary text-secondary-foreground shadow-lg shadow-secondary/20'
              : 'border-border bg-card text-secondary hover:border-secondary/60'
          }`}
        >
          <LogOut className="h-5 w-5" aria-hidden="true" />
          {isSplitRestEligible ? '分割休息による出庫' : '出庫'}
        </button>
        <button
          type="button"
          onClick={() => setPendingHomeAction('return')}
          aria-pressed={mode === 'return'}
          className={`flex flex-col items-center justify-center gap-1 rounded-3xl border py-3 text-sm font-bold leading-tight transition-all active:scale-[0.97] ${
            mode === 'return'
              ? 'border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20'
              : 'border-border bg-card text-primary hover:border-primary/60'
          }`}
        >
          <LogIn className="h-5 w-5" aria-hidden="true" />
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
