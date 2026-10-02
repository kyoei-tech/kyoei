'use client'
import { useActionState, useEffect, useState, useTransition } from 'react'
import { VEHICLE_KINDS, vehicleKindLabel } from '@/lib/profile'
import { deleteVehicle, saveVehicle, type VehicleResult } from './actions'

export type VehicleView = {
  id: string
  plate: string
  kind: string
  shakenDue: string | null
  inspection3mDue: string | null
  inspection12mDue: string | null
  note: string
  assignee: string | null
}

function due(iso: string | null) {
  if (!iso) return <span style={{ color: 'var(--muted)' }}>未登録</span>
  const days = Math.floor((new Date(`${iso}T00:00:00+09:00`).getTime() - Date.now()) / 86_400_000)
  const label = new Date(`${iso}T00:00:00+09:00`).toLocaleDateString('ja-JP')
  if (days < 0) return <span className="chip chip-red">{label}（期限切れ）</span>
  if (days <= 30) return <span className="chip chip-orange">{label}（あと{days + 1}日）</span>
  return <span>{label}</span>
}

function VehicleForm({ v, onDone }: { v?: VehicleView; onDone: () => void }) {
  const [state, action, busy] = useActionState(saveVehicle, null as VehicleResult | null)
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])
  return (
    <form action={action} className="card" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) 140px 170px 170px minmax(0,1fr) auto auto', gap: 12, alignItems: 'end' }}>
      {v && <input type="hidden" name="id" value={v.id} />}
      <label className="field">ナンバー<input className="input" name="plate" defaultValue={v?.plate} placeholder="相模 100 あ 12-34" required /></label>
      <label className="field">種類
        <select className="input" name="kind" defaultValue={v?.kind ?? 'truck'}>{VEHICLE_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      </label>
      <label className="field">車検期限<input className="input" type="date" name="shaken_due" defaultValue={v?.shakenDue ?? ''} /></label>
      <label className="field">3ヶ月点検<input className="input" type="date" name="inspection_3m_due" defaultValue={v?.inspection3mDue ?? ''} /></label>
      <label className="field">12ヶ月点検<input className="input" type="date" name="inspection_12m_due" defaultValue={v?.inspection12mDue ?? ''} /></label>
      <label className="field">メモ<input className="input" name="note" defaultValue={v?.note} /></label>
      <button type="submit" className="btn btn-primary" disabled={busy}>保存</button>
      <button type="button" className="btn" onClick={onDone}>やめる</button>
      {state && !state.ok && <div className="error" style={{ gridColumn: '1 / -1' }}>{state.error}</div>}
    </form>
  )
}

export function VehiclesClient({ vehicles }: { vehicles: VehicleView[] }) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  return (
    <>
      <div className="page-header">
        <div>
          <h1>車両</h1>
          <p>トラック（単車）・トレーラーのヘッド・台車を登録し、車検期限・3ヶ月点検・12ヶ月点検の予定日を入力します（都度更新してください）。ドライバーへの割り当ては「アカウント」で行います。入力した期限は、各ドライバーのマイページに表示されます。</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding((x) => !x)}>＋ 車両を追加</button>
      </div>
      {adding && <VehicleForm onDone={() => setAdding(false)} />}
      {error && <div className="notice notice-orange error">{error}</div>}
      <table className="table">
        <thead><tr><th>ナンバー</th><th>種類</th><th>車検期限</th><th>3ヶ月点検</th><th>12ヶ月点検</th><th>担当</th><th /></tr></thead>
        <tbody>
          {vehicles.map((v) =>
            editing === v.id ? (
              <tr key={v.id}><td colSpan={6}><VehicleForm v={v} onDone={() => setEditing(null)} /></td></tr>
            ) : (
              <tr key={v.id}>
                <td className="mono" style={{ fontWeight: 700 }}>{v.plate}{v.note && <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'inherit' }}>{v.note}</div>}</td>
                <td>{vehicleKindLabel(v.kind)}</td>
                <td>{due(v.shakenDue)}</td>
                <td>{due(v.inspection3mDue)}</td>
                <td>{due(v.inspection12mDue)}</td>
                <td>{v.assignee ?? <span style={{ color: 'var(--muted)' }}>未割り当て</span>}<div><a href={`/repairs?plate=${encodeURIComponent(v.plate)}`} style={{ fontSize: 12 }}>修理履歴</a></div></td>
                <td>
                  <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                    <button type="button" className="btn btn-small" onClick={() => setEditing(v.id)}>編集</button>
                    <button
                      type="button"
                      className="btn btn-small btn-danger"
                      onClick={() => confirm(`${v.plate} を削除しますか？`) && startTransition(async () => {
                        const r = await deleteVehicle(v.id, v.plate)
                        setError(r.ok ? null : r.error)
                      })}
                    >
                      削除
                    </button>
                  </div>
                </td>
              </tr>
            ),
          )}
          {vehicles.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>まだ車両が登録されていません</td></tr>}
        </tbody>
      </table>
    </>
  )
}
