import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { actionLabel, detailSummary } from '@/lib/labels'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const fmt = (iso: string) => new Date(iso).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })

export default async function HomePage() {
  await requireAdmin()
  const supabase = await createClient()
  const [accounts, pending, customers, numbers, recent, news, staff] = await Promise.all([
    supabase.from('app_accounts').select('user_id, login_id, disabled_at'),
    supabase.rpc('admin_pending_setup_codes'),
    supabase.from('customers').select('id', { count: 'exact', head: true }),
    supabase.from('customer_numbers').select('id', { count: 'exact', head: true }),
    supabase.from('admin_audit_log').select('id, at, actor_label, target, action, detail').order('at', { ascending: false }).limit(6),
    supabase.from('news_posts').select('created_at').order('created_at', { ascending: false }).limit(1),
    supabase.from('staff_members').select('auth_user_id').not('auth_user_id', 'is', null),
  ])
  const rows = accounts.data ?? []
  const { data: users } = await createServiceClient().auth.admin.listUsers({ perPage: 1000 })
  const signedIn = new Set((users?.users ?? []).filter((u) => u.last_sign_in_at).map((u) => u.id))
  const linked = new Set((staff.data ?? []).map((s) => s.auth_user_id as string))
  const active = rows.filter((r) => !r.disabled_at && signedIn.has(r.user_id)).length
  const waiting = rows.filter((r) => !r.disabled_at && !signedIn.has(r.user_id)).length
  const stopped = rows.filter((r) => r.disabled_at).length
  const unlinked = rows.filter((r) => !r.disabled_at && !linked.has(r.user_id))
  const soon = ((pending.data ?? []) as { login_id: string; expires_at: string }[]).filter((p) => new Date(p.expires_at).getTime() - Date.now() < 24 * 3600 * 1000)

  return (
    <>
      <div className="page-header"><div><h1>ホーム</h1><p>アプリの利用状況と、対応が必要なことを確認できます。</p></div></div>
      <div className="grid-4">
        <section className="card"><div className="stat-label">アカウント</div><div className="stat-value">{rows.length}</div><div className="stat-sub">利用中 {active} ・ 設定待ち {waiting} ・ 停止中 {stopped}</div></section>
        <section className="card"><div className="stat-label">有効な招待・再設定コード</div><div className="stat-value">{(pending.data ?? []).length}</div><div className="stat-sub" style={{ color: soon.length ? 'var(--orange)' : undefined }}>24時間以内に期限切れ {soon.length}</div></section>
        <section className="card"><div className="stat-label">POS番号一覧</div><div className="stat-value">{customers.count ?? 0}</div><div className="stat-sub">会員番号 {numbers.count ?? 0} 件</div></section>
        <section className="card"><div className="stat-label">おしらせ</div><div className="stat-value" style={{ fontSize: 20, marginTop: 14 }}>{news.data?.[0] ? fmt(news.data[0].created_at) : '—'}</div><div className="stat-sub">最新の投稿日時</div></section>
      </div>
      <div className="grid-2">
        <section className="card">
          <h2>対応が必要なこと</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {soon.map((p) => (
              <div key={p.login_id + p.expires_at} className="notice notice-orange row" style={{ justifyContent: 'space-between' }}>
                <span><span className="chip chip-orange">期限間近</span>　{p.login_id} のコードが {fmt(p.expires_at)} に切れます</span>
                <Link className="btn btn-small" href="/accounts">再発行</Link>
              </div>
            ))}
            {unlinked.map((r) => (
              <div key={r.user_id} className="notice row" style={{ justifyContent: 'space-between' }}>
                <span><span className="chip chip-gray">未紐付け</span>　{r.login_id} が出勤簿の名前と紐付いていません</span>
                <Link className="btn btn-small" href="/accounts">紐付ける</Link>
              </div>
            ))}
            {soon.length === 0 && unlinked.length === 0 && <div className="notice" style={{ color: 'var(--muted)' }}>いまは対応が必要なことはありません。</div>}
          </div>
        </section>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section className="card">
            <h2>よく使う操作</h2>
            <div className="row">
              <Link className="btn btn-primary" href="/accounts">アカウントを招待</Link>
              <Link className="btn" href="/customers">POS番号一覧を取り込む</Link>
            </div>
          </section>
          <section className="card">
            <h2>最近の変更</h2>
            {(recent.data ?? []).map((e) => (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '110px minmax(0,1fr)', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>{fmt(e.at)}</span>
                <span><b>{e.actor_label.replace(/（.*）$/, '')}</b>　{e.target}：{actionLabel(e.action)} <span style={{ color: 'var(--muted)' }}>{detailSummary(e.action, e.detail ?? {})}</span></span>
              </div>
            ))}
            {(recent.data ?? []).length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>まだ記録がありません</div>}
            <Link href="/history" style={{ display: 'inline-block', marginTop: 10, fontSize: 13, fontWeight: 700 }}>変更履歴をすべて見る ›</Link>
          </section>
        </div>
      </div>
    </>
  )
}
