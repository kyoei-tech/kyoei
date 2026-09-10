'use client'

// Local push-style notifications: the timer conditions are computed
// client-side (see driving-notifications.ts), so there is no server push
// payload to relay — this just shows an OS-level notification via the
// service worker once the user has granted permission from Settings.

import { toPlainText } from './notification-style'
import { emitToast } from './toast-bus'

const SERVICE_WORKER_URL = '/sw.js'

export function isNotificationSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator
  )
}

export function getNotificationPermission(): NotificationPermission | null {
  if (!isNotificationSupported()) return null
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null =
  null

export function ensureServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!registrationPromise) {
    registrationPromise = (async () => {
      if (
        typeof navigator === 'undefined' ||
        !('serviceWorker' in navigator)
      ) {
        return null
      }
      try {
        return (
          (await navigator.serviceWorker.getRegistration(
            SERVICE_WORKER_URL,
          )) ?? (await navigator.serviceWorker.register(SERVICE_WORKER_URL))
        )
      } catch {
        return null
      }
    })()
  }
  return registrationPromise
}

/**
 * Shows an OS-level notification when permission has been granted.
 * No-ops silently otherwise (permission not granted, unsupported browser,
 * or a registration failure) — notifications are always best-effort and
 * must never throw into the caller's timer tick.
 *
 * `title`/`body` may contain the `**`/`;;`/`::` style markup used by the
 * editable rules (see notification-style.ts); the OS notification always
 * strips it to plain text since Web Notifications cannot render color or
 * bold text.
 */
export async function showAppNotification(
  title: string,
  body: string,
): Promise<void> {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return
  }
  const plainTitle = toPlainText(title)
  const plainBody = toPlainText(body)
  try {
    const registration = await ensureServiceWorkerRegistration()
    if (registration) {
      await registration.showNotification(plainTitle, {
        body: plainBody,
        icon: '/icon-192.png',
        tag: `kyoei-${plainTitle}-${Date.now()}`,
      })
      return
    }
    new Notification(plainTitle, { body: plainBody, icon: '/icon-192.png' })
  } catch {
    // Best-effort; ignore delivery failures.
  }
}

/**
 * Delivers a push notification through every channel this app supports:
 * an OS-level notification (plain text only) plus an in-app toast that can
 * render the color/bold markup while the app is open. Always best-effort.
 */
export async function deliverNotification(
  title: string,
  message: string,
): Promise<void> {
  emitToast(title, message)
  await showAppNotification(title, message)
}
