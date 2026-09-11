// Manual edits on top of the computed attendance calendar (see
// lib/attendance-calendar.ts): shifting a workday by +/-1 day, relabeling a
// holiday's text, or removing a holiday. Scoped per device via
// lib/device-id.ts, same as trip_history.

import { createClient } from '@/lib/supabase/client'
import { getDeviceId } from '@/lib/device-id'

export type AttendanceOverrideKind =
  | 'workday_shift'
  | 'holiday_label'
  | 'holiday_removed'

export type AttendanceOverride = {
  id: string
  day: string // ISO date this override applies to
  kind: AttendanceOverrideKind
  shiftDays: number | null
  label: string | null
}

type AttendanceOverrideRow = {
  id: string
  day: string
  kind: AttendanceOverrideKind
  shift_days: number | null
  label: string | null
}

function toOverride(row: AttendanceOverrideRow): AttendanceOverride {
  return {
    id: row.id,
    day: row.day,
    kind: row.kind,
    shiftDays: row.shift_days,
    label: row.label,
  }
}

export async function fetchAttendanceOverrides(): Promise<
  AttendanceOverride[]
> {
  const deviceId = getDeviceId()
  if (!deviceId) return []
  const supabase = createClient()
  const { data, error } = await supabase
    .from('attendance_day_overrides')
    .select('id, day, kind, shift_days, label')
    .eq('device_id', deviceId)
  if (error || !data) return []
  return (data as AttendanceOverrideRow[]).map(toOverride)
}

/** Shifts a workday by +1 or -1 calendar day. Workdays cannot be deleted. */
export async function setWorkdayShift(
  day: string,
  shiftDays: -1 | 0 | 1,
): Promise<{ error: string | null }> {
  const deviceId = getDeviceId()
  if (!deviceId) return { error: 'device id not found' }
  const supabase = createClient()
  if (shiftDays === 0) {
    const { error } = await supabase
      .from('attendance_day_overrides')
      .delete()
      .eq('device_id', deviceId)
      .eq('day', day)
      .eq('kind', 'workday_shift')
    return { error: error?.message ?? null }
  }
  const { error } = await supabase.from('attendance_day_overrides').upsert(
    {
      device_id: deviceId,
      day,
      kind: 'workday_shift',
      shift_days: shiftDays,
      label: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'device_id,day' },
  )
  return { error: error?.message ?? null }
}

/** Sets custom holiday text, or clears it back to the default label. */
export async function setHolidayLabel(
  day: string,
  label: string,
): Promise<{ error: string | null }> {
  const deviceId = getDeviceId()
  if (!deviceId) return { error: 'device id not found' }
  const supabase = createClient()
  const trimmed = label.trim()
  if (!trimmed) {
    const { error } = await supabase
      .from('attendance_day_overrides')
      .delete()
      .eq('device_id', deviceId)
      .eq('day', day)
      .eq('kind', 'holiday_label')
    return { error: error?.message ?? null }
  }
  const { error } = await supabase.from('attendance_day_overrides').upsert(
    {
      device_id: deviceId,
      day,
      kind: 'holiday_label',
      shift_days: null,
      label: trimmed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'device_id,day' },
  )
  return { error: error?.message ?? null }
}

/** Deletes a holiday entirely (the cell shows blank instead). */
export async function removeHoliday(
  day: string,
): Promise<{ error: string | null }> {
  const deviceId = getDeviceId()
  if (!deviceId) return { error: 'device id not found' }
  const supabase = createClient()
  // Clear any label override for this day first, then mark it removed.
  await supabase
    .from('attendance_day_overrides')
    .delete()
    .eq('device_id', deviceId)
    .eq('day', day)
    .eq('kind', 'holiday_label')
  const { error } = await supabase.from('attendance_day_overrides').upsert(
    {
      device_id: deviceId,
      day,
      kind: 'holiday_removed',
      shift_days: null,
      label: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'device_id,day' },
  )
  return { error: error?.message ?? null }
}
