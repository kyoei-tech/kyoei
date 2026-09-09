// Split-rest (分割休息) cumulative tracking. Persisted locally per device —
// unlike shared data (おしらせ, 今週の目標 etc.) this reflects one driver's
// personal rest history across multiple 出庫/帰庫 cycles, so it lives in
// localStorage rather than Supabase.

const STORAGE_KEY = 'kyoei-split-rest-state'

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
 * Registers a rest period taken via 分割休息による出庫 and returns the
 * updated state plus how much rest is still needed. Target starts at 10
 * hours; if a rest is registered again while the cumulative total is still
 * under 10 hours, the target extends to 12 hours (2-split vs 3-split rule).
 * Once the target is met, the sequence resets to 0.
 */
export function registerSplitRest(restMs: number): {
  state: SplitRestState
  remainingMs: number
  satisfied: boolean
  targetMs: number
} {
  const prev = loadSplitRestState()
  const cumulativeMs = prev.cumulativeMs + Math.max(0, restMs)
  const targetMs = prev.splitCount === 0 ? TEN_HOURS_MS : TWELVE_HOURS_MS

  if (cumulativeMs >= targetMs) {
    resetSplitRestState()
    return {
      state: DEFAULT_STATE,
      remainingMs: 0,
      satisfied: true,
      targetMs,
    }
  }

  const state: SplitRestState = {
    cumulativeMs,
    splitCount: prev.splitCount + 1,
  }
  saveSplitRestState(state)
  return {
    state,
    remainingMs: targetMs - cumulativeMs,
    satisfied: false,
    targetMs,
  }
}
