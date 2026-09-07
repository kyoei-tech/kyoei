const WEEKDAYS_JP = ['日', '月', '火', '水', '木', '金', '土'] as const

export function isSaturday(date: Date): boolean {
  return date.getDay() === 6
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export type ClockParts = {
  date: string
  weekday: string
  time: string
}

export type ClockFormat = { hour12?: boolean; seconds?: boolean }

/** e.g. { date: "2026年9月7日", weekday: "月曜日", time: "14:23" } */
export function formatClock(date: Date, opts: ClockFormat = {}): ClockParts {
  const { hour12 = false, seconds = true } = opts

  let hour = date.getHours()
  let meridiem = ''
  if (hour12) {
    meridiem = hour < 12 ? '午前' : '午後'
    hour = hour % 12
    if (hour === 0) hour = 12
  }

  const hourStr = hour12 ? String(hour) : pad2(hour)
  let time = `${hourStr}:${pad2(date.getMinutes())}`
  if (seconds) time += `:${pad2(date.getSeconds())}`
  if (hour12) time = `${meridiem}${time}`

  return {
    date: `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`,
    weekday: `${WEEKDAYS_JP[date.getDay()]}曜日`,
    time,
  }
}

/** Formats a duration in ms as HH:MM:SS (hours can exceed 24, clamped at 0). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3600 * 1000)
}
