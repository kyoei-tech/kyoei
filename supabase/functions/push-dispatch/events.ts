// Turns a database change (as posted by private.dispatch_push_event) into the
// push notification to send, or null when the change isn't push-worthy.
// Pure and runtime-agnostic so it runs under both Deno and Node tests.

export type PushTopic = 'news' | 'staff_status'

export type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  schema: string
  record: Record<string, unknown> | null
  old_record: Record<string, unknown> | null
}

export type PushMessage = {
  topic: PushTopic
  title: string
  body: string
  /** Groups related notifications in Notification Center. */
  threadId: string
  /** Newer notifications with the same id replace older ones on screen. */
  collapseId?: string
  /** Custom keys delivered to the app alongside `aps` (see PushKind in the app). */
  data: Record<string, string>
  /** Devices linked to this staff member are skipped (no self-notification). */
  excludeStaffMemberId?: string
}

// Same wording the web app used for its news notification.
const NEWS_TITLE = 'おしらせ'
const NEWS_FALLBACK_BODY = '新しいおしらせがあります💡'
const MAX_BODY_LENGTH = 180

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

// Strips the bold/red/orange/green styling markers (see StyledText in the app),
// which the app renders but APNs cannot.
export function plainText(raw: string): string {
  return raw.replaceAll('**', '').replaceAll(';;', '').replaceAll('::', '').replaceAll('##', '')
}

function truncate(value: string, max = MAX_BODY_LENGTH): string {
  const chars = [...value]
  return chars.length <= max ? value : `${chars.slice(0, max - 1).join('')}…`
}

export function messageFor(payload: WebhookPayload): PushMessage | null {
  if (payload.schema !== 'public' || !payload.record) return null
  const record = payload.record

  if (payload.table === 'news_posts' && payload.type === 'INSERT') {
    const id = text(record.id)
    const title = plainText(text(record.title))
    return {
      topic: 'news',
      title: NEWS_TITLE,
      body: truncate(title || NEWS_FALLBACK_BODY),
      threadId: 'news',
      data: { kind: 'news', id },
    }
  }

  if (payload.table === 'staff_members' && payload.type === 'UPDATE') {
    const status = text(record.status)
    const previous = text(payload.old_record?.status)
    if (!status || status === previous) return null
    const id = text(record.id)
    const name = text(record.name) || 'スタッフ'
    const label = status === 'working' ? '出勤中' : status === 'off' ? '退勤済み' : null
    if (!label) return null
    return {
      topic: 'staff_status',
      title: '出勤簿',
      body: `${name}さんが${label}になりました`,
      threadId: 'staff_status',
      // Only the latest status per person matters on the lock screen.
      collapseId: `staff-${id}`.slice(0, 64),
      data: { kind: 'staff_status', id },
      excludeStaffMemberId: id || undefined,
    }
  }

  return null
}
