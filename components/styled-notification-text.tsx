'use client'

// Renders a push-notification title/message with its **bold**/;;red;;/::orange::
// markup applied (see lib/notifications/notification-style.ts). Shared by the
// blocking pending-notification modal and the push-notification editor's
// live preview — the OS notification itself always shows plain text since
// Web Notifications can't render this styling.

import {
  NOTIFICATION_COLOR_CLASS,
  parseStyledText,
} from '@/lib/notifications/notification-style'

export function StyledNotificationText({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return (
    <span className={className}>
      {parseStyledText(text).map((seg, i) => (
        <span
          key={i}
          className={`${seg.bold ? 'font-bold' : ''} ${NOTIFICATION_COLOR_CLASS[seg.color]}`}
        >
          {seg.text}
        </span>
      ))}
    </span>
  )
}
