/** Whole days between an ISO date string ('YYYY-MM-DD') and today. */
export function daysSince(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const startDay = new Date(y, (m ?? 1) - 1, d ?? 1)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((today.getTime() - startDay.getTime()) / 86_400_000)
}

/** Days since the most recent accident, or null if there is no record at all. */
export function computeStreakDays(occurredDates: string[]): number | null {
  if (occurredDates.length === 0) return null
  const latest = occurredDates.reduce((a, b) => (a > b ? a : b))
  return daysSince(latest)
}
