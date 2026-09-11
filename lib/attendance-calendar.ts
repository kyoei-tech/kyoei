// Derives 出勤日 (workday) / 休日 (day off) status per calendar date from
// trip_history, for the 運行履歴 calendar view only. This rule does not apply
// anywhere else in the app (e.g. the legal driving-status timers).
//
// 出勤日判定: 17時以降に出庫し、帰庫が日付をまたいだ場合は「翌日」を出勤日とする。
// それ以外は出庫した日付を出勤日とする。
//
// 休日判定: 連続する2つの運行の間の休息時間が33時間以上の場合、その間に
// カレンダー上で完全に空いている日（どちらの出勤日でもない日）を休日とする。
import { toISODate } from './month-calendar'
import type { TripHistoryEntry } from './trip-history'

const HOLIDAY_REST_THRESHOLD_MS = 33 * 60 * 60 * 1000

function isoOf(ms: number): string {
  const d = new Date(ms)
  return toISODate(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return toISODate(dt.getFullYear(), dt.getMonth(), dt.getDate())
}

/** 出勤日 (as an ISO date string) that a single trip counts toward. */
export function workdayForTrip(trip: TripHistoryEntry): string {
  const departure = new Date(trip.departedAt)
  const departureIso = isoOf(trip.departedAt)
  const returnIso = isoOf(trip.returnedAt)
  const crossedMidnight = returnIso !== departureIso
  if (departure.getHours() >= 17 && crossedMidnight) {
    return addDaysISO(departureIso, 1)
  }
  return departureIso
}

export type AttendanceDayKind = 'workday' | 'holiday'

export type AttendanceDay = {
  iso: string
  kind: AttendanceDayKind
}

/**
 * Computes the base (pre-override) attendance status for every relevant
 * date: every trip's 出勤日 is a workday, and every calendar date that falls
 * strictly inside a >=33h rest gap between two trips (and isn't itself a
 * workday) is a holiday.
 */
export function computeAttendanceDays(
  trips: TripHistoryEntry[],
): Map<string, AttendanceDayKind> {
  const days = new Map<string, AttendanceDayKind>()

  // trips is newest-first (see fetchTripHistory); sort oldest-first for gaps.
  const chronological = [...trips].sort((a, b) => a.departedAt - b.departedAt)

  for (const trip of chronological) {
    days.set(workdayForTrip(trip), 'workday')
  }

  for (let i = 0; i < chronological.length - 1; i++) {
    const current = chronological[i]
    const next = chronological[i + 1]
    const restMs = next.departedAt - current.returnedAt
    if (restMs < HOLIDAY_REST_THRESHOLD_MS) continue

    let cursor = addDaysISO(isoOf(current.returnedAt), 1)
    const stop = isoOf(next.departedAt)
    // Mark every calendar day strictly between the two trips as a holiday,
    // unless it's already claimed as someone's workday.
    while (cursor < stop) {
      if (!days.has(cursor)) days.set(cursor, 'holiday')
      cursor = addDaysISO(cursor, 1)
    }
  }

  return days
}
