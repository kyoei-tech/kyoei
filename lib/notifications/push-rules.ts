'use client'

// Data layer for the editable push-notification rules shown in the secret
// editor page. Backed by the `push_notification_rules` Supabase table so
// edits/additions/deletions are shared and synced across every device
// (same convention as lib/changelog.ts's `changelog_entries` table).

import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import type {
  NotificationTimerType,
  PushNotificationRule,
} from './driving-notifications'

const TABLE = 'push_notification_rules'

type PushNotificationRuleRow = {
  id: string
  timer_type: NotificationTimerType
  threshold_ms: number
  title: string
  message: string
}

function fromRow(row: PushNotificationRuleRow): PushNotificationRule {
  return {
    id: row.id,
    timerType: row.timer_type,
    thresholdMs: row.threshold_ms,
    title: row.title,
    message: row.message,
  }
}

async function fetchPushNotificationRules(): Promise<PushNotificationRule[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, timer_type, threshold_ms, title, message')
    .order('timer_type', { ascending: true })
    .order('threshold_ms', { ascending: true })
  if (error) throw error
  return ((data as PushNotificationRuleRow[]) ?? []).map(fromRow)
}

/** Realtime-synced list of every push-notification rule, across all timer types. */
export function usePushNotificationRules() {
  return useRealtimeTable(TABLE, fetchPushNotificationRules)
}

export async function createPushNotificationRule(input: {
  timerType: NotificationTimerType
  thresholdMs: number
  title: string
  message: string
}): Promise<{ error: string | null }> {
  const supabase = createClient()
  const { error } = await supabase.from(TABLE).insert({
    timer_type: input.timerType,
    threshold_ms: input.thresholdMs,
    title: input.title,
    message: input.message,
  })
  return { error: error?.message ?? null }
}

export async function updatePushNotificationRule(
  id: string,
  input: { thresholdMs: number; title: string; message: string },
): Promise<{ error: string | null }> {
  const supabase = createClient()
  const { error } = await supabase
    .from(TABLE)
    .update({
      threshold_ms: input.thresholdMs,
      title: input.title,
      message: input.message,
    })
    .eq('id', id)
  return { error: error?.message ?? null }
}

export async function deletePushNotificationRule(
  id: string,
): Promise<{ error: string | null }> {
  const supabase = createClient()
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  return { error: error?.message ?? null }
}
