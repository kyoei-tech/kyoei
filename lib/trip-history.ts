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
  processMemo: string
  trafficMemo: string
  freeMemo: string
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
  process_memo: string | null
  traffic_memo: string | null
  free_memo: string | null
}

const SELECT_COLUMNS =
  'id, departed_at, returned_at, driving_ms, loading_ms, unloading_ms, waiting_ms, resting_ms, split_rest_remaining_ms, process_memo, traffic_memo, free_memo'

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
    processMemo: row.process_memo ?? '',
    trafficMemo: row.traffic_memo ?? '',
    freeMemo: row.free_memo ?? '',
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

/** Deletes one trip permanently. Scoped to this device's own trips. */
export async function deleteTripHistory(
  id: string,
): Promise<{ error: string | null }> {
  const deviceId = getDeviceId()
  if (!deviceId) return { error: 'device id not found' }
  const supabase = createClient()
  const { error } = await supabase
    .from('trip_history')
    .delete()
    .eq('id', id)
    .eq('device_id', deviceId)
  return { error: error?.message ?? null }
}

/** Updates the 出庫 / 帰庫 timestamps for one trip. Gated behind the 隠しコマンド in trip-history-view.tsx. */
export async function updateTripHistoryTimes(
  id: string,
  times: { departedAt: number; returnedAt: number },
): Promise<{ error: string | null }> {
  const deviceId = getDeviceId()
  if (!deviceId) return { error: 'device id not found' }
  if (times.returnedAt <= times.departedAt) {
    return { error: '帰庫日時は出庫日時より後にしてください' }
  }
  const supabase = createClient()
  const { error } = await supabase
    .from('trip_history')
    .update({
      departed_at: new Date(times.departedAt).toISOString(),
      returned_at: new Date(times.returnedAt).toISOString(),
    })
    .eq('id', id)
    .eq('device_id', deviceId)
  return { error: error?.message ?? null }
}

/**
 * Memos for rest-day gaps in the trip history "全表示" list, keyed by the
 * trip that follows the gap (see components/trip-history-view.tsx, which
 * inserts a 休日 card before that trip whenever the gap to the previous
 * trip's 帰庫 is 33 hours or more). Only used for gaps that don't contain a
 * Sunday — those are always plain "通常休日" with no memo needed.
 */
export type RestDayNote = {
  /** id of the trip immediately AFTER the rest gap. */
  tripId: string
  memo: string
}

type RestDayNoteRow = {
  trip_id: string
  memo: string
}

export async function fetchRestDayNotes(): Promise<RestDayNote[]> {
  const deviceId = getDeviceId()
  if (!deviceId) return []
  const supabase = createClient()
  const { data, error } = await supabase
    .from('trip_rest_day_notes')
    .select('trip_id, memo')
    .eq('device_id', deviceId)
  if (error || !data) return []
  return (data as RestDayNoteRow[]).map((row) => ({
    tripId: row.trip_id,
    memo: row.memo,
  }))
}

/** Upserts the memo for the rest gap that precedes `tripId`. */
export async function updateRestDayNote(
  tripId: string,
  memo: string,
): Promise<{ error: string | null }> {
  const deviceId = getDeviceId()
  if (!deviceId) return { error: 'device id not found' }
  const supabase = createClient()
  const { error } = await supabase.from('trip_rest_day_notes').upsert({
    device_id: deviceId,
    trip_id: tripId,
    memo: memo.trim(),
    updated_at: new Date().toISOString(),
  })
  return { error: error?.message ?? null }
}

/** Updates the 工程 / 渋滞区間 / 自由欄 memo fields for one trip. */
export async function updateTripHistoryMemo(
  id: string,
  memo: { processMemo: string; trafficMemo: string; freeMemo: string },
): Promise<{ error: string | null }> {
  const deviceId = getDeviceId()
  if (!deviceId) return { error: 'device id not found' }
  const supabase = createClient()
  const { error } = await supabase
    .from('trip_history')
    .update({
      process_memo: memo.processMemo.trim() || null,
      traffic_memo: memo.trafficMemo.trim() || null,
      free_memo: memo.freeMemo.trim() || null,
    })
    .eq('id', id)
    .eq('device_id', deviceId)
  return { error: error?.message ?? null }
}
