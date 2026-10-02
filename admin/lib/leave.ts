// 休暇申請 helpers (mirrors leave_requests / the iOS Leave.swift).

export const CATEGORY_LABEL: Record<string, string> = { personal: '私用', condolence: '慶弔休暇', hospital: '通院', other: 'その他' }

export type LeaveRow = {
  id: string; user_id: string; name: string; filed_on: string; start_on: string; end_on: string; days: number
  category: string; detail: string; paid: boolean; confirmed_at: string | null; confirmed_by_name: string | null
}

export function period(r: Pick<LeaveRow, 'start_on' | 'end_on'>): string {
  const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
  return r.start_on === r.end_on ? md(r.start_on) : `${md(r.start_on)}〜${md(r.end_on)}`
}

export function categoryLabel(r: Pick<LeaveRow, 'category' | 'detail'>): string {
  const base = CATEGORY_LABEL[r.category] ?? r.category
  return r.detail ? `${base}（${r.detail}）` : base
}

/** "" → null (no limit), otherwise a whole number ≥ 0. */
export function limitFrom(raw: string | null): number | null | { error: string } {
  const text = (raw ?? '').trim()
  if (!text) return null
  const n = Number(text)
  return Number.isInteger(n) && n >= 0 && n <= 99 ? n : { error: '人数は0〜99の整数で入力してください（空欄＝上限なし）。' }
}

/** Every date from start to end inclusive (ISO). */
export function daysBetween(start: string, end: string): string[] {
  const out: string[] = []
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`) && out.length < 400; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}
