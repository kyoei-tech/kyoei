// Queues every notification delivered via push-notifications.ts'
// deliverNotification so it can be shown as a blocking "了解しました。" modal
// — the app's single notification channel now that the in-app toast has
// been retired. A queue (not a single slot) is required because multiple
// notifications can be saved in quick succession (e.g. several driving
// timers crossing their threshold on the same tick); without one, a later
// save would silently overwrite an earlier notification before the user
// ever saw it.

export type PendingNotification = {
  id: string
  title: string
  message: string
  createdAt: number
}

const STORAGE_KEY = 'kyoei-pending-notifications'

type Listener = (queue: PendingNotification[]) => void
const listeners = new Set<Listener>()

function readQueue(): PendingNotification[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as PendingNotification[]) : []
  } catch {
    return []
  }
}

function writeQueue(queue: PendingNotification[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  } catch {
    // Best-effort; ignore storage failures (e.g. private browsing quota).
  }
  for (const listener of listeners) listener(queue)
}

/**
 * Lets the modal pick up queue changes immediately, without waiting for a
 * remount or a visibilitychange event — needed because a notification can
 * be saved well after the modal's mount-time check already ran (e.g. an
 * async catch-up query resolving later, or another timer firing while the
 * modal for an earlier one is still open).
 */
export function subscribePendingNotifications(listener: Listener): () => void {
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
  writeQueue([...readQueue(), entry])
}

export function getPendingNotifications(): PendingNotification[] {
  return readQueue()
}

/** Removes one notification (the one just dismissed) so the next in queue, if any, shows next. */
export function dismissPendingNotification(id: string): void {
  writeQueue(readQueue().filter((entry) => entry.id !== id))
}
