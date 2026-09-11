// Parses the rich-text markup used inside push-notification titles/messages
// and renders it for two very different targets:
//
//   1. OS-level Notification API — text only, no styling is possible, so
//      every marker is stripped before the string reaches `Notification`
//      or `ServiceWorkerRegistration.showNotification`.
//   2. In-app custom toast — same source string rendered as React nodes so
//      color/weight actually show up while the app is open.
//
// Markup (documented for the editor UI as well):
//   **text**   -> bold
//   ;;text;;   -> red
//   ::text::   -> orange
//   ##text##   -> green
// Markers may nest/overlap in any order, e.g. **;;3時間;;** renders bold+red.

export type NotificationColor = 'default' | 'red' | 'orange' | 'green'

export type StyledSegment = {
  text: string
  bold: boolean
  color: NotificationColor
}

type Marker = {
  token: string
  apply: (seg: StyledSegment) => StyledSegment
}

const MARKERS: Marker[] = [
  { token: '**', apply: (seg) => ({ ...seg, bold: true }) },
  { token: ';;', apply: (seg) => ({ ...seg, color: 'red' }) },
  { token: '::', apply: (seg) => ({ ...seg, color: 'orange' }) },
  { token: '##', apply: (seg) => ({ ...seg, color: 'green' }) },
]

/**
 * Splits `raw` into styled segments by scanning for the three marker tokens.
 * Unmatched/unterminated markers are treated as literal text so partially
 * typed input never crashes the editor preview.
 */
export function parseStyledText(raw: string): StyledSegment[] {
  const segments: StyledSegment[] = []
  let cursor = 0
  let active: StyledSegment = { text: '', bold: false, color: 'default' }

  function flush() {
    if (active.text.length > 0) segments.push(active)
  }

  while (cursor < raw.length) {
    const marker = MARKERS.find((m) => raw.startsWith(m.token, cursor))
    if (marker) {
      const closeIndex = raw.indexOf(marker.token, cursor + marker.token.length)
      if (closeIndex !== -1) {
        flush()
        const inner = raw.slice(cursor + marker.token.length, closeIndex)
        const innerSegments = parseStyledText(inner).map((seg) =>
          marker.apply(seg),
        )
        segments.push(...innerSegments)
        active = { text: '', bold: false, color: 'default' }
        cursor = closeIndex + marker.token.length
        continue
      }
    }
    active.text += raw[cursor]
    cursor += 1
  }
  flush()
  return segments
}

/** Strips every style marker, leaving plain text for OS notifications. */
export function toPlainText(raw: string): string {
  return raw
    .replaceAll('**', '')
    .replaceAll(';;', '')
    .replaceAll('::', '')
    .replaceAll('##', '')
}

export const NOTIFICATION_COLOR_CLASS: Record<NotificationColor, string> = {
  default: '',
  red: 'text-red-500',
  orange: 'text-orange-500',
  green: 'text-green-500',
}

export const NOTIFICATION_MARKUP_HELP =
  '**太字**\u3000;;赤字;;\u3000::オレンジ文字::\u3000##緑文字##（組み合わせ可: **;;赤字の太字;;**）\u3000改行もそのまま反映されます'
