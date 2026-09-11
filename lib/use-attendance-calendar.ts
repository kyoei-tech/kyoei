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

export type ResolvedAttendanceDay = {
  kind: AttendanceDayKind
  /** Custom holiday text, if any (only meaningful when kind === 'holiday'). */
  label: string | null
}

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
    for (const [iso, kind] of base) resolved.set(iso, { kind, label: null })

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

    // Apply workday shifts: move the 〇 from its computed day to +/-1 day.
    for (const [iso, shift] of shiftByDay) {
      const entry = resolved.get(iso)
      if (!entry || entry.kind !== 'workday') continue
      resolved.delete(iso)
      resolved.set(addDaysISO(iso, shift), { kind: 'workday', label: null })
    }

    // Apply holiday label overrides.
    for (const [iso, label] of labelByDay) {
      const entry = resolved.get(iso)
      if (entry && entry.kind === 'holiday') {
        resolved.set(iso, { kind: 'holiday', label })
      }
    }

    // Apply holiday removals (cell goes blank).
    for (const iso of removedDays) {
      const entry = resolved.get(iso)
      if (entry && entry.kind === 'holiday') resolved.delete(iso)
    }

    return resolved
  }, [trips, overrides])

  return {
    days,
    isLoading: tripsLoading || overridesLoading,
    refetchOverrides,
  }
}
