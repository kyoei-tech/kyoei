'use client'

// Persists the most recent notification that was delivered while the app
// was backgrounded/closed (see push-notifications.ts' deliverNotification),
// so it can be re-shown as a blocking modal the next time the app is
// opened/foregrounded — the OS notification banner itself is easy to miss
// or dismiss without reading. Notifications delivered while the app is
// visible are NOT stored here; the in-app toast already covers that case.

export type PendingNotification = {
  id: string
  title: string
  message: string
  createdAt: number
}

const STORAGE_KEY = 'kyoei-pending-notification'

type Listener = (entry: PendingNotification) => void
const listeners = new Set<Listener>()

/**
 * Lets the modal pick up a newly-saved pending notification immediately,
 * without waiting for a remount or a visibilitychange event — needed
 * because a notification can be saved well after the modal's mount-time
 * check already ran (e.g. an async catch-up query resolving later).
 */
export function subscribePendingNotification(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function savePendingNotification(title: string, message: string): void {
  if (typeof window === 'undefined') return
  const entry: PendingNotification = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    message,
    createdAt: Date.now(),
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entry))
  } catch {
    // Best-effort; ignore storage failures (e.g. private browsing quota).
  }
  for (const listener of listeners) listener(entry)
}

export function getPendingNotification(): PendingNotification | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PendingNotification
  } catch {
    return null
  }
}

export function clearPendingNotification(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Best-effort; ignore storage failures.
  }
}
