// Pure helpers for タイムカードモード (timecard mode) — a stripped-down
// clock-in/out flow for office staff who don't drive. Deliberately has no
// notion of 連続走行時間, 累計休憩時間 (10分/30分 rule), or the 9/33時間
// legal rest countdown; those are truck-driver-only concepts that live in
// lib/trip-log.ts and lib/shift-time.ts for 乗務員モード.

export type TimecardState = {
  clockedIn: boolean
  /** Epoch ms when the current shift started. Null while clocked out. */
  shiftStartedAt: number | null
  onBreak: boolean
  /** Epoch ms when the current break began. Null while not on break. */
  breakStartedAt: number | null
  /** Accumulated break ms today, excluding any currently running break. */
  breakTotalMs: number
}

export function defaultTimecardState(): TimecardState {
  return {
    clockedIn: false,
    shiftStartedAt: null,
    onBreak: false,
    breakStartedAt: null,
    breakTotalMs: 0,
  }
}

export function clockIn(now: number): TimecardState {
  return {
    clockedIn: true,
    shiftStartedAt: now,
    onBreak: false,
    breakStartedAt: null,
    breakTotalMs: 0,
  }
}

/** 退勤: ends the shift. If still on break, folds the running break into the total first. */
export function clockOut(state: TimecardState, now: number): TimecardState {
  const breakTotalMs =
    state.onBreak && state.breakStartedAt !== null
      ? state.breakTotalMs + Math.max(0, now - state.breakStartedAt)
      : state.breakTotalMs
  return {
    ...state,
    clockedIn: false,
    shiftStartedAt: null,
    onBreak: false,
    breakStartedAt: null,
    breakTotalMs,
  }
}

export function startBreak(state: TimecardState, now: number): TimecardState {
  if (!state.clockedIn || state.onBreak) return state
  return { ...state, onBreak: true, breakStartedAt: now }
}

export function endBreak(state: TimecardState, now: number): TimecardState {
  if (!state.onBreak || state.breakStartedAt === null) return state
  return {
    ...state,
    onBreak: false,
    breakStartedAt: null,
    breakTotalMs: state.breakTotalMs + Math.max(0, now - state.breakStartedAt),
  }
}

/** Live break total (ms), including the currently running break if any. */
export function liveBreakTotalMs(state: TimecardState, now: number): number {
  if (state.onBreak && state.breakStartedAt !== null) {
    return state.breakTotalMs + Math.max(0, now - state.breakStartedAt)
  }
  return state.breakTotalMs
}

/** Live elapsed shift time (ms) since clock-in, including any break time. */
export function liveShiftElapsedMs(
  state: TimecardState,
  now: number,
): number {
  if (!state.clockedIn || state.shiftStartedAt === null) return 0
  return Math.max(0, now - state.shiftStartedAt)
}

/** e.g. 2h5m -> "2時間05分" */
export function formatHoursMinutes(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}時間${String(minutes).padStart(2, '0')}分`
}
