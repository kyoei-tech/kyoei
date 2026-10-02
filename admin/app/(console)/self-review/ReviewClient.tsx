'use client'
import { useActionState, useState, useTransition } from 'react'
import { StyledText } from '@/components/StyledText'
import { MARKS, markOf } from '@/lib/review'
import { excuseInspection, presidentScore, supervisorScore, type ReviewResult } from './actions'

/** 上長採点 or 社長採点 (each shows the other marks for reference). */
export function ScoreForm({ kind, user, period, items, initial, reference, allowed, closed, notAllowed }: {
  kind: 'supervisor' | 'president'; user: string; period: string; items: string[]; initial: number[] | null
  reference: [string, number[] | null][]; allowed: boolean; closed?: boolean; notAllowed: string
}) {
  const [scores, setScores] = useState<(number | null)[]>(() => Array.from({ length: 10 }, (_, i) => initial?.[i] ?? null))
  const [state, action, busy] = useActionState(kind === 'president' ? presidentScore : supervisorScore, null as ReviewResult | null)
  const title = kind === 'president' ? '社長採点' : '上長採点'
  if (!allowed) {
    return <div className="card" style={{ color: 'var(--muted)' }}>{notAllowed}</div>
  }
  if (closed) {
    return <div className="card" style={{ color: 'var(--muted)' }}>{title}の期限を過ぎています。</div>
  }
  return (
    <form action={action} className="card" style={{ display: 'grid', gap: 10 }}>
      <input type="hidden" name="user" value={user} />
      <input type="hidden" name="period" value={period} />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>{title}</b>
        <b>{scores.reduce<number>((n, s) => n + (s ?? 0), 0)} / 30点</b>
      </div>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px minmax(0,1fr) auto auto', gap: 10, alignItems: 'center' }}>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>項目{i + 1}</span>
          <span style={{ fontSize: 14 }}><StyledText text={item} /></span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{reference.map(([label, values]) => `${label} ${markOf(values?.[i])}`).join('・')}</span>
          <span className="row" style={{ gap: 4 }}>
            <input type="hidden" name={`score_${i}`} value={scores[i] ?? ''} />
            {[3, 2, 1, 0].map((p) => (
              <button key={p} type="button" className={`btn btn-small ${scores[i] === p ? 'btn-primary' : ''}`} style={{ minWidth: 44 }}
                onClick={() => setScores((s) => s.map((v, j) => (j === i ? p : v)))}>
                {MARKS[p]} {p}
              </button>
            ))}
          </span>
        </div>
      ))}
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <button type="submit" className="btn btn-primary" disabled={busy || scores.some((s) => s === null)}>{title}を保存</button>
        {state?.ok && <span style={{ color: 'var(--muted)' }}>保存しました。</span>}
        {state && !state.ok && <span className="error">{state.error}</span>}
      </div>
    </form>
  )
}

export function ExcuseToggle({ user, period, excused }: { user: string; period: string; excused: boolean }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <span style={{ marginLeft: 12 }}>
      <button
        type="button"
        className="btn btn-small"
        disabled={pending}
        onClick={() => confirm(excused ? '計算の対象から外しますか？' : '事情を確認したうえで、得点を計算の対象に戻しますか？（変更履歴に残ります）') && startTransition(async () => {
          const r = await excuseInspection(user, period, !excused)
          setError(r.ok ? null : r.error)
        })}
      >
        {excused ? '計算の対象から外す' : '確認済み：計算の対象に戻す'}
      </button>
      {error && <span className="error" style={{ marginLeft: 8 }}>{error}</span>}
    </span>
  )
}
