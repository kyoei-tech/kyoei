// Weekly/monthly legal-limit counters derived from trip_history, for the
// タイムカード勤務状況 page. Based on the 改善基準告示（2024年基準）:
//   - 拘束時間14時間超えの運行は週2回まで
//   - 分割休息（2〜3分割）は当該月の総勤務回数の半分未満まで
//   - 休日は2週間に1回以上（24時間以上の休息）を確保する
// These are independent of the 運行状況 page's live driving/rest timers —
// this module only looks at completed trips in trip_history.
import type { TripHistoryEntry } from './trip-history'
import { FOURTEEN_HOURS_MS } from './trip-log'

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000

const OVER_14H_WEEKLY_LIMIT = 2

function startOfWeek(now: number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  // getDay(): 0=Sun..6=Sat. Treat Monday as the first day of the week.
  const diffToMonday = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - diffToMonday)
  return d.getTime()
}

function startOfMonth(now: number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(1)
  return d.getTime()
}

/** Remaining number of 拘束14時間超え trips allowed this week (0 if the limit is reached). */
export function getRemainingOver14hCount(
  trips: TripHistoryEntry[],
  now: number,
): number {
  const weekStart = startOfWeek(now)
  const usedThisWeek = trips.filter(
    (t) =>
      t.departedAt >= weekStart &&
      t.returnedAt - t.departedAt > FOURTEEN_HOURS_MS,
  ).length
  return Math.max(0, OVER_14H_WEEKLY_LIMIT - usedThisWeek)
}

/**
 * Remaining number of 分割休息 uses allowed this month, keeping total usage
 * under half of the month's completed trips (ceil(total/2) - 1).
 */
export function getRemainingSplitRestCount(
  trips: TripHistoryEntry[],
  now: number,
): number {
  const monthStart = startOfMonth(now)
  const monthTrips = trips.filter((t) => t.departedAt >= monthStart)
  if (monthTrips.length === 0) return 0
  const limit = Math.ceil(monthTrips.length / 2) - 1
  const usedThisMonth = monthTrips.filter(
    (t) => t.splitRestRemainingMs != null,
  ).length
  return Math.max(0, limit - usedThisMonth)
}

/**
 * True if no qualifying 休日（24時間以上の連続休息）has occurred within the
 * last 14 days, meaning a 休日出勤 would still be legally available.
 */
export function canTakeHolidayShift(
  trips: TripHistoryEntry[],
  now: number,
): boolean {
  const chronological = [...trips].sort((a, b) => a.departedAt - b.departedAt)
  const windowStart = now - FOURTEEN_DAYS_MS

  for (let i = 0; i < chronological.length - 1; i++) {
    const gapStart = chronological[i].returnedAt
    const gapEnd = chronological[i + 1].departedAt
    if (gapEnd - gapStart >= TWENTY_FOUR_HOURS_MS && gapEnd >= windowStart) {
      return false
    }
  }

  // The ongoing gap since the most recent trip's 帰庫 (if the driver hasn't
  // departed again yet) also counts, using "now" as the open end.
  const last = chronological[chronological.length - 1]
  if (last && now - last.returnedAt >= TWENTY_FOUR_HOURS_MS) {
    return false
  }

  return true
}
