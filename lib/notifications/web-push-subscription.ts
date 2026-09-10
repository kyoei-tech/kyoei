'use client'

// Registers this device for real Web Push (VAPID) so it can receive
// notifications from the push-broadcast Supabase Edge Function even while
// the app is fully closed or the device is asleep — unlike the local
// OS notifications in push-notifications.ts, which only work while this
// page's JS is actually running.

import { createClient } from '@/lib/supabase/client'
import { ensureServiceWorkerRegistration } from './push-notifications'

const VAPID_PUBLIC_KEY =
  'BAQZfKHk84kEIgJHOl3F7fpWqt5rEG7OnbxLFph5Yf-biGLVMgufMkc2oJkxNWYqBdHtpQcTYSzG5Z2k5wVBi2E'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Subscribes this browser to Web Push and saves the subscription to
 * Supabase. Safe to call repeatedly (e.g. every time Settings mounts with
 * notifications already granted) — re-subscribing returns the existing
 * subscription and the upsert just refreshes its row.
 */
export async function ensurePushSubscription(): Promise<void> {
  if (typeof window === 'undefined' || !('PushManager' in window)) return
  try {
    const registration = await ensureServiceWorkerRegistration()
    if (!registration) return

    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }

    const keys = subscription.toJSON().keys
    if (!keys?.p256dh || !keys?.auth) return

    const supabase = createClient()
    await supabase.from('push_subscriptions').upsert(
      {
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      { onConflict: 'endpoint' },
    )
  } catch {
    // Best-effort; ignore subscription failures (e.g. blocked permission).
  }
}

/**
 * Unsubscribes this browser from Web Push and removes it from Supabase,
 * called when the user turns off push notifications in Settings.
 */
export async function removePushSubscription(): Promise<void> {
  if (typeof window === 'undefined' || !('PushManager' in window)) return
  try {
    const registration = await ensureServiceWorkerRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return
    const endpoint = subscription.endpoint
    await subscription.unsubscribe()
    const supabase = createClient()
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  } catch {
    // Best-effort; ignore unsubscribe failures.
  }
}
