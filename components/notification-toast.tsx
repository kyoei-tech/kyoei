'use client'

import { useEffect, useState } from 'react'
import { BellRing, X } from 'lucide-react'
import {
  NOTIFICATION_COLOR_CLASS,
  parseStyledText,
} from '@/lib/notifications/notification-style'
import { subscribeToast, type ToastEvent } from '@/lib/notifications/toast-bus'

const AUTO_DISMISS_MS = 8000

/** Renders a styled push-notification message (color/bold markup applied). */
export function StyledNotificationText({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return (
    <span className={className}>
      {parseStyledText(text).map((seg, i) => (
        <span
          key={i}
          className={`${seg.bold ? 'font-bold' : ''} ${NOTIFICATION_COLOR_CLASS[seg.color]}`}
        >
          {seg.text}
        </span>
      ))}
    </span>
  )
}

/**
 * App-open toast for push notifications. OS notifications (see
 * push-notifications.ts) always show plain text, so this is the only place
 * color/bold styling is actually visible. Mount once at the app root.
 */
export function NotificationToastContainer() {
  const [toasts, setToasts] = useState<ToastEvent[]>([])

  useEffect(() => {
    return subscribeToast((event) => {
      setToasts((cur) => [...cur, event])
      setTimeout(() => {
        setToasts((cur) => cur.filter((t) => t.id !== event.id))
      }, AUTO_DISMISS_MS)
    })
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="w-full max-w-md rounded-2xl border border-primary/30 bg-card px-4 py-3 shadow-lg"
        >
          <div className="flex items-start gap-2.5">
            <BellRing
              className="mt-0.5 h-5 w-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div className="flex-1">
              <StyledNotificationText
                text={toast.title}
                className="text-sm font-bold text-foreground"
              />
              <StyledNotificationText
                text={toast.message}
                className="mt-0.5 block whitespace-pre-line text-sm leading-relaxed text-foreground"
              />
            </div>
            <button
              type="button"
              onClick={() =>
                setToasts((cur) => cur.filter((t) => t.id !== toast.id))
              }
              aria-label="通知を閉じる"
              className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-90"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
