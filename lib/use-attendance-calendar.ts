'use client'

import { useMemo } from 'react'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { fetchTripHistory, type TripHistoryEntry } from '@/lib/trip-history'
import {
  computeAttendanceDays,
  type AttendanceDayKind,
} from '@/lib/attendance-calendar'
import {
  fetchAttendanceOverrides,
  type AttendanceOverride,
} from '@/lib/attendance-overrides'
import { toISODate } from '@/lib/month-calendar'

export type ResolvedAttendanceDay =
  | { kind: 'workday'; originIso: string; shiftDays: number }
  // A workday whose 〇 has been shifted away to another cell. Renders blank,
  // but stays double-tap-able here (keyed by originIso) so "元に戻す" can
  // always be reached from the date the shift was originally applied to.
  | { kind: 'workday-origin'; originIso: string; shiftDays: number }
  | { kind: 'holiday'; label: string | null }

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return toISODate(dt.getFullYear(), dt.getMonth(), dt.getDate())
}

/**
 * Merges the computed base attendance calendar (from trip_history) with
 * this device's manual overrides (shifted workdays, relabeled/removed
 * holidays) into a single iso-date -> status map, plus mutators.
 */
export function useAttendanceCalendar() {
  const { data: trips, isLoading: tripsLoading } =
    useRealtimeTable<TripHistoryEntry>('trip_history', fetchTripHistory, {
      cacheKey: 'device',
    })
  const {
    data: overrides,
    isLoading: overridesLoading,
    mutate: refetchOverrides,
  } = useRealtimeTable<AttendanceOverride>(
    'attendance_day_overrides',
    fetchAttendanceOverrides,
    { cacheKey: 'device' },
  )

  const days = useMemo(() => {
    const base = computeAttendanceDays(trips)
    const resolved = new Map<string, ResolvedAttendanceDay>()

    const shiftByDay = new Map<string, number>()
    const labelByDay = new Map<string, string>()
    const removedDays = new Set<string>()
    for (const o of overrides) {
      if (o.kind === 'workday_shift' && o.shiftDays) {
        shiftByDay.set(o.day, o.shiftDays)
      } else if (o.kind === 'holiday_label' && o.label) {
        labelByDay.set(o.day, o.label)
      } else if (o.kind === 'holiday_removed') {
        removedDays.add(o.day)
      }
    }

    for (const [iso, kind] of base) {
      if (kind === 'holiday') {
        if (removedDays.has(iso)) continue
        resolved.set(iso, { kind: 'holiday', label: labelByDay.get(iso) ?? null })
        continue
      }

      // kind === 'workday'
      const shift = shiftByDay.get(iso) ?? 0
      if (shift === 0) {
        resolved.set(iso, { kind: 'workday', originIso: iso, shiftDays: 0 })
        continue
      }
      // Keep the origin cell double-tap-able (so "元に戻す" is reachable),
      // and move the visible 〇 to the shifted destination cell.
      resolved.set(iso, { kind: 'workday-origin', originIso: iso, shiftDays: shift })
      resolved.set(addDaysISO(iso, shift), {
        kind: 'workday',
        originIso: iso,
        shiftDays: shift,
      })
    }

    return resolved
  }, [trips, overrides])

  return {
    days,
    isLoading: tripsLoading || overridesLoading,
    refetchOverrides,
  }
}
