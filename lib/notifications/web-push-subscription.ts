'use client'

// Registers this device for real Web Push (VAPID) so it can receive
// notifications from the push-broadcast Supabase Edge Function even while
// the app is fully closed or the device is asleep — unlike the local
// OS notifications in push-notifications.ts, which only work while this
// page's JS is actually running.

import { createClient } from '@/lib/supabase/client'
import { getDeviceId } from '@/lib/device-id'
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
 * True when running on iOS/iPadOS Safari that has NOT been added to the
 * home screen. Apple only allows Web Push inside an installed ("standalone")
 * PWA — a regular Safari tab can never receive push, no matter what
 * permissions are granted. This is the most common real-world reason a
 * device never ends up with a saved subscription.
 */
export function isIosBrowserTabWithoutInstall(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
  if (!isIos) return false
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  return !isStandalone
}

export type PushSubscriptionResult =
  | { ok: true }
  | { ok: false; reason: string }

/**
 * Subscribes this browser to Web Push and saves the subscription to
 * Supabase. Safe to call repeatedly (e.g. every time Settings mounts with
 * notifications already granted) — re-subscribing returns the existing
 * subscription and the upsert just refreshes its row.
 *
 * Unlike a fire-and-forget best-effort helper, this reports back exactly
 * why a subscription failed so Settings can show the driver something
 * actionable instead of silently doing nothing.
 */
export async function ensurePushSubscription(): Promise<PushSubscriptionResult> {
  if (isIosBrowserTabWithoutInstall()) {
    return {
      ok: false,
      reason:
        'iPhone/iPadでは、ホーム画面に追加したアプリからのみプッシュ通知を受け取れます（Safariのタブでは届きません）。',
    }
  }
  if (typeof window === 'undefined' || !('PushManager' in window)) {
    return { ok: false, reason: 'このブラウザはプッシュ通知に対応していません。' }
  }
  try {
    const registration = await ensureServiceWorkerRegistration()
    if (!registration) {
      return { ok: false, reason: 'サービスワーカーの登録に失敗しました。' }
    }

    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }

    const keys = subscription.toJSON().keys
    if (!keys?.p256dh || !keys?.auth) {
      return { ok: false, reason: '購読情報の取得に失敗しました。' }
    }

    const deviceId = getDeviceId()
    const supabase = createClient()
    // Keyed on device_id (not endpoint) so a browser that gets a new push
    // endpoint (e.g. after clearing site data or a service worker reset)
    // updates its existing row instead of leaving a stale duplicate behind
    // — that stale row is exactly what the server-side driving-timer job
    // (which targets one device_id at a time) would otherwise push to.
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        device_id: deviceId || null,
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      { onConflict: deviceId ? 'device_id' : 'endpoint' },
    )
    if (error) {
      return { ok: false, reason: `保存に失敗しました: ${error.message}` }
    }
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: `登録に失敗しました: ${message}` }
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
