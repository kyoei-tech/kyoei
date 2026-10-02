// 車両管理（点検・車検の予約）・健康診断・社員カレンダー helpers.

export const SCHEDULE_KINDS = [
  ['inspection_3m', '3ヶ月点検'],
  ['inspection_12m', '12ヶ月点検'],
  ['shaken', '車検'],
] as const

export type ScheduleKind = (typeof SCHEDULE_KINDS)[number][0]

export function scheduleKindLabel(kind: string): string {
  return SCHEDULE_KINDS.find(([k]) => k === kind)?.[1] ?? kind
}

export type ScheduleRow = {
  id: string; vehicle_id: string; kind: string; scheduled_on: string; scheduled_time: string
  place: string; handover: string; vendor: string; notes: string; completed_at: string | null
}

/** "共栄持込" / "日野自動車引取". */
export function handoverLabel(r: Pick<ScheduleRow, 'handover' | 'vendor'>): string {
  return r.handover === 'pickup' ? `${r.vendor}引取` : '共栄持込'
}

/** "10/20(月) 9:30". */
export function whenLabel(on: string, time?: string): string {
  const d = new Date(`${on}T00:00:00Z`)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${'日月火水木金土'[d.getUTCDay()]})${time ? ` ${time}` : ''}`
}

const TIME = /^\d{1,2}:\d{2}$/

/** Reservation form → row, or a Japanese error. */
export function scheduleFromForm(get: (key: string) => string | null):
  | { row: { kind: string; scheduled_on: string; scheduled_time: string; place: string; handover: string; vendor: string; notes: string } }
  | { error: string } {
  const kind = get('kind') ?? ''
  const on = (get('scheduled_on') ?? '').trim()
  const time = (get('scheduled_time') ?? '').trim()
  const handover = get('handover') === 'pickup' ? 'pickup' : 'bring'
  const vendor = (get('vendor') ?? '').trim()
  if (!SCHEDULE_KINDS.some(([k]) => k === kind)) return { error: '種類を選んでください。' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) return { error: '予約日を入力してください。' }
  if (time && !TIME.test(time)) return { error: '時間は「9:30」のように入力してください。' }
  if (handover === 'pickup' && !vendor) return { error: '引取の業者名を入力してください。' }
  return { row: { kind, scheduled_on: on, scheduled_time: time, place: (get('place') ?? '').trim(), handover, vendor: handover === 'pickup' ? vendor : '', notes: (get('notes') ?? '').trim() } }
}

export function healthFromForm(get: (key: string) => string | null):
  | { row: { scheduled_on: string; scheduled_time: string; place: string; notes: string } }
  | { error: string } {
  const on = (get('scheduled_on') ?? '').trim()
  const time = (get('scheduled_time') ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) return { error: '予約日を入力してください。' }
  if (time && !TIME.test(time)) return { error: '時間は「9:30」のように入力してください。' }
  return { row: { scheduled_on: on, scheduled_time: time, place: (get('place') ?? '').trim(), notes: (get('notes') ?? '').trim() } }
}

export type HealthStatus = 'scheduled' | 'done' | 'due' | 'none'

/**
 * 健康診断の状態: 予約済み (an open reservation), 受診済み (within the
 * period: 12 months, or 6 for 年2回), 未予約 (period over or never).
 */
export function healthStatus(perYear: number, lastCompleted: string | null, hasOpenReservation: boolean, today: string): HealthStatus {
  if (hasOpenReservation) return 'scheduled'
  if (!lastCompleted) return 'none'
  const next = new Date(`${lastCompleted}T00:00:00Z`)
  next.setUTCMonth(next.getUTCMonth() + (perYear === 2 ? 6 : 12))
  return next.toISOString().slice(0, 10) > today ? 'done' : 'due'
}

export const HEALTH_LABEL: Record<HealthStatus, string> = { scheduled: '予約済み', done: '受診済み', due: '未予約（受診時期）', none: '未予約' }

/** One thing on the 社員管理 calendar. */
export type CalendarEvent = { day: string; kind: 'trip' | 'inspection' | 'leave' | 'repair' | 'vehicle' | 'health'; label: string; id?: string }

export const EVENT_STYLE: Record<CalendarEvent['kind'], { label: string; color: string }> = {
  trip: { label: '出勤', color: '#0b7a0b' },
  inspection: { label: '日常点検', color: '#2563eb' },
  leave: { label: '休暇', color: '#c37000' },
  repair: { label: '修理', color: '#d7262e' },
  vehicle: { label: '点検・車検', color: '#7c3aed' },
  health: { label: '健康診断', color: '#0891b2' },
}

/** JST date of a timestamp. */
export function jstDay(iso: string): string {
  return new Date(Date.parse(iso) + 9 * 3600_000).toISOString().slice(0, 10)
}

/** Month grid (weeks of 7, Sunday first, null outside the month). */
export function monthGrid(month: string): (string | null)[][] {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1))
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells: (string | null)[] = Array(first.getUTCDay()).fill(null)
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`)
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7))
}
