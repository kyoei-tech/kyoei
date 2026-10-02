import Link from 'next/link'
import { StyledText } from '@/components/StyledText'
import { requireAdmin } from '@/lib/auth'
import { monthRange, shiftMonth } from '@/lib/inspection'
import { vehicleClassLabel } from '@/lib/profile'
import { markOf, periodFrom, sum } from '@/lib/review'
import { createClient } from '@/lib/supabase/server'
import { ExcuseToggle, ScoreForm } from './ReviewClient'

type Row = {
  user_id: string; login_id: string; name: string; vehicle_class: string | null; supervisor_id: string | null; supervisor_name: string | null
  review_id: string | null; submitted_at: string | null; purpose: string | null
  self_scores: number[] | null; supervisor_scores: number[] | null; supervisor_scored_by: string | null
  president_scores: number[] | null; president_scored_by: string | null
  goals: string[] | null; reflections: string[] | null; missing_inspection_days: string[]; inspection_excused: boolean
  result: { status: 'pending' | 'excluded' | 'final'; total?: number; allowance?: number }
}
type Template = { purpose_question: string; items: string[]; goal_questions: string[]; reflection_questions: string[]; deadline_day: number; period: string }

const yen = (n?: number | null) => (n == null ? '－' : `${n.toLocaleString('ja-JP')}円`)
const mmdd = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`

function ResultCell({ r }: { r: Row }) {
  if (r.result.status === 'final') return <><b style={{ fontSize: 17 }}>{r.result.total}点</b><div style={{ fontSize: 12 }}>{yen(r.result.allowance)}</div></>
  if (r.result.status === 'excluded') return <span className="chip chip-red">点検未提出のため計算なし</span>
  return <span style={{ color: 'var(--muted)' }}>採点待ち</span>
}

/** 自己評価・目標設定シート: everyone's sheet for a month, details, 社長採点. */
export default async function SelfReviewPage({ searchParams }: { searchParams: Promise<{ month?: string; user?: string }> }) {
  const admin = await requireAdmin()
  const params = await searchParams
  const current = shiftMonth(monthRange(undefined).month, -1)
  const month = periodFrom(params.month) ? params.month! : current
  const period = `${month}-01`
  const supabase = await createClient()
  const [{ data: rows }, { data: templates }, { data: me }, { data: window }] = await Promise.all([
    supabase.rpc('admin_self_reviews', { p_period: period }),
    supabase.from('self_review_templates').select('period, purpose_question, items, goal_questions, reflection_questions, deadline_day').lte('period', period).order('period', { ascending: false }).limit(1),
    supabase.from('account_profiles').select('position_id').eq('user_id', admin.userId).maybeSingle(),
    supabase.rpc('self_review_window'),
  ])
  const open = (window as { period: string; is_open: boolean }[] | null)?.[0]
  const supervisorOpen = open?.period === period && open.is_open
  const list = (rows ?? []) as Row[]
  const template = (templates?.[0] ?? null) as Template | null
  const isPresident = me?.position_id === 'president'
  const selected = list.find((r) => r.user_id === params.user)
  const link = (m: string, user?: string) => `/self-review?month=${m}${user ? `&user=${user}` : ''}`
  const nextMonth = shiftMonth(month, 1)

  return (
    <>
      <div className="page-header">
        <div>
          <h1>自己評価・目標設定シート</h1>
          <p>ドライバーが毎月1日〜{template?.deadline_day ?? 15}日に先月分を提出し、同じ期限までに上長が採点します（アプリでも、ここからでも入力できます）。社長採点はここから入力します（役職が「社長」のアカウントのみ）。自己・上長・社長の合計点（最大90点）からプロドライバー手当を計算します。ドライバーに見えるのは合計点と手当額だけです。</p>
        </div>
        <Link href={`/self-review/template?month=${month}`} className="btn">この月の項目・手当表を編集</Link>
      </div>
      <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <Link className="btn btn-small" href={link(shiftMonth(month, -1))}>‹ 前月</Link>
        <b style={{ fontSize: 18 }}>{Number(month.slice(5))}月分（{Number(nextMonth.slice(5))}月{template?.deadline_day ?? 15}日まで）</b>
        <Link className="btn btn-small" href={link(nextMonth)}>翌月 ›</Link>
        <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>提出 {list.filter((r) => r.submitted_at).length} / {list.length}人</span>
      </div>

      {!selected && (
        <table className="table">
          <thead><tr><th>名前</th><th>車格</th><th>上長</th><th>提出</th><th style={{ textAlign: 'right' }}>自己</th><th style={{ textAlign: 'right' }}>上長</th><th style={{ textAlign: 'right' }}>社長</th><th>未点検の出勤日</th><th>合計・手当</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.user_id}>
                <td><Link href={link(month, r.user_id)} style={{ fontWeight: 700 }}>{r.name}</Link><div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.login_id}</div></td>
                <td style={{ fontSize: 13 }}>{vehicleClassLabel(r.vehicle_class)}</td>
                <td style={{ fontSize: 13 }}>{r.supervisor_name ?? <span className="chip chip-orange">未設定</span>}</td>
                <td>{r.submitted_at ? <span className="chip chip-ink">提出済み</span> : <span className="chip chip-gray">未提出</span>}</td>
                <td style={{ textAlign: 'right' }}>{sum(r.self_scores) ?? '－'}</td>
                <td style={{ textAlign: 'right' }}>{sum(r.supervisor_scores) ?? '－'}</td>
                <td style={{ textAlign: 'right' }}>{sum(r.president_scores) ?? '－'}</td>
                <td style={{ fontSize: 12 }}>{r.missing_inspection_days.length ? <span style={{ color: '#b0161e' }}>{r.missing_inspection_days.map(mmdd).join('、')}{r.inspection_excused ? '（計算対象に戻し済み）' : ''}</span> : '－'}</td>
                <td><ResultCell r={r} /></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>対象のドライバーがいません</td></tr>}
          </tbody>
        </table>
      )}

      {selected && template && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            <Link className="btn btn-small" href={link(month)}>‹ 一覧へ</Link>
            <h2 style={{ margin: 0 }}>{selected.name}（{vehicleClassLabel(selected.vehicle_class)}）</h2>
            <span style={{ color: 'var(--muted)' }}>上長：{selected.supervisor_name ?? '未設定'}</span>
            <span style={{ marginLeft: 'auto' }}><ResultCell r={selected} /></span>
          </div>
          {selected.missing_inspection_days.length > 0 && (
            <div className="notice notice-orange">
              日常点検の記録がない出勤日：{selected.missing_inspection_days.map(mmdd).join('、')}（提出時点の記録）
              <ExcuseToggle user={selected.user_id} period={period} excused={selected.inspection_excused} />
            </div>
          )}
          <div className="card">
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>項目0　<StyledText text={template.purpose_question} /></div>
            <div style={{ fontSize: 16, marginTop: 6, whiteSpace: 'pre-wrap' }}>{selected.purpose || <span style={{ color: 'var(--muted)' }}>（未提出）</span>}</div>
          </div>
          <table className="table">
            <thead><tr><th style={{ width: 60 }}></th><th>チェック項目</th><th style={{ textAlign: 'center' }}>自己</th><th style={{ textAlign: 'center' }}>上長</th><th style={{ textAlign: 'center' }}>社長</th></tr></thead>
            <tbody>
              {template.items.map((item, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--muted)' }}>項目{i + 1}</td>
                  <td><StyledText text={item} /></td>
                  <td style={{ textAlign: 'center', fontWeight: 800 }}>{markOf(selected.self_scores?.[i])}</td>
                  <td style={{ textAlign: 'center', fontWeight: 800 }}>{markOf(selected.supervisor_scores?.[i])}</td>
                  <td style={{ textAlign: 'center', fontWeight: 800 }}>{markOf(selected.president_scores?.[i])}</td>
                </tr>
              ))}
              <tr>
                <td /><td style={{ textAlign: 'right', fontWeight: 700 }}>小計</td>
                <td style={{ textAlign: 'center', fontWeight: 800 }}>{sum(selected.self_scores) ?? '－'}</td>
                <td style={{ textAlign: 'center', fontWeight: 800 }}>{sum(selected.supervisor_scores) ?? '－'}<div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{selected.supervisor_scored_by}</div></td>
                <td style={{ textAlign: 'center', fontWeight: 800 }}>{sum(selected.president_scores) ?? '－'}<div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{selected.president_scored_by}</div></td>
              </tr>
            </tbody>
          </table>
          <ScoreForm
            kind="supervisor" user={selected.user_id} period={period} items={template.items} initial={selected.supervisor_scores}
            reference={[['自己', selected.self_scores], ['社長', selected.president_scores]]}
            allowed={selected.supervisor_id === admin.userId} closed={!supervisorOpen}
            notAllowed={`上長採点は、この人の上長（${selected.supervisor_name ?? '未設定'}）のアカウントで入力できます（アプリでも入力できます）。`}
          />
          <ScoreForm
            kind="president" user={selected.user_id} period={period} items={template.items} initial={selected.president_scores}
            reference={[['自己', selected.self_scores], ['上長', selected.supervisor_scores]]}
            allowed={isPresident} notAllowed="社長採点は、役職が「社長」のアカウントでログインしたときに入力できます。"
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[['目標（翌月）', template.goal_questions, selected.goals], ['反省や良かった事', template.reflection_questions, selected.reflections]].map(([title, questions, answers]) => (
              <div key={String(title)} className="card">
                <b>{String(title)}</b>
                {(questions as string[]).map((q, i) => (
                  <div key={i} style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{i + 1}. <StyledText text={q} /></div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{(answers as string[] | null)?.[i] || <span style={{ color: 'var(--muted)' }}>（未記入）</span>}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
