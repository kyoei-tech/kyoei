'use client'

// Data layer for the editable 誤タップ防止 (accidental-tap prevention)
// confirmation messages shown by ConfirmActionModal across the app. Backed
// by the `confirm_action_messages` Supabase table so edits made from the
// secret "アラートの管理" editor are synced to every device in real time
// (same convention as push-rules.ts's `push_notification_rules` table).
//
// Each row's `message` may contain the same **bold**/;;red;;/::orange::/
// ##green## markup used by push notifications (see notification-style.ts),
// and line breaks are preserved and rendered as-is. `confirm_label` and
// `cancel_label` are the wording of the modal's two buttons (e.g. "開始す
// る"/"キャンセル") — null means "use the hardcoded default" so existing
// rows keep working even before they're explicitly customized.

import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'

const TABLE = 'confirm_action_messages'

export type ConfirmActionMessage = {
  id: string
  label: string
  message: string
  confirmLabel: string | null
  cancelLabel: string | null
}

/**
 * Per-id button configuration that can't be edited from アラートの管理
 * because it isn't just wording:
 * - `hasButtons: false` — the id is body text rendered inside another
 *   dialog (home-split-rest-body), not a dialog of its own.
 * - `hasCancel: false` — the dialog intentionally has no cancel button
 *   (an acknowledgement-only dialog, e.g. home-split-rest-message).
 */
export const CONFIRM_ACTION_BUTTON_VISIBILITY: Record<
  string,
  { hasButtons: boolean; hasCancel: boolean }
> = {
  'home-split-rest-body': { hasButtons: false, hasCancel: false },
  'home-split-rest-message': { hasButtons: true, hasCancel: false },
}

export function getConfirmActionButtonVisibility(id: string) {
  return (
    CONFIRM_ACTION_BUTTON_VISIBILITY[id] ?? {
      hasButtons: true,
      hasCancel: true,
    }
  )
}

/**
 * The original hardcoded button wording for each dialog, kept here so the
 * "アラートの管理" editor can show the real current value (rather than a
 * blank field) for ids that have never been customized, and so callers and
 * the editor share one source of truth instead of repeating literals.
 */
export const DEFAULT_CONFIRM_ACTION_LABELS: Record<
  string,
  { confirmLabel: string; cancelLabel: string }
> = {
  'accident-report-reset': { confirmLabel: 'リセットする', cancelLabel: 'キャンセル' },
  'driving-category-loading': { confirmLabel: '開始する', cancelLabel: 'キャンセル' },
  'driving-category-resting': { confirmLabel: '開始する', cancelLabel: 'キャンセル' },
  'driving-category-unloading': { confirmLabel: '開始する', cancelLabel: 'キャンセル' },
  'driving-category-waiting': { confirmLabel: '開始する', cancelLabel: 'キャンセル' },
  'driving-resume': { confirmLabel: '開始する', cancelLabel: 'キャンセル' },
  'home-departure': { confirmLabel: '開始する', cancelLabel: 'キャンセル' },
  'home-return': { confirmLabel: '開始する', cancelLabel: 'キャンセル' },
  'home-split-rest-message': { confirmLabel: '確認しました', cancelLabel: 'キャンセル' },
  'timecard-break-end': { confirmLabel: '終了する', cancelLabel: 'キャンセル' },
  'timecard-break-start': { confirmLabel: '開始する', cancelLabel: 'キャンセル' },
  'timecard-clock-in': { confirmLabel: '押しました', cancelLabel: 'キャンセル' },
  'timecard-clock-out': { confirmLabel: '押しました', cancelLabel: 'キャンセル' },
}

export function getDefaultConfirmActionLabels(id: string) {
  return (
    DEFAULT_CONFIRM_ACTION_LABELS[id] ?? {
      confirmLabel: '開始する',
      cancelLabel: 'キャンセル',
    }
  )
}

async function fetchConfirmActionMessages(): Promise<ConfirmActionMessage[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, label, message, confirm_label, cancel_label')
    .order('id', { ascending: true })
  if (error) throw error
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    label: row.label,
    message: row.message,
    confirmLabel: row.confirm_label ?? null,
    cancelLabel: row.cancel_label ?? null,
  }))
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
 * Updates a dialog's button wording. Pass an empty string (after trimming)
 * to fall back to the original hardcoded label — it is stored as `null`.
 */
export async function updateConfirmActionButtonLabels(
  id: string,
  confirmLabel: string,
  cancelLabel: string,
): Promise<{ error: string | null }> {
  const supabase = createClient()
  const { error } = await supabase
    .from(TABLE)
    .update({
      confirm_label: confirmLabel.trim() || null,
      cancel_label: cancelLabel.trim() || null,
      updated_at: new Date().toISOString(),
    })
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

/** Same lookup, but for the confirm ("開始する"/"押しました"/etc) button label. */
export function getConfirmActionConfirmLabel(
  messages: ConfirmActionMessage[],
  id: string,
  fallback: string,
): string {
  return messages.find((m) => m.id === id)?.confirmLabel ?? fallback
}

/** Same lookup, but for the cancel ("キャンセル") button label. */
export function getConfirmActionCancelLabel(
  messages: ConfirmActionMessage[],
  id: string,
  fallback: string,
): string {
  return messages.find((m) => m.id === id)?.cancelLabel ?? fallback
}
