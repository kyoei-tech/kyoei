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

// Strips the **bold**/;;red;;/::orange::/##green## rich-text markup used by
// the editable push-notification rules (see notification-style.ts) so the
// raw marker characters never show up in the OS notification text. This
// duplicates lib/notifications/notification-style.ts's toPlainText() rather
// than importing it, since this classic (non-module) service worker script
// cannot use ES module imports.
function stripMarkup(text) {
  return typeof text === 'string'
    ? text.replaceAll('**', '').replaceAll(';;', '').replaceAll('::', '').replaceAll('##', '')
    : text
}

self.addEventListener('push', (event) => {
  let payload = { title: 'おしらせ', message: '新しいおしらせがあります' }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch {
    // Ignore malformed payloads; fall back to the default text above.
  }
  event.waitUntil(
    self.registration.showNotification(stripMarkup(payload.title), {
      body: stripMarkup(payload.message),
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
