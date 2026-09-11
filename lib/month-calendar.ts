// Shared date/grid helpers for month-swipe calendars (e.g. AccidentCalendarView
// and the attendance calendar in trip-history-view.tsx). Extracted so every
// calendar in the app builds its weekly grid and formats dates the same way.

export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export function pad2(n: number) {
  return String(n).padStart(2, '0')
}

export function toISODate(y: number, m: number, d: number) {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`
}

export function monthLabel(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`
}

export function todayISO() {
  const t = new Date()
  return toISODate(t.getFullYear(), t.getMonth(), t.getDate())
}

export function weekdayColor(i: number): string {
  if (i === 0) return 'text-destructive'
  if (i === 6) return 'text-secondary'
  return 'text-foreground'
}

export type MonthCell = { day: number; iso: string }

/** Builds a Sun-start weekly grid (padded with blank cells) for one month. */
export function buildMonthCells(viewMonth: Date): MonthCell[] {
  const y = viewMonth.getFullYear()
  const m = viewMonth.getMonth()
  const firstWeekday = new Date(y, m, 1).getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const list: MonthCell[] = []
  for (let i = 0; i < firstWeekday; i++) list.push({ day: 0, iso: '' })
  for (let d = 1; d <= daysInMonth; d++) {
    list.push({ day: d, iso: toISODate(y, m, d) })
  }
  while (list.length % 7 !== 0) list.push({ day: 0, iso: '' })
  return list
}
