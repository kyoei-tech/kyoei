// 引取不可 helpers (mirrors public.pickup_failures / the iOS PickupFailure.swift).

export const PICKUP_REASONS = [
  ['no_vehicle', '車両が無い'],
  ['no_key', '鍵が無い'],
  ['documents', '書類の不備'],
  ['damaged', '車両の損傷・不動'],
  ['customer', '先方の都合'],
  ['other', 'その他'],
] as const

export function reasonLabel(value: string): string {
  return PICKUP_REASONS.find(([v]) => v === value)?.[1] ?? value
}

export type PickupStatus = 'pending' | 'approved' | 'resolved'

export function pickupStatus(r: { approved_at: string | null; resolved_at: string | null }): PickupStatus {
  if (r.approved_at) return 'approved'
  if (r.resolved_at) return 'resolved'
  return 'pending'
}

export const PICKUP_STATUS_LABEL: Record<PickupStatus, string> = {
  pending: '承認待ち',
  approved: '引取不可（承認済み）',
  resolved: '解決済み（通常どおり輸送）',
}

/** "090-1234-5678" → "09012345678"; "" → null; anything else → undefined (invalid). */
export function normalizePhone(raw: string): string | null | undefined {
  const v = raw.normalize('NFKC').replace(/[\s\-‐ー－()（）]/g, '')
  if (v === '') return null
  return /^\+?[0-9]{3,20}$/.test(v) ? v : undefined
}

/** "09012345678" → "090-1234-5678" for display (mobile / Tokyo landline); others as is. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  if (/^0[789]0\d{8}$/.test(phone)) return `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`
  if (/^0[36]\d{8}$/.test(phone)) return `${phone.slice(0, 2)}-${phone.slice(2, 6)}-${phone.slice(6)}`
  return phone
}

/**
 * File name a photo gets when dragged to the desktop or downloaded:
 * 引取不可_20261003_プリウス_ZVW30-1234567_1.jpg (characters a file system
 * dislikes are replaced).
 */
export function photoFileName(createdAt: string, vehicleName: string, chassis: string, index: number): string {
  const day = new Date(createdAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }).replaceAll('-', '')
  const safe = (s: string) => s.normalize('NFKC').replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
  const parts = ['引取不可', day, safe(vehicleName), safe(chassis), String(index + 1)].filter(Boolean)
  return `${parts.join('_')}.jpg`
}
