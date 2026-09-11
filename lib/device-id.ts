// A random, per-browser identifier persisted in localStorage. This app has
// no login, so this is the only way to scope a device's own data (push
// subscription, 運行履歴) — every device gets its own id the first time it
// needs one, and reuses it forever after.

const STORAGE_KEY = 'kyoei-device-id'

export function getDeviceId(): string {
  if (typeof window === 'undefined') return ''
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY)
    if (existing) return existing
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`
    window.localStorage.setItem(STORAGE_KEY, id)
    return id
  } catch {
    return ''
  }
}
