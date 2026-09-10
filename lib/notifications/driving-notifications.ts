// Pure threshold logic for the fixed push-notification rules on the 運行状況
// timers (連続走行時間 / 累計休息時間 / 運行時間). Framework-free so the
// fire-once-per-occurrence bookkeeping is easy to read and test, and kept
// separate from HomeView's tick effect.

const HOUR_MS = 3600_000
const MINUTE_MS = 60_000

export type ContinuousFlags = {
  h3: boolean
  h330: boolean
  h350: boolean
  h4: boolean
}

export type DrivingFlags = {
  h10: boolean
  h11: boolean
  h12: boolean
  h13: boolean
}

export type NotifyState = {
  continuousFired: ContinuousFlags
  drivingFired: DrivingFlags
  /** Previous tick's 連続走行時間 ms, used to detect a reset (counter dropping back to ~0). */
  prevContinuousMs: number
  /** Previous tick's trip.breakSatisfied, used to detect the reset edge. */
  prevBreakSatisfied: boolean
}

export type NotifyEvent = { title: string; body: string }

export function initialNotifyState(): NotifyState {
  return {
    continuousFired: { h3: false, h330: false, h350: false, h4: false },
    drivingFired: { h10: false, h11: false, h12: false, h13: false },
    prevContinuousMs: 0,
    prevBreakSatisfied: false,
  }
}

const CONTINUOUS_THRESHOLDS: {
  key: keyof ContinuousFlags
  ms: number
  message: string
}[] = [
  {
    key: 'h3',
    ms: 3 * HOUR_MS,
    message: '1時間以内に休憩を取ってください。',
  },
  {
    key: 'h330',
    ms: 3 * HOUR_MS + 30 * MINUTE_MS,
    message: '30分以内に休憩を取ってください。',
  },
  {
    key: 'h350',
    ms: 3 * HOUR_MS + 50 * MINUTE_MS,
    message: '10分以内に休憩を取ってください。',
  },
  {
    key: 'h4',
    ms: 4 * HOUR_MS,
    message:
      '連続走行時間が4時間を超えています。\n安全に止まれる場所で休憩を取ってください。',
  },
]

const DRIVING_THRESHOLDS: {
  key: keyof DrivingFlags
  ms: number
  message: string
}[] = [
  {
    key: 'h10',
    ms: 10 * HOUR_MS,
    message:
      '運行時間が10時間を超えました。\n3時間以内に帰庫してください。\n出来ない場合は事務所に相談してください。',
  },
  {
    key: 'h11',
    ms: 11 * HOUR_MS,
    message:
      '運行時間が11時間を超えました。\n2時間以内に帰庫してください。\n出来ない場合は事務所に相談してください。',
  },
  {
    key: 'h12',
    ms: 12 * HOUR_MS,
    message:
      '運行時間が12時間を超えました。\n1時間以内に帰庫してください。\n出来ない場合は事務所に相談してください。',
  },
  {
    key: 'h13',
    ms: 13 * HOUR_MS,
    message:
      '運行時間が13時間を超えました。\n14時間超の運行は週に2日まで、上限は15時間です。\n2時間以内に帰庫してください。\nできない場合は事務所に相談してください。',
  },
]

export const BREAK_SATISFIED_MESSAGE = '累計休息時間が30分を超えました。'

// A drop of more than this from the previous tick's 連続走行時間 means the
// counter was reset (new trip, or 走行再開 after a satisfied break) rather
// than just clock jitter, so previously-fired thresholds should re-arm.
const RESET_DROP_THRESHOLD_MS = 1000

/**
 * Advances notify state by one tick and returns any newly-crossed
 * thresholds as events to send. Each threshold fires at most once per
 * occurrence: continuous-driving flags re-arm when the counter resets to
 * zero, driving-duration flags only reset when the caller starts a new
 * trip (see initialNotifyState), and the break-satisfied event fires once
 * per false→true edge.
 */
export function tickNotifyState(
  state: NotifyState,
  args: { continuousMs: number; drivingMs: number; breakSatisfied: boolean },
): { state: NotifyState; events: NotifyEvent[] } {
  const events: NotifyEvent[] = []

  let continuousFired = state.continuousFired
  if (args.continuousMs < state.prevContinuousMs - RESET_DROP_THRESHOLD_MS) {
    continuousFired = { h3: false, h330: false, h350: false, h4: false }
  }
  for (const t of CONTINUOUS_THRESHOLDS) {
    if (!continuousFired[t.key] && args.continuousMs >= t.ms) {
      continuousFired = { ...continuousFired, [t.key]: true }
      events.push({ title: '連続走行時間', body: t.message })
    }
  }

  let drivingFired = state.drivingFired
  for (const t of DRIVING_THRESHOLDS) {
    if (!drivingFired[t.key] && args.drivingMs >= t.ms) {
      drivingFired = { ...drivingFired, [t.key]: true }
      events.push({ title: '運行時間', body: t.message })
    }
  }

  if (!state.prevBreakSatisfied && args.breakSatisfied) {
    events.push({ title: '累計休息時間', body: BREAK_SATISFIED_MESSAGE })
  }

  return {
    state: {
      continuousFired,
      drivingFired,
      prevContinuousMs: args.continuousMs,
      prevBreakSatisfied: args.breakSatisfied,
    },
    events,
  }
}
