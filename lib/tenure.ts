// Shared by staff-attendance-view.tsx (出勤簿 roster) and mypage-view.tsx
// (試験運転モードのマイページ) so both compute tenure the same way from a
// `staff_members.hire_date` value.

// Full years and months of service as of today, or null if no hire date is
// on record.
export function tenureDuration(
  iso: string | null,
): { years: number; months: number } | null {
  if (!iso) return null
  const hire = new Date(iso)
  if (Number.isNaN(hire.getTime())) return null
  const now = new Date()
  let totalMonths =
    (now.getFullYear() - hire.getFullYear()) * 12 +
    (now.getMonth() - hire.getMonth())
  if (now.getDate() < hire.getDate()) totalMonths -= 1
  totalMonths = Math.max(totalMonths, 0)
  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12 }
}

export function formatTenure(duration: { years: number; months: number }): string {
  return `勤続${duration.years}年${duration.months}ヶ月`
}

// e.g. "2021-04-01" -> "2021年4月1日"
export function formatHireDate(iso: string | null): string | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return null
  return `${y}年${Number(m)}月${Number(d)}日`
}
