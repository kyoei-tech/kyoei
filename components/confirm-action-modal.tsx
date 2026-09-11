'use client'

import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { StyledNotificationText } from './styled-notification-text'

/**
 * Full-screen "誤タップ防止" confirmation overlay shown before a status
 * change. `message` may contain the same **bold**/;;red;;/::orange::/
 * ##green## markup and line breaks used by push notifications — see
 * notification-style.ts — and is editable from the secret "アラートの管理"
 * screen (lib/notifications/confirm-messages.ts), synced to every device.
 */
export function ConfirmActionModal({
  message,
  body,
  confirmLabel = '開始する',
  cancelLabel = 'キャンセル',
  onConfirm,
  onCancel,
}: {
  message: string
  body?: ReactNode
  confirmLabel?: string
  /** Pass null to hide the cancel button (e.g. an acknowledgement-only dialog). */
  cancelLabel?: string | null
  onConfirm: () => void
  onCancel?: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
      <div className="w-full max-w-xs rounded-3xl border border-border bg-card p-6">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <AlertTriangle className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <StyledNotificationText
          text={message}
          className="block whitespace-pre-line text-center text-base font-bold text-foreground"
        />
        {body && <div className="mt-3">{body}</div>}
        <div className="mt-5 flex gap-2">
          {cancelLabel !== null && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-95"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
