'use client'
import Link from 'next/link'
import { useActionState, useEffect, useState, useTransition } from 'react'
import { shiftMonth } from '@/lib/inspection'
import { forceReturn, savePlate, type PlateResult } from './actions'

export type UseView = { id: string; plate: string; user: string; takenAt: string; destination: string; returnedAt: string | null; returnedBy: string; method: string | null }
export type PlateView = { id: string; region: string; number: string; note: string; sortOrder: number; active: boolean; current: UseView | null }

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '')
const METHOD: Record<string, string> = { app: 'アプリ', nfc: '事務所NFC', admin: '管理画面' }

function elapsed(iso: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  return minutes >= 1440 ? `${Math.floor(minutes / 1440)}日${Math.floor((minutes % 1440) / 60)}時間` : `${Math.floor(minutes / 60)}時間${String(minutes % 60).padStart(2, '0')}分`
}

function PlateForm({ plate, nextOrder, onDone }: { plate?: PlateView; nextOrder: number; onDone: () => void }) {
  const [state, action, busy] = useActionState(savePlate, null as PlateResult | null)
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])
  return (
    <form action={action} className="card" style={{ display: 'grid', gridTemplateColumns: '120px 140px minmax(0,1fr) 90px auto auto auto', gap: 12, alignItems: 'end' }}>
      {plate && <input type="hidden" name="id" value={plate.id} />}
      <label className="field">地名<input className="input" name="region" defaultValue={plate?.region ?? '相模'} required /></label>
      <label className="field">番号<input className="input mono" name="number" defaultValue={plate?.number} required /></label>
      <label className="field">メモ<input className="input" name="note" defaultValue={plate?.note} /></label>
      <label className="field">並び順<input className="input" type="number" name="sort_order" defaultValue={plate?.sortOrder ?? nextOrder} /></label>
      <label className="check" style={{ marginBottom: 10 }}><input type="checkbox" name="active" defaultChecked={plate?.active ?? true} />使用中</label>
      <button type="submit" className="btn btn-primary" disabled={busy}>保存</button>
      <button type="button" className="btn" onClick={onDone}>やめる</button>
      {state && !state.ok && <div className="error" style={{ gridColumn: '1 / -1' }}>{state.error}</div>}
    </form>
  )
}

export function RedPlatesClient({ plates, uses, month }: { plates: PlateView[]; uses: UseView[]; month: string }) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const out = plates.filter((p) => p.current)
  const nextOrder = (plates.at(-1)?.sortOrder ?? 0) + 10
  return (
    <>
      <div className="page-header">
        <div>
          <h1>赤枠管理</h1>
          <p>回送運行許可番号標（赤枠）の持ち出し状況と記録です（持ち出し日時・使用者・使用予定地・返却日時）。ドライバーはアプリのマイページ「赤枠管理」から持ち出し・返却します。返却し忘れは「返却処理」で戻せます（変更履歴に残ります）。</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding((x) => !x)}>＋ 赤枠を追加</button>
      </div>
      {adding && <PlateForm nextOrder={nextOrder} onDone={() => setAdding(false)} />}
      {error && <div className="notice notice-orange error">{error}</div>}

      <h2 style={{ margin: '8px 0 10px' }}>持ち出し中 {out.length}枚 ／ 空き {plates.filter((p) => p.active && !p.current).length}枚</h2>
      <table className="table">
        <thead><tr><th>赤枠</th><th>状態</th><th>使用者</th><th>持ち出し日時</th><th>使用予定地</th><th /></tr></thead>
        <tbody>
          {plates.map((p) =>
            editing === p.id ? (
              <tr key={p.id}><td colSpan={6}><PlateForm plate={p} nextOrder={nextOrder} onDone={() => setEditing(null)} /></td></tr>
            ) : (
              <tr key={p.id} style={{ opacity: p.active ? 1 : 0.45 }}>
                <td>
                  <span className="mono" style={{ display: 'inline-block', border: '3px solid #d7262e', borderRadius: 6, padding: '2px 10px', fontWeight: 800, background: '#fff', color: '#000' }}>{p.region} {p.number}</span>
                  {p.note && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{p.note}</div>}
                </td>
                <td>{!p.active ? <span className="chip chip-gray">使用停止</span> : p.current ? <span className="chip chip-red">持ち出し中 {elapsed(p.current.takenAt)}</span> : <span className="chip chip-ink">空き</span>}</td>
                <td style={{ fontWeight: 700 }}>{p.current?.user ?? ''}</td>
                <td className="mono">{when(p.current?.takenAt ?? null)}</td>
                <td>{p.current?.destination ?? ''}</td>
                <td>
                  <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                    {p.current && (
                      <button
                        type="button"
                        className="btn btn-small btn-danger"
                        onClick={() => confirm(`${p.region} ${p.number}（${p.current!.user}）を返却済みにしますか？\n赤枠が事務所に戻っていることを確認してください。`) && startTransition(async () => {
                          const r = await forceReturn(p.current!.id, `${p.region} ${p.number}（${p.current!.user}）`)
                          setError(r.ok ? null : r.error)
                        })}
                      >
                        返却処理
                      </button>
                    )}
                    <button type="button" className="btn btn-small" onClick={() => setEditing(p.id)}>編集</button>
                  </div>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>

      <div className="row" style={{ gap: 10, alignItems: 'center', margin: '28px 0 10px' }}>
        <h2 style={{ margin: 0 }}>持ち出し記録</h2>
        <Link className="btn btn-small" href={`/red-plates?month=${shiftMonth(month, -1)}`}>‹ 前月</Link>
        <b>{month.replace('-', '年')}月</b>
        <Link className="btn btn-small" href={`/red-plates?month=${shiftMonth(month, 1)}`}>翌月 ›</Link>
        <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{uses.length} 件</span>
      </div>
      <table className="table">
        <thead><tr><th>赤枠</th><th>使用者</th><th>持ち出し日時</th><th>使用予定地</th><th>返却日時</th><th>返却</th></tr></thead>
        <tbody>
          {uses.map((u) => (
            <tr key={u.id}>
              <td className="mono" style={{ fontWeight: 700 }}>{u.plate}</td>
              <td>{u.user}</td>
              <td className="mono">{when(u.takenAt)}</td>
              <td>{u.destination}</td>
              <td className="mono">{u.returnedAt ? when(u.returnedAt) : <span className="chip chip-red">未返却</span>}</td>
              <td style={{ fontSize: 12, color: 'var(--muted)' }}>{u.method ? `${METHOD[u.method] ?? u.method}${u.method === 'admin' ? `（${u.returnedBy}）` : ''}` : ''}</td>
            </tr>
          ))}
          {uses.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>この月の持ち出し記録はありません</td></tr>}
        </tbody>
      </table>
    </>
  )
}
