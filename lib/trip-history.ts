// Records completed 出庫→帰庫 trips to Supabase's `trip_history` table and
// reads them back for the 運行履歴 review page. Scoped per device (this app
// has no login) via lib/device-id.ts.

import { createClient } from '@/lib/supabase/client'
import { getDeviceId } from '@/lib/device-id'
import type { CategoryTotals } from './trip-log'

export type TripHistoryEntry = {
  id: string
  departedAt: number
  returnedAt: number
  totals: CategoryTotals
  splitRestRemainingMs: number | null
}

type TripHistoryRow = {
  id: string
  departed_at: string
  returned_at: string
  driving_ms: number
  loading_ms: number
  unloading_ms: number
  waiting_ms: number
  resting_ms: number
  split_rest_remaining_ms: number | null
}

const SELECT_COLUMNS =
  'id, departed_at, returned_at, driving_ms, loading_ms, unloading_ms, waiting_ms, resting_ms, split_rest_remaining_ms'

function toEntry(row: TripHistoryRow): TripHistoryEntry {
  return {
    id: row.id,
    departedAt: new Date(row.departed_at).getTime(),
    returnedAt: new Date(row.returned_at).getTime(),
    totals: {
      driving: row.driving_ms,
      loading: row.loading_ms,
      unloading: row.unloading_ms,
      waiting: row.waiting_ms,
      resting: row.resting_ms,
    },
    splitRestRemainingMs: row.split_rest_remaining_ms,
  }
}

/** Called once at 帰庫, after the trip's final totals are known. Best-effort. */
export async function saveCompletedTrip(params: {
  departedAt: number
  returnedAt: number
  totals: CategoryTotals
  splitRestRemainingMs: number | null
}): Promise<void> {
  const deviceId = getDeviceId()
  if (!deviceId) return
  try {
    const supabase = createClient()
    await supabase.from('trip_history').insert({
      device_id: deviceId,
      departed_at: new Date(params.departedAt).toISOString(),
      returned_at: new Date(params.returnedAt).toISOString(),
      driving_ms: Math.round(params.totals.driving),
      loading_ms: Math.round(params.totals.loading),
      unloading_ms: Math.round(params.totals.unloading),
      waiting_ms: Math.round(params.totals.waiting),
      resting_ms: Math.round(params.totals.resting),
      split_rest_remaining_ms: params.splitRestRemainingMs,
    })
  } catch {
    // Best-effort; the driver's local timers already reset regardless.
  }
}

/** Most recent trips for this device, newest first. */
export async function fetchTripHistory(
  limit = 200,
): Promise<TripHistoryEntry[]> {
  const deviceId = getDeviceId()
  if (!deviceId) return []
  const supabase = createClient()
  const { data, error } = await supabase
    .from('trip_history')
    .select(SELECT_COLUMNS)
    .eq('device_id', deviceId)
    .order('departed_at', { ascending: false })
    .limit(limit)
  if (error || !data) return []
  return (data as TripHistoryRow[]).map(toEntry)
}
