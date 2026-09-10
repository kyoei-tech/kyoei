// Tracks the newest `news_posts.created_at` this device has already been
// notified about. Backing the news notifier purely with a Realtime
// websocket subscription misses posts made while the socket was
// disconnected (tab backgrounded/asleep, app just opened, mobile browsers
// suspending sockets, etc). Persisting a "last seen" timestamp lets the
// app catch up with a plain query every time it becomes active, which is
// what actually gets non-posting devices notified.

const STORAGE_KEY = 'kyoei-news-last-seen'

export function getNewsLastSeen(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function setNewsLastSeen(isoTimestamp: string): void {
  if (typeof window === 'undefined') return
  try {
    const current = window.localStorage.getItem(STORAGE_KEY)
    if (current && current >= isoTimestamp) return
    window.localStorage.setItem(STORAGE_KEY, isoTimestamp)
  } catch {
    // Best-effort; ignore storage failures (e.g. private browsing).
  }
}

/** First-ever run: don't notify for the entire pre-existing news history. */
export function initNewsLastSeenIfMissing(nowIso: string): void {
  if (typeof window === 'undefined') return
  try {
    if (!window.localStorage.getItem(STORAGE_KEY)) {
      window.localStorage.setItem(STORAGE_KEY, nowIso)
    }
  } catch {
    // Best-effort; ignore storage failures.
  }
}
