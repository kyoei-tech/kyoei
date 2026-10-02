// 点検簿の選択肢 (mirrors inspection_items / the iOS Inspection.swift).
import { VEHICLE_CLASSES } from './profile.ts'

export const FREQUENCIES = [
  ['every', '毎回'],
  ['weekly', '週1'],
  ['monthly', '月1'],
] as const

export const SCOPES = [
  ['each_unit', '各車両（単車・ヘッドと台車それぞれ）'],
  ['powered', '単車・ヘッドのみ'],
  ['deck', '積載部（単車は車両、トレーラーは台車）'],
  ['coupling', '連結部（トレーラーのみ）'],
  ['once', '1回のみ（非常用具・書類など）'],
] as const

export const INSTRUCTIONS: Record<string, string> = { ok: '運行可', after_repair: '修理後に運行', no_go: '運行不可' }

export const ANSWERS: Record<string, string> = { ok: '可', ng: '否', na: '該当なし' }

export function frequencyLabel(value: string): string {
  return FREQUENCIES.find(([v]) => v === value)?.[1] ?? value
}

export function scopeLabel(value: string): string {
  return SCOPES.find(([v]) => v === value)?.[1] ?? value
}

/** null (= all 車格) when every class or none is ticked. */
export function classesFrom(values: string[]): string[] | null {
  const known = VEHICLE_CLASSES.map(([v]) => v as string)
  const picked = known.filter((v) => values.includes(v))
  return picked.length === 0 || picked.length === known.length ? null : picked
}

export type InspectionItemInput = { section: string; label: string; frequency: string; scope: string; classes: string[] | null; sort_order: number; active: boolean }

/** Validates the item form; returns the row or a Japanese error. */
export function itemFromForm(get: (key: string) => string | null, classes: string[]): InspectionItemInput | { error: string } {
  const section = (get('section') ?? '').trim()
  const label = (get('label') ?? '').trim()
  const frequency = get('frequency') ?? ''
  const scope = get('scope') ?? ''
  const order = Number(get('sort_order') ?? '0')
  if (!section) return { error: '部位を入力してください。' }
  if (!label) return { error: '点検内容を入力してください。' }
  if (!FREQUENCIES.some(([v]) => v === frequency)) return { error: '頻度を選んでください。' }
  if (!SCOPES.some(([v]) => v === scope)) return { error: '対象を選んでください。' }
  if (!Number.isInteger(order)) return { error: '並び順は整数で入力してください。' }
  return { section, label, frequency, scope, classes: classesFrom(classes), sort_order: order, active: get('active') === 'on' }
}

/** Month bounds "2026-10" → ["2026-10-01", "2026-11-01"). */
export function monthRange(month: string | undefined, now = new Date()): { month: string; from: string; to: string } {
  const valid = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 7)
  const [y, m] = valid.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  return { month: valid, from: `${valid}-01`, to: `${next}-01` }
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const index = y * 12 + (m - 1) + delta
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}
