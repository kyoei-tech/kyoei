// Read-only helpers for the persistent status band (see status-band.tsx)
// shown above the bottom tab bar on every page. It reads the same
// localStorage keys that HomeView/TimecardHomeView already persist to,
// rather than lifting their state up, since the band only needs to reflect
// current status, not drive any logic.

type ShiftMode = 'idle' | 'departure' | 'return'

const SHIFT_STORAGE_KEY = 'kyoei-shift-state'
const TIMECARD_STORAGE_KEY = 'kyoei-timecard-state'

export function readDriverMode(): ShiftMode {
  if (typeof window === 'undefined') return 'idle'
  try {
    const raw = window.localStorage.getItem(SHIFT_STORAGE_KEY)
    if (!raw) return 'idle'
    const parsed = JSON.parse(raw) as { mode?: ShiftMode }
    return parsed.mode ?? 'idle'
  } catch {
    return 'idle'
  }
}

export function readTimecardClockedIn(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(TIMECARD_STORAGE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as {
      timecard?: { clockedIn?: boolean }
    }
    return parsed.timecard?.clockedIn ?? false
  } catch {
    return false
  }
}
