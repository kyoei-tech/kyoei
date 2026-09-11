'use client'

// Data layer for the editable 誤タップ防止 (accidental-tap prevention)
// confirmation messages shown by ConfirmActionModal across the app. Backed
// by the `confirm_action_messages` Supabase table so edits made from the
// secret "アラートの管理" editor are synced to every device in real time
// (same convention as push-rules.ts's `push_notification_rules` table).
//
// Each row's `message` may contain the same **bold**/;;red;;/::orange::/
// ##green## markup used by push notifications (see notification-style.ts),
// and line breaks are preserved and rendered as-is.

import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'

const TABLE = 'confirm_action_messages'

export type ConfirmActionMessage = {
  id: string
  label: string
  message: string
}

async function fetchConfirmActionMessages(): Promise<ConfirmActionMessage[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, label, message')
    .order('id', { ascending: true })
  if (error) throw error
  return (data as ConfirmActionMessage[]) ?? []
}

/** Realtime-synced list of every editable confirmation message. */
export function useConfirmActionMessages() {
  return useRealtimeTable(TABLE, fetchConfirmActionMessages)
}

export async function updateConfirmActionMessage(
  id: string,
  message: string,
): Promise<{ error: string | null }> {
  const supabase = createClient()
  const { error } = await supabase
    .from(TABLE)
    .update({ message, updated_at: new Date().toISOString() })
    .eq('id', id)
  return { error: error?.message ?? null }
}

/**
 * Looks up one message by id from an already-fetched list, falling back to
 * `fallback` (the original hardcoded copy) while loading or if the row is
 * somehow missing — callers never render a blank confirmation dialog.
 */
export function getConfirmActionMessage(
  messages: ConfirmActionMessage[],
  id: string,
  fallback: string,
): string {
  return messages.find((m) => m.id === id)?.message ?? fallback
}
