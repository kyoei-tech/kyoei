'use client'
import Link from 'next/link'
import { useActionState, useEffect, useState, useTransition } from 'react'
import { isTrailerClass, VEHICLE_CLASSES, vehicleClassLabel, vehicleKindLabel } from '@/lib/profile'
import { deleteVehicle, saveVehicle, type VehicleResult } from './actions'

export type VehicleView = { id: string; plate: string; kind: string; vehicleClass: string | null; note: string; assignee: string | null }

function VehicleForm({ v, onDone }: { v?: VehicleView; onDone: () => void }) {
  const [state, action, busy] = useActionState(saveVehicle, null as VehicleResult | null)
  const [vehicleClass, setVehicleClass] = useState(v?.vehicleClass ?? '')
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])
  return (
    <form action={action} className="card" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1.3fr) 150px minmax(0,1fr) auto auto', gap: 12, alignItems: 'end' }}>
      {v && <input type="hidden" name="id" value={v.id} />}
      <label className="field">ナンバー<input className="input" name="plate" defaultValue={v?.plate} placeholder="相模 100 あ 12-34" required /></label>
      <label className="field">車格
        <select className="input" name="vehicle_class" value={vehicleClass} onChange={(e) => setVehicleClass(e.target.value)} required>
          <option value="">（選択）</option>
          {VEHICLE_CLASSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      {isTrailerClass(vehicleClass) ? (
        <label className="field">ヘッド／台車
          <select className="input" name="part" defaultValue={v?.kind === 'chassis' ? 'chassis' : v?.kind === 'head' ? 'head' : ''} required>
            <option value="">（選択）</option>
            <option value="head">ヘッド</option>
            <option value="chassis">台車</option>
          </select>
        </label>
      ) : <div className="field" style={{ color: 'var(--muted)' }}>種類<span style={{ height: 40, display: 'flex', alignItems: 'center' }}>単車</span></div>}
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
          <p>車両のナンバーと車格を登録します。トレーラーはヘッドと台車を別々に登録してください。3ヶ月点検・12ヶ月点検・車検の予約は「車両管理」から入力します。ドライバーへの割り当ては「アカウント」で行います。</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn" href="/vehicle-schedules">車両管理へ</Link>
          <button type="button" className="btn btn-primary" onClick={() => setAdding((x) => !x)}>＋ 車両を追加</button>
        </div>
      </div>
      {adding && <VehicleForm onDone={() => setAdding(false)} />}
      {error && <div className="notice notice-orange error">{error}</div>}
      <table className="table">
        <thead><tr><th>ナンバー</th><th>車格</th><th>種類</th><th>担当</th><th /></tr></thead>
        <tbody>
          {vehicles.map((v) =>
            editing === v.id ? (
              <tr key={v.id}><td colSpan={5}><VehicleForm v={v} onDone={() => setEditing(null)} /></td></tr>
            ) : (
              <tr key={v.id}>
                <td className="mono" style={{ fontWeight: 700 }}>{v.plate}{v.note && <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'inherit' }}>{v.note}</div>}</td>
                <td>{v.vehicleClass ? vehicleClassLabel(v.vehicleClass) : <span className="chip chip-orange">未設定</span>}</td>
                <td>{vehicleKindLabel(v.kind)}</td>
                <td>{v.assignee ?? <span style={{ color: 'var(--muted)' }}>未割り当て</span>}<div><a href={`/repairs?plate=${encodeURIComponent(v.plate)}`} style={{ fontSize: 12 }}>修理履歴</a></div></td>
                <td>
                  <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                    <button type="button" className="btn btn-small" onClick={() => setEditing(v.id)}>編集</button>
                    <button
                      type="button"
                      className="btn btn-small btn-danger"
                      onClick={() => confirm(`${v.plate} を削除しますか？（点検・車検の予約も削除されます）`) && startTransition(async () => {
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
          {vehicles.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>まだ車両が登録されていません</td></tr>}
        </tbody>
      </table>
    </>
  )
}
