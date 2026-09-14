'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { BackHeader } from './back-header'
import {
  getConfirmActionButtonVisibility,
  getConfirmActionCancelLabel,
  getConfirmActionConfirmLabel,
  getConfirmActionMessage,
  getDefaultConfirmActionLabels,
  updateConfirmActionButtonLabels,
  updateConfirmActionMessage,
  useConfirmActionMessages,
} from '@/lib/notifications/confirm-messages'
import { NOTIFICATION_MARKUP_HELP } from '@/lib/notifications/notification-style'
import { StyledNotificationText } from './styled-notification-text'

/**
 * The secret "アラートの管理" screen (reached via settings-view.tsx's
 * NotificationAdminMenu). Lets every 誤タップ防止 confirmation dialog's
 * wording be edited in one place, with the same bold/red/orange/green
 * markup (see NOTIFICATION_MARKUP_HELP) and line-break support as push
 * notifications. Backed by the `confirm_action_messages` table, so edits
 * sync to every device in real time via useConfirmActionMessages's
 * Postgres Changes subscription.
 */
export function AlertMessageEditorView({ onBack }: { onBack: () => void }) {
  const { data: messages, isLoading, mutate } = useConfirmActionMessages()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [draftConfirmLabel, setDraftConfirmLabel] = useState('')
  const [draftCancelLabel, setDraftCancelLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function startEdit(id: string, fallback: string) {
    setSaveError(null)
    setDraft(getConfirmActionMessage(messages, id, fallback))
    const defaults = getDefaultConfirmActionLabels(id)
    setDraftConfirmLabel(
      getConfirmActionConfirmLabel(messages, id, defaults.confirmLabel),
    )
    setDraftCancelLabel(
      getConfirmActionCancelLabel(messages, id, defaults.cancelLabel),
    )
    setEditingId(id)
  }

  function cancelEdit() {
    setEditingId(null)
    setSaveError(null)
  }

  async function saveEdit() {
    if (!editingId || !draft.trim()) {
      setSaveError('本文を入力してください。')
      return
    }
    const { hasButtons, hasCancel } = getConfirmActionButtonVisibility(editingId)
    if (hasButtons && !draftConfirmLabel.trim()) {
      setSaveError('ボタンの文言を入力してください。')
      return
    }
    setSaving(true)
    const { error } = await updateConfirmActionMessage(editingId, draft.trim())
    if (!error && hasButtons) {
      const { error: labelError } = await updateConfirmActionButtonLabels(
        editingId,
        draftConfirmLabel,
        hasCancel ? draftCancelLabel : '',
      )
      if (labelError) {
        setSaving(false)
        setSaveError(labelError)
        return
      }
    }
    setSaving(false)
    if (error) {
      setSaveError(error)
      return
    }
    await mutate()
    setEditingId(null)
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <BackHeader onBack={onBack} variant="subtle" />

      <div>
        <h2 className="text-xl font-bold text-foreground">アラートの管理</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          誤タップ防止の確認画面に表示される文言を編集できます。ここでの変更は全ての端末にリアルタイムで反映されます。
        </p>
      </div>

      {isLoading && messages.length === 0 && (
        <p className="text-sm text-muted-foreground">読み込み中です…</p>
      )}

      <ul className="flex flex-col gap-2.5">
        {messages.map((item) => {
          const isEditing = editingId === item.id
          const { hasButtons, hasCancel } = getConfirmActionButtonVisibility(
            item.id,
          )
          const defaults = getDefaultConfirmActionLabels(item.id)
          const confirmLabel = getConfirmActionConfirmLabel(
            messages,
            item.id,
            defaults.confirmLabel,
          )
          const cancelLabel = getConfirmActionCancelLabel(
            messages,
            item.id,
            defaults.cancelLabel,
          )
          return (
            <li
              key={item.id}
              className={`rounded-2xl border bg-card px-4 py-3.5 ${
                isEditing ? 'border-primary/50' : 'border-border'
              }`}
            >
              <div className="flex items-start justify-between gap-2.5">
                <span className="text-xs font-bold text-muted-foreground">
                  {item.label}
                </span>
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => startEdit(item.id, item.message)}
                    aria-label="編集する"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-90"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>

              {isEditing ? (
                <div className="mt-2 flex flex-col gap-3">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={3}
                    autoFocus
                    className="resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none focus:border-primary/60"
                  />
                  <p className="text-[0.65rem] leading-relaxed text-muted-foreground">
                    {NOTIFICATION_MARKUP_HELP}
                  </p>
                  {draft && (
                    <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
                      <p className="text-[0.65rem] font-semibold text-muted-foreground">
                        プレビュー
                      </p>
                      <StyledNotificationText
                        text={draft}
                        className="mt-1 block whitespace-pre-line text-sm font-bold leading-relaxed text-foreground"
                      />
                    </div>
                  )}

                  {hasButtons && (
                    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background px-3 py-2.5">
                      <p className="text-[0.65rem] font-semibold text-muted-foreground">
                        ボタンの文言
                      </p>
                      <div
                        className={`flex gap-2 ${hasCancel ? '' : 'flex-col'}`}
                      >
                        {hasCancel && (
                          <label className="flex flex-1 flex-col gap-1">
                            <span className="text-[0.65rem] text-muted-foreground">
                              キャンセル側
                            </span>
                            <input
                              type="text"
                              value={draftCancelLabel}
                              onChange={(e) =>
                                setDraftCancelLabel(e.target.value)
                              }
                              className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/60"
                            />
                          </label>
                        )}
                        <label className="flex flex-1 flex-col gap-1">
                          <span className="text-[0.65rem] text-muted-foreground">
                            確定側
                          </span>
                          <input
                            type="text"
                            value={draftConfirmLabel}
                            onChange={(e) =>
                              setDraftConfirmLabel(e.target.value)
                            }
                            className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/60"
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {saveError && (
                    <p className="text-xs font-semibold text-destructive">
                      {saveError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={saving}
                      className="flex-1 rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-95 disabled:opacity-50"
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={saving}
                      className="flex-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-50"
                    >
                      {saving ? '保存中…' : '保存'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <StyledNotificationText
                    text={item.message}
                    className="mt-1 block whitespace-pre-line text-sm font-bold leading-relaxed text-foreground"
                  />
                  {hasButtons && (
                    <p className="mt-2 text-[0.65rem] text-muted-foreground">
                      ボタン：
                      {hasCancel ? `${cancelLabel} / ${confirmLabel}` : confirmLabel}
                    </p>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
