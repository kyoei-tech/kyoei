// Minimal service worker with two notification jobs:
//  1. Letting the open app show OS-level notifications via
//     ServiceWorkerRegistration.showNotification() (see push-notifications.ts).
//  2. Receiving real Web Push messages sent by the push-broadcast Supabase
//     Edge Function and showing them as OS notifications even while the
//     app tab/window is fully closed or the device is asleep.
// There is no fetch caching or offline support here by design.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let payload = { title: 'おしらせ', message: '新しいおしらせがあります' }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch {
    // Ignore malformed payloads; fall back to the default text above.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.message,
      icon: '/icon-192.png',
      tag: `kyoei-push-${Date.now()}`,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow('/')
    }),
  )
})
