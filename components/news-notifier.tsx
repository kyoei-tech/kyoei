'use client'

// Watches the `news_posts` table for new rows (from any browser) and fires
// a push notification, regardless of which tab is currently open. Mounted
// once at the app root (see attendance-app.tsx) so an おしらせ posted while
// the user is on another tab still gets announced.
//
// A Realtime websocket subscription alone misses posts made while the
// socket was disconnected — backgrounded/sleeping tabs, mobile browsers
// suspending sockets, or the app simply not open yet — which is exactly
// why devices other than the poster's were not getting notified. So this
// also does a plain "catch up" query for anything newer than the last
// notified post every time the app becomes active, in addition to the
// live Realtime subscription for the case where the socket is connected.

import { useEffect, useId } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSettings } from '@/lib/settings/settings-context'
import { deliverNotification } from '@/lib/notifications/push-notifications'
import {
  getNewsLastSeen,
  initNewsLastSeenIfMissing,
  setNewsLastSeen,
} from '@/lib/notifications/news-last-seen'

const NEWS_NOTIFICATION_TITLE = 'おしらせ'
const NEWS_NOTIFICATION_MESSAGE = '新しいおしらせがあります💡'

export function NewsNotifier() {
  const { pushNotificationsEnabled } = useSettings()
  const instanceId = useId()

  useEffect(() => {
    if (!pushNotificationsEnabled) return

    const supabase = createClient()
    let cancelled = false

    initNewsLastSeenIfMissing(new Date().toISOString())

    async function catchUp() {
      const lastSeen = getNewsLastSeen()
      if (!lastSeen) return
      const { data, error } = await supabase
        .from('news_posts')
        .select('created_at')
        .gt('created_at', lastSeen)
        .order('created_at', { ascending: false })
        .limit(1)
      if (cancelled || error || !data || data.length === 0) return
      setNewsLastSeen(data[0].created_at as string)
      // Caught up on a post made while this device wasn't watching (app
      // closed, tab backgrounded, or just opened) — always surface the
      // blocking "了解しました。" modal, not just a toast.
      void deliverNotification(
        NEWS_NOTIFICATION_TITLE,
        NEWS_NOTIFICATION_MESSAGE,
        { forcePending: true },
      )
    }

    // Catch up immediately on mount (covers: app was fully closed, or the
    // Realtime socket had not connected yet when a post came in).
    void catchUp()

    // Catch up again whenever the tab regains focus/visibility (covers:
    // socket was silently dropped while backgrounded/asleep).
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') void catchUp()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Live updates while the socket stays connected.
    const channel = supabase
      .channel(`realtime:news_posts:notify:${instanceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'news_posts' },
        (payload) => {
          const createdAt = (payload.new as { created_at?: string })
            ?.created_at
          if (createdAt) setNewsLastSeen(createdAt)
          void deliverNotification(
            NEWS_NOTIFICATION_TITLE,
            NEWS_NOTIFICATION_MESSAGE,
          )
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      supabase.removeChannel(channel)
    }
  }, [pushNotificationsEnabled, instanceId])

  return null
}
