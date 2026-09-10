'use client'

import { useEffect, useState } from 'react'
import { BellRing } from 'lucide-react'
import {
  clearPendingNotification,
  getPendingNotification,
  type PendingNotification,
} from '@/lib/notifications/pending-notification'
import { StyledNotificationText } from './notification-toast'

/**
 * Blocking modal shown once, the next time the app is opened/foregrounded,
 * for a notification that was delivered while the app was backgrounded or
 * closed (see push-notifications.ts' deliverNotification) — the OS
 * notification banner alone is easy to miss. Mount once at the app root.
 */
export function PendingNotificationModal() {
  const [pending, setPending] = useState<PendingNotification | null>(null)

  useEffect(() => {
    setPending(getPendingNotification())
    function checkOnForeground() {
      if (!document.hidden) setPending(getPendingNotification())
    }
    document.addEventListener('visibilitychange', checkOnForeground)
    return () =>
      document.removeEventListener('visibilitychange', checkOnForeground)
  }, [])

  if (!pending) return null

  function dismiss() {
    clearPendingNotification()
    setPending(null)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-primary/30 bg-card p-6 shadow-xl">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
            <BellRing className="h-6 w-6 text-primary" aria-hidden="true" />
          </span>
          <StyledNotificationText
            text={pending.title}
            className="text-base font-bold text-foreground"
          />
          <StyledNotificationText
            text={pending.message}
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
