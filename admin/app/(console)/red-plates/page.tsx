import { requireAdmin } from '@/lib/auth'
import { monthRange } from '@/lib/inspection'
import { createClient } from '@/lib/supabase/server'
import { RedPlatesClient, type PlateView, type UseView } from './RedPlatesClient'

/** 赤枠管理: who has which plate now, the 持ち出し記録 by month, and the plate list. */
export default async function RedPlatesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireAdmin()
  const { month, from, to } = monthRange((await searchParams).month)
  const supabase = await createClient()
  const fromJst = `${from}T00:00:00+09:00`
  const toJst = `${to}T00:00:00+09:00`
  const [{ data: plates }, { data: open }, { data: monthUses }, { data: accounts }, { data: profiles }, { data: staff }] = await Promise.all([
    supabase.from('red_plates').select('id, region, number, note, sort_order, active').order('sort_order').order('number'),
    supabase.from('red_plate_uses').select('id, plate_id, user_id, taken_at, destination, returned_at, returned_by, return_method').is('returned_at', null),
    supabase.from('red_plate_uses').select('id, plate_id, user_id, taken_at, destination, returned_at, returned_by, return_method').gte('taken_at', fromJst).lt('taken_at', toJst).order('taken_at', { ascending: false }),
    supabase.from('app_accounts').select('user_id, login_id'),
    supabase.from('account_profiles').select('user_id, full_name'),
    supabase.from('staff_members').select('name, auth_user_id').not('auth_user_id', 'is', null),
  ])
  const name = (id: string | null) => {
    if (!id) return ''
    return profiles?.find((p) => p.user_id === id)?.full_name || staff?.find((s) => s.auth_user_id === id)?.name || accounts?.find((a) => a.user_id === id)?.login_id || '不明'
  }
  const label = new Map((plates ?? []).map((p) => [p.id as string, `${p.region} ${p.number}`]))
  const toView = (u: NonNullable<typeof open>[number]): UseView => ({
    id: u.id, plate: label.get(u.plate_id) ?? '', user: name(u.user_id), takenAt: u.taken_at, destination: u.destination,
    returnedAt: u.returned_at, returnedBy: name(u.returned_by), method: u.return_method,
  })
  const openByPlate = new Map((open ?? []).map((u) => [u.plate_id as string, toView(u)]))
  const views: PlateView[] = (plates ?? []).map((p) => ({ id: p.id, region: p.region, number: p.number, note: p.note, sortOrder: p.sort_order, active: p.active, current: openByPlate.get(p.id) ?? null }))
  return <RedPlatesClient plates={views} uses={(monthUses ?? []).map(toView)} month={month} />
}
