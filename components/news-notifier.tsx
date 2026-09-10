'use client'

// Watches the `news_posts` table for new rows (from any browser) and fires
// a push notification, regardless of which tab is currently open. Mounted
// once at the app root (see attendance-app.tsx) so an おしらせ posted while
// the user is on another tab still gets announced.

import { useEffect, useId } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSettings } from '@/lib/settings/settings-context'
import { deliverNotification } from '@/lib/notifications/push-notifications'

const NEWS_NOTIFICATION_TITLE = 'おしらせ'
const NEWS_NOTIFICATION_MESSAGE = '新しいおしらせがあります💡'

export function NewsNotifier() {
  const { pushNotificationsEnabled } = useSettings()
  const instanceId = useId()

  useEffect(() => {
    if (!pushNotificationsEnabled) return
    const supabase = createClient()
    const channel = supabase
      .channel(`realtime:news_posts:notify:${instanceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'news_posts' },
        () => {
          void deliverNotification(
            NEWS_NOTIFICATION_TITLE,
            NEWS_NOTIFICATION_MESSAGE,
          )
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [pushNotificationsEnabled, instanceId])

  return null
}
