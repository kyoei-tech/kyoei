'use client'
import Link from 'next/link'
import { useActionState, useState } from 'react'
import { StyledText } from '@/components/StyledText'
import { shiftMonth } from '@/lib/inspection'
import type { AllowanceRow } from '@/lib/review'
import { saveTemplate, type ReviewResult } from '../actions'

type Initial = { purpose_question: string; items: string[]; goal_questions: string[]; reflection_questions: string[]; allowance: AllowanceRow[]; deadline_day: number }

function Field({ name, label, value }: { name: string; label: string; value: string }) {
  const [text, setText] = useState(value)
  return (
    <label className="field">
      {label}
      <input className="input" name={name} value={text} onChange={(e) => setText(e.target.value)} required />
      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 400 }}><StyledText text={text} /></span>
    </label>
  )
}

export function TemplateForm({ month, inheritedFrom, initial }: { month: string; inheritedFrom: string | null; initial: Initial | null }) {
  const [state, action, busy] = useActionState(saveTemplate, null as ReviewResult | null)
  // Stable keys so deleting a row doesn't shift the uncontrolled inputs.
  const [rows, setRows] = useState<(AllowanceRow & { key: number })[]>(() => (initial?.allowance ?? []).map((r, i) => ({ ...r, key: i })))
  const title = `${Number(month.slice(0, 4))}年${Number(month.slice(5))}月分`
  return (
    <>
      <div className="page-header">
        <div>
          <h1>シートの項目：{title}</h1>
          <p>
            ドライバーが{Number(shiftMonth(month, 1).slice(5))}月に提出する{title}のシートの内容です。
            {inheritedFrom ? `いまは${inheritedFrom.replace('-', '年')}月の内容を引き継いでいます。保存すると、この月の内容として登録されます。` : 'この月の内容として登録済みです。'}
            文字の強調：**太字**　;;赤字;;
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn btn-small" href={`/self-review/template?month=${shiftMonth(month, -1)}`}>‹ 前月</Link>
          <Link className="btn btn-small" href={`/self-review/template?month=${shiftMonth(month, 1)}`}>翌月 ›</Link>
          <Link className="btn" href={`/self-review?month=${month}`}>シート一覧へ</Link>
        </div>
      </div>
      <form action={action} style={{ display: 'grid', gap: 16 }}>
        <input type="hidden" name="period" value={`${month}-01`} />
        <div className="card" style={{ display: 'grid', gap: 12 }}>
          <label className="field" style={{ maxWidth: 200 }}>提出期限（翌月の何日まで）<input className="input" type="number" min={1} max={28} name="deadline_day" defaultValue={initial?.deadline_day ?? 15} /></label>
          <Field name="purpose_question" label="項目0（記述）" value={initial?.purpose_question ?? ''} />
          {Array.from({ length: 10 }, (_, i) => <Field key={i} name={`item_${i}`} label={`項目${i + 1}（◎3 ○2 △1 ×0）`} value={initial?.items[i] ?? ''} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card" style={{ display: 'grid', gap: 10 }}>
            <b>目標の質問（翌月）</b>
            {Array.from({ length: 4 }, (_, i) => <Field key={i} name={`goal_${i}`} label={`${i + 1}.`} value={initial?.goal_questions[i] ?? ''} />)}
          </div>
          <div className="card" style={{ display: 'grid', gap: 10 }}>
            <b>反省や良かった事の質問</b>
            {Array.from({ length: 4 }, (_, i) => <Field key={i} name={`reflection_${i}`} label={`${i + 1}.`} value={initial?.reflection_questions[i] ?? ''} />)}
          </div>
        </div>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <b>プロドライバー手当（合計点 → 金額）</b>
            <button type="button" className="btn btn-small" onClick={() => setRows((r) => [...r, { min: 0, max: 0, amount: 0, key: Math.max(0, ...r.map((x) => x.key)) + 1 }])}>＋ 行を追加</button>
          </div>
          <table className="table" style={{ marginTop: 10 }}>
            <thead><tr><th>点数（から）</th><th>点数（まで）</th><th>金額（円）</th><th /></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key}>
                  <td><input className="input" type="number" name={`a_min_${i}`} defaultValue={r.min} min={0} max={90} /></td>
                  <td><input className="input" type="number" name={`a_max_${i}`} defaultValue={r.max} min={0} max={90} /></td>
                  <td><input className="input" type="number" name={`a_amount_${i}`} defaultValue={r.amount} min={0} step={500} /></td>
                  <td><button type="button" className="btn btn-small btn-danger" onClick={() => setRows((all) => all.filter((_, j) => j !== i))}>削除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>0〜90点のすべてが、どれか1行に入るようにしてください。</p>
        </div>
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <button type="submit" className="btn btn-primary" disabled={busy}>{title}の内容として保存</button>
          {state?.ok && <span style={{ color: 'var(--muted)' }}>保存しました。</span>}
          {state && !state.ok && <span className="error">{state.error}</span>}
        </div>
      </form>
    </>
  )
}
