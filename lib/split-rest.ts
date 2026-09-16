// Split-rest (分割休息) cumulative tracking. Persisted locally per device —
// unlike shared data (おしらせ, 今週の目標 etc.) this reflects one driver's
// personal rest history across multiple 出庫/帰庫 cycles, so it lives in
// localStorage rather than Supabase.
//
// 改善基準告示 rules this file enforces:
// - Each individual split segment must be at least 3 hours.
// - A sequence of 2 splits needs a cumulative total of at least 10 hours.
// - A sequence of 3 splits needs a cumulative total of at least 12 hours.
// A segment only "completes" the sequence if it is itself >= 3 hours —
// a too-short segment can't be the one that pushes the total over the line,
// even if the raw cumulative total would otherwise be enough.

const STORAGE_KEY = 'kyoei-split-rest-state'

const THREE_HOURS_MS = 3 * 3600 * 1000
const TEN_HOURS_MS = 10 * 3600 * 1000
const TWELVE_HOURS_MS = 12 * 3600 * 1000

export type SplitRestState = {
  /** Total rest accumulated across the current split-rest sequence, in ms. */
  cumulativeMs: number
  /** How many times 分割休息による出庫 has been used in the current sequence. */
  splitCount: number
}

const DEFAULT_STATE: SplitRestState = { cumulativeMs: 0, splitCount: 0 }

export function loadSplitRestState(): SplitRestState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    return { ...DEFAULT_STATE, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_STATE
  }
}

export function saveSplitRestState(state: SplitRestState) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function resetSplitRestState() {
  saveSplitRestState(DEFAULT_STATE)
}

/**
 * The minimum cumulative total required once `splitCountSoFar` segments
 * have been taken: still aiming for a 2-split (10h) sequence for the first
 * two segments, escalating to a 3-split (12h) sequence once a 3rd segment
 * becomes necessary.
 */
function targetForSplitCount(splitCountSoFar: number): number {
  return splitCountSoFar <= 1 ? TEN_HOURS_MS : TWELVE_HOURS_MS
}

/**
 * Registers a rest period taken via 分割休息による出庫 and returns the
 * updated state plus how much rest is still needed.
 *
 * A segment can only complete the sequence if it is itself >= 3 hours (the
 * per-segment minimum) — a shorter segment still adds to the cumulative
 * total (time did pass), but can't be the one that satisfies the target,
 * and effectively forces another (3rd+) split to make up for it. The
 * displayed 要休息時間 is always floored at 3 hours, since no legal segment
 * can be shorter than that.
 */
export function registerSplitRest(restMs: number): {
  state: SplitRestState
  remainingMs: number
  satisfied: boolean
  targetMs: number
} {
  const prev = loadSplitRestState()
  const clampedRestMs = Math.max(0, restMs)
  const cumulativeMs = prev.cumulativeMs + clampedRestMs
  const isValidSegment = clampedRestMs >= THREE_HOURS_MS
  const currentTargetMs = targetForSplitCount(prev.splitCount)

  if (isValidSegment && cumulativeMs >= currentTargetMs) {
    resetSplitRestState()
    return {
      state: DEFAULT_STATE,
      remainingMs: 0,
      satisfied: true,
      targetMs: currentTargetMs,
    }
  }

  const splitCount = prev.splitCount + 1
  const state: SplitRestState = { cumulativeMs, splitCount }
  saveSplitRestState(state)
  const nextTargetMs = targetForSplitCount(splitCount)
  return {
    state,
    remainingMs: Math.max(nextTargetMs - cumulativeMs, THREE_HOURS_MS),
    satisfied: false,
    targetMs: nextTargetMs,
  }
}

/**
 * Predicts, without registering anything, whether departing now with
 * `restMs` of rest would push the split-rest sequence from "could still
 * finish as a 2-split (10h)" to "now needs a 3rd split (12h total)" — i.e.
 * this rest is too short (individually, or to close out the running total)
 * to complete the sequence. Used to warn before an inefficient departure.
 */
export function wouldEscalateSplitRest(restMs: number): boolean {
  const prev = loadSplitRestState()
  // Only relevant once at least one split has already been taken — the
  // very first split can't yet be "escalating" anything, it's just
  // starting the sequence.
  if (prev.splitCount === 0) return false
  const currentTargetMs = targetForSplitCount(prev.splitCount)
  // Only relevant while still aiming for a 2-split (10h) sequence — once
  // already escalated to 3-split (12h) there's no further tier to warn
  // about newly entering.
  if (currentTargetMs !== TEN_HOURS_MS) return false
  const clampedRestMs = Math.max(0, restMs)
  const cumulativeMs = prev.cumulativeMs + clampedRestMs
  const isValidSegment = clampedRestMs >= THREE_HOURS_MS
  const wouldSatisfy = isValidSegment && cumulativeMs >= currentTargetMs
  return !wouldSatisfy
}
