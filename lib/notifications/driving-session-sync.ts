'use client'

// Mirrors the current trip's live timer state into the `driving_sessions`
// Supabase table (one row per device, keyed on device_id) so a server-side
// job — see supabase/functions/driving-timer-check — can evaluate
// push_notification_rules and fire background push notifications even
// while this device's app is closed or backgrounded. The client's own
// tickNotifyState (driving-notifications.ts) keeps handling in-app delivery
// while the app is open; this module only keeps the server's view in sync.
//
// `fired_rule_ids` is intentionally never written here — it's owned
// exclusively by the server-side job so both sides never race to dedupe
// the same threshold crossing.

import { createClient } from '@/lib/supabase/client'
import { getDeviceId } from '@/lib/device-id'
import type { TripState } from '@/lib/trip-log'

const TABLE = 'driving_sessions'

/** Upserts the current trip's live state after any transition (departure, break tap, resume, or the 30-min auto-reset). */
export async function syncDrivingSession(
  trip: TripState,
  tripStartedAt: number,
): Promise<void> {
  const deviceId = getDeviceId()
  if (!deviceId) return
  const supabase = createClient()
  const { error } = await supabase.from(TABLE).upsert(
    {
      device_id: deviceId,
      trip_started_at: new Date(tripStartedAt).toISOString(),
      segment_started_at: new Date(trip.segmentStartedAt).toISOString(),
      active_category: trip.activeCategory,
      continuous_driving_ms: trip.continuousDrivingMs,
      continuous_driving_running: trip.continuousDrivingRunning,
      continuous_streak_started_at: new Date(trip.continuousStreakStartedAt).toISOString(),
      break_timer_ms: trip.breakTimerMs,
      break_timer_running: trip.breakTimerRunning,
      break_satisfied: trip.breakSatisfied,
      break_satisfied_at: trip.breakSatisfiedAt ? new Date(trip.breakSatisfiedAt).toISOString() : null,
    },
    { onConflict: 'device_id' },
  )
  if (error) console.error('[v0] driving_sessions sync failed:', error.message)
}

/** Removes this device's row once the trip ends (帰庫) — nothing left for the server job to evaluate. */
export async function clearDrivingSession(): Promise<void> {
  const deviceId = getDeviceId()
  if (!deviceId) return
  const supabase = createClient()
  const { error } = await supabase.from(TABLE).delete().eq('device_id', deviceId)
  if (error) console.error('[v0] driving_sessions clear failed:', error.message)
}
