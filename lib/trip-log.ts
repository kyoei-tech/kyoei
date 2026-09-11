// Pure helpers for the 運行状況 (driving status) page's detailed timers.
// Kept framework-free so the tick/reset rules are easy to read and reuse
// from HomeView's state updates.

export type BreakCategory = 'loading' | 'unloading' | 'waiting' | 'resting'
export type ActiveCategory = 'driving' | BreakCategory

export type CategoryTotals = {
  driving: number
  loading: number
  unloading: number
  waiting: number
  resting: number
}

export type TripState = {
  activeCategory: ActiveCategory
  /** Epoch ms when the current activeCategory segment began. */
  segmentStartedAt: number
  /** Accumulated ms per category, excluding the currently running segment. */
  totals: CategoryTotals
  /** 連続走行時間 baseline, excluding the currently running driving segment. */
  continuousDrivingMs: number
  continuousDrivingRunning: boolean
  /** 累計休憩時間（10分/30分ルール）baseline, excluding the running segment. */
  breakTimerMs: number
  breakTimerRunning: boolean
  /** Set to true the moment 累計休憩時間 auto-resets at 30 minutes. */
  breakSatisfied: boolean
  /** Static remaining-rest display for this trip, set only when departed via 分割休息. */
  splitRestRemainingMs: number | null
}

export const ZERO_TOTALS: CategoryTotals = {
  driving: 0,
  loading: 0,
  unloading: 0,
  waiting: 0,
  resting: 0,
}

export const TEN_MINUTES_MS = 10 * 60 * 1000
export const THIRTY_MINUTES_MS = 30 * 60 * 1000
export const THREE_HOURS_30_MS = 3.5 * 3600 * 1000
export const FOUR_HOURS_MS = 4 * 3600 * 1000
export const TEN_HOURS_MS = 10 * 3600 * 1000
export const FOURTEEN_HOURS_MS = 14 * 3600 * 1000

/** e.g. 2h15m30s -> "2時間15分" (no seconds, per the driving-status page spec). */
export function formatHoursMinutes(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}時間${minutes}分`
}

export function startTrip(
  now: number,
  splitRestRemainingMs: number | null,
): TripState {
  return {
    activeCategory: 'driving',
    segmentStartedAt: now,
    totals: { ...ZERO_TOTALS },
    continuousDrivingMs: 0,
    continuousDrivingRunning: true,
    breakTimerMs: 0,
    breakTimerRunning: false,
    breakSatisfied: false,
    splitRestRemainingMs,
  }
}

/** Live value (ms) for a given category, including the running segment if active. */
export function liveCategoryMs(
  trip: TripState,
  category: ActiveCategory,
  now: number,
): number {
  const base = trip.totals[category]
  if (trip.activeCategory === category) {
    return base + Math.max(0, now - trip.segmentStartedAt)
  }
  return base
}

/** Final per-category totals at 帰庫, folding in whatever segment was still running. */
export function finalizeTotals(trip: TripState, now: number): CategoryTotals {
  const totals = { ...trip.totals }
  totals[trip.activeCategory] += Math.max(0, now - trip.segmentStartedAt)
  return totals
}

export function liveContinuousDrivingMs(trip: TripState, now: number): number {
  if (trip.continuousDrivingRunning) {
    return trip.continuousDrivingMs + Math.max(0, now - trip.segmentStartedAt)
  }
  return trip.continuousDrivingMs
}

export function liveBreakTimerMs(trip: TripState, now: number): number {
  if (trip.breakTimerRunning) {
    return trip.breakTimerMs + Math.max(0, now - trip.segmentStartedAt)
  }
  return trip.breakTimerMs
}

/** Called on every tick; applies the 30-minute auto-reset rule. */
export function tickTrip(trip: TripState, now: number): TripState {
  if (trip.breakTimerRunning) {
    const live = liveBreakTimerMs(trip, now)
    if (live >= THIRTY_MINUTES_MS) {
      return {
        ...trip,
        breakTimerMs: 0,
        breakTimerRunning: false,
        breakSatisfied: true,
      }
    }
  }
  return trip
}

/** 荷積 / 荷卸 / 待機 / 休憩 ボタン: stop driving/continuous timers, start the break category + 累計休憩時間. */
export function tapBreakCategory(
  trip: TripState,
  category: BreakCategory,
  now: number,
): TripState {
  const elapsed = Math.max(0, now - trip.segmentStartedAt)
  const totals = { ...trip.totals }
  totals[trip.activeCategory] += elapsed

  return {
    ...trip,
    totals,
    activeCategory: category,
    segmentStartedAt: now,
    continuousDrivingMs:
      trip.activeCategory === 'driving'
        ? trip.continuousDrivingMs + elapsed
        : trip.continuousDrivingMs,
    continuousDrivingRunning: false,
    breakTimerRunning: true,
  }
}

/** 走行再開 ボタン: apply the 10分/30分 rule, then resume driving + 連続走行時間. */
export function tapResumeDriving(trip: TripState, now: number): TripState {
  const elapsed = Math.max(0, now - trip.segmentStartedAt)
  const totals = { ...trip.totals }
  totals[trip.activeCategory] += elapsed

  let breakTimerMs = trip.breakTimerMs
  let continuousDrivingMs = trip.continuousDrivingMs

  if (trip.breakSatisfied) {
    // The break already ran to 30+ minutes and auto-reset — that satisfies
    // the legal break, so the 4-hour continuous-driving clock restarts too.
    continuousDrivingMs = 0
    breakTimerMs = 0
  } else {
    const newBreakTimerMs = breakTimerMs + elapsed
    breakTimerMs = newBreakTimerMs < TEN_MINUTES_MS ? 0 : newBreakTimerMs
  }

  return {
    ...trip,
    totals,
    activeCategory: 'driving',
    segmentStartedAt: now,
    continuousDrivingMs,
    continuousDrivingRunning: true,
    breakTimerMs,
    breakTimerRunning: false,
    breakSatisfied: false,
  }
}
