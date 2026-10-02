import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { formatPhone, photoFileName, PICKUP_STATUS_LABEL, pickupStatus, reasonLabel } from '@/lib/pickup'
import { createClient } from '@/lib/supabase/server'
import { DraggablePhotos } from './DraggablePhotos'

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const CHIP = { pending: 'chip-orange', approved: 'chip-red', resolved: 'chip-ink' } as const

/** One 引取不可: the car, 理由・詳細, photos (drag to the desktop to save) and who approved / resolved. */
export default async function PickupFailurePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const supabase = await createClient()
  const { data: allowed } = await supabase.rpc('kyoei_can_view_pickup')
  if (allowed !== true) notFound()
  const { data: r } = await supabase.from('pickup_failures').select('*').eq('id', id).maybeSingle()
  if (!r) notFound()
  const ids = [r.user_id, r.approver_id, r.approved_by, r.approver_resolved_by].filter(Boolean) as string[]
  const [{ data: profiles }, { data: accounts }] = await Promise.all([
    supabase.from('account_profiles').select('user_id, full_name, phone').in('user_id', ids),
    supabase.from('app_accounts').select('user_id, login_id').in('user_id', ids),
  ])
  const name = (u: string | null) => (u ? profiles?.find((p) => p.user_id === u)?.full_name || accounts?.find((a) => a.user_id === u)?.login_id || '不明' : '')
  const phone = (u: string | null) => formatPhone(profiles?.find((p) => p.user_id === u)?.phone)
  const status = pickupStatus(r)
  const photos = (r.photo_paths as string[]).map((_, i) => {
    const fileName = photoFileName(r.created_at, r.vehicle_name, r.chassis_number, i)
    return { fileName, src: `/pickup-failures/photo/${r.id}/${i}/${encodeURIComponent(fileName)}` }
  })
  const field = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--line, #e5e7e3)' }}>
      <span style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</span><span style={{ whiteSpace: 'pre-wrap' }}>{value}</span>
    </div>
  )
  return (
    <>
      <div className="page-header">
        <div>
          <h1>引取不可：{r.vehicle_name || '（品名なし）'}</h1>
          <p><span className={`chip ${CHIP[status]}`}>{PICKUP_STATUS_LABEL[status]}</span></p>
        </div>
        <Link className="btn" href="/pickup-failures">一覧へ</Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)', gap: 18, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>車両</h2>
            {field('車名', r.vehicle_name || '－')}
            {field('車台番号', <span className="mono">{r.chassis_number || '－'}</span>)}
            {field('積地', `${r.pickup}${r.pickup_ref ? `（${r.pickup_ref}）` : ''}`)}
            {field('降地', `${r.dropoff}${r.dropoff_ref ? `（${r.dropoff_ref}）` : ''}`)}
            {field('積日・卸日', `${r.pickup_date || '－'} ／ ${r.dropoff_date || '－'}`)}
            {field('配車表', `${r.sheet_title || '－'}${r.round ? `・${r.round}回戦` : ''}`)}
          </div>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>申請</h2>
            {field('ドライバー', <>{name(r.user_id)}{phone(r.user_id) && <span className="mono" style={{ color: 'var(--muted)', marginLeft: 8 }}>{phone(r.user_id)}</span>}</>)}
            {field('申請日時', when(r.created_at))}
            {field('理由', reasonLabel(r.reason))}
            {field('詳細', r.detail || '－')}
          </div>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>承認・解決</h2>
            {field('承認を頼んだ人', <>{name(r.approver_id) || '－'}{phone(r.approver_id) && <span className="mono" style={{ color: 'var(--muted)', marginLeft: 8 }}>{phone(r.approver_id)}</span>}</>)}
            {field('承認', r.approved_at ? `${name(r.approved_by)}（${when(r.approved_at)}）` : '－')}
            {field('ドライバーの解決', r.driver_resolved_at ? when(r.driver_resolved_at) : 'まだ')}
            {field('役職者の解決', r.approver_resolved_at ? `${name(r.approver_resolved_by)}（${when(r.approver_resolved_at)}）` : 'まだ')}
            {field('解決済み', r.resolved_at ? when(r.resolved_at) : '－')}
          </div>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>写真 {photos.length}枚</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>写真をデスクトップやフォルダへドラッグ＆ドロップすると保存できます。「保存」ボタンでもダウンロードできます。</p>
          <DraggablePhotos photos={photos} />
        </div>
      </div>
    </>
  )
}
