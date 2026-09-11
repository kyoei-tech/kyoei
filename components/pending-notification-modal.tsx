'use client'

import { useEffect, useState } from 'react'
import { BellRing } from 'lucide-react'
import {
  dismissPendingNotification,
  getPendingNotifications,
  subscribePendingNotifications,
  type PendingNotification,
} from '@/lib/notifications/pending-notification'
import { StyledNotificationText } from './styled-notification-text'

/**
 * The app's single notification surface: every push notification (see
 * push-notifications.ts' deliverNotification), whether delivered while the
 * app was open or caught up on after being backgrounded/closed, shows here
 * as a blocking modal that must be dismissed with "了解しました。" — an OS
 * notification banner or an in-app toast is too easy to miss or dismiss
 * without reading. Mount once at the app root.
 *
 * Notifications queue up (see pending-notification.ts) so several firing in
 * quick succession are shown one at a time instead of the later ones
 * silently overwriting the earlier ones.
 */
export function PendingNotificationModal() {
  const [queue, setQueue] = useState<PendingNotification[]>([])

  useEffect(() => {
    setQueue(getPendingNotifications())
    return subscribePendingNotifications(setQueue)
  }, [])

  const current = queue[0] ?? null
  if (!current) return null

  function dismiss() {
    dismissPendingNotification(current.id)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-primary/30 bg-card p-6 shadow-xl">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
            <BellRing className="h-6 w-6 text-primary" aria-hidden="true" />
          </span>
          <StyledNotificationText
            text={current.title}
            className="text-base font-bold text-foreground"
          />
          <StyledNotificationText
            text={current.message}
            className="whitespace-pre-line text-sm leading-relaxed text-foreground"
          />
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="mt-5 w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-colors active:scale-[0.99]"
        >
          了解しました。
        </button>
      </div>
    </div>
  )
}
