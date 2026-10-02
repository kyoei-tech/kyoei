import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { vehicleClassLabel } from '@/lib/profile'
import { destinationLabel, repairStatus, STATUS_LABEL } from '@/lib/repair'
import { createClient } from '@/lib/supabase/server'
import { CompleteForm, DecisionForm } from './RepairForms'

const jp = (iso: string | null) => (iso ? `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日` : '－')
const stampTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

/** One 車両修理依頼書: the driver's report, 社長印 (decision) and 担当印 (整備). */
export default async function RepairPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  const { id } = await params
  const supabase = await createClient()
  const [{ data: r }, { data: me }] = await Promise.all([
    supabase.from('repair_requests').select('*').eq('id', id).maybeSingle(),
    supabase.from('account_profiles').select('position_id').eq('user_id', admin.userId).maybeSingle(),
  ])
  if (!r) notFound()
  const ids = [r.user_id, r.president_stamped_by, r.maintenance_stamped_by].filter(Boolean) as string[]
  const [{ data: profiles }, { data: accounts }] = await Promise.all([
    supabase.from('account_profiles').select('user_id, full_name').in('user_id', ids),
    supabase.from('app_accounts').select('user_id, login_id').in('user_id', ids),
  ])
  const name = (u: string | null) => (u ? profiles?.find((p) => p.user_id === u)?.full_name || accounts?.find((a) => a.user_id === u)?.login_id || '不明' : '')
  const paths = [...(r.photo_paths as string[]), ...(r.slip_paths as string[])]
  const signed = new Map<string, string>()
  if (paths.length) {
    const { data } = await supabase.storage.from('repair-photos').createSignedUrls(paths, 600)
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl)
  }
  const status = repairStatus(r)
  const isPresident = me?.position_id === 'president'
  const isMaintenance = me?.position_id === 'maintenance' || isPresident
  const field = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--line, #e5e7e3)' }}>
      <span style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</span><span style={{ whiteSpace: 'pre-wrap' }}>{value}</span>
    </div>
  )
  const images = (list: string[]) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginTop: 8 }}>
      {list.map((p) => signed.get(p) && (
        <a key={p} href={signed.get(p)} target="_blank" rel="noreferrer">
          {p.endsWith('.pdf') ? <span className="btn btn-small">PDFを開く</span> : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signed.get(p)} alt="写真" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 10 }} />
          )}
        </a>
      ))}
    </div>
  )
  return (
    <>
      <div className="page-header">
        <div>
          <h1>車両修理依頼書</h1>
          <p>{STATUS_LABEL[status]}</p>
        </div>
        <Link className="btn" href="/repairs">一覧へ</Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', gap: 18, alignItems: 'start' }}>
        <div className="card">
          {field('申告日', jp(r.reported_on))}
          {field('運転者氏名', name(r.user_id))}
          {field('車格', vehicleClassLabel(r.vehicle_class))}
          {field('ヘッド車番', <span className="mono">{r.head_plate || '－'}</span>)}
          {r.chassis_plate && field('台車車番', <span className="mono">{r.chassis_plate}</span>)}
          {field('故障個所', r.part === 'chassis' ? '台車' : 'ヘッド')}
          {field('症状・状況', r.symptom)}
          {field('原因', r.cause || '－')}
          {field('修理希望日', jp(r.desired_on))}
          {field('急ぎ具合', r.urgency === 'urgent' ? <span className="chip chip-red">早急に</span> : '出来るだけ早く')}
          {r.inspection_id && field('日常点検', '点検簿の「否」から作成')}
          {(r.photo_paths as string[]).length > 0 && images(r.photo_paths)}
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="row" style={{ gap: 10 }}>
            {[['担当', r.maintenance_stamped_at, r.maintenance_stamped_by], ['社長', r.president_stamped_at, r.president_stamped_by]].map(([label, at, by]) => (
              <div key={label as string} className="card" style={{ flex: 1, textAlign: 'center', padding: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label as string}</div>
                {at ? (
                  <div style={{ border: '2px solid #d7262e', color: '#d7262e', borderRadius: 999, display: 'inline-block', padding: '6px 14px', marginTop: 6, fontWeight: 800 }}>
                    {name(by as string)}<div style={{ fontSize: 11, fontWeight: 600 }}>{stampTime(at as string)}</div>
                  </div>
                ) : <div style={{ color: 'var(--muted)', marginTop: 10 }}>未</div>}
              </div>
            ))}
          </div>
          {status === 'withdrawn' ? (
            <div className="card" style={{ color: 'var(--muted)' }}>この申請は取り下げられました。</div>
          ) : (
            <>
              <div className="card">
                <b>社長の確認（事務所記入欄）</b>
                {r.president_stamped_at && (
                  <div style={{ marginTop: 8 }}>
                    {field('修理依頼先', destinationLabel(r))}
                    {field('修理依頼日', jp(r.requested_on))}
                    {field('入庫予定日', jp(r.entry_on))}
                    {r.president_note && field('メモ', r.president_note)}
                  </div>
                )}
                {isPresident ? (
                  <DecisionForm id={r.id} initial={{ method: r.method, vendor: r.vendor, requestedOn: r.requested_on, entryOn: r.entry_on, note: r.president_note }} stamped={!!r.president_stamped_at} />
                ) : !r.president_stamped_at && <p style={{ color: 'var(--muted)' }}>社長の確認待ちです（役職が「社長」のアカウントで入力できます）。</p>}
              </div>
              <div className="card">
                <b>修理の記録（整備）</b>
                {r.completed_on && (
                  <div style={{ marginTop: 8 }}>
                    {field('修理完了日', jp(r.completed_on))}
                    {field('作業内容', r.work_done || '－')}
                  </div>
                )}
                {(r.slip_paths as string[]).length > 0 && <div style={{ marginTop: 8 }}><span style={{ fontSize: 13, color: 'var(--muted)' }}>伝票</span>{images(r.slip_paths)}</div>}
                {isMaintenance && r.president_stamped_at ? (
                  <CompleteForm id={r.id} initial={{ workDone: r.work_done, completedOn: r.completed_on, slips: r.slip_paths }} />
                ) : !r.completed_on && <p style={{ color: 'var(--muted)' }}>{r.president_stamped_at ? '役職が「整備」のアカウントで入力できます。' : '社長が予定を決めると入力できます。'}</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
