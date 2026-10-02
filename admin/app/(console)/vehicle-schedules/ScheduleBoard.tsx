'use client'
import { Fragment, useActionState, useEffect, useState, useTransition } from 'react'
import { handoverLabel, SCHEDULE_KINDS, scheduleKindLabel, whenLabel, type ScheduleRow } from '@/lib/schedule'
import { completeSchedule, deleteSchedule, saveSchedule, type ScheduleResult } from './actions'

export type VehicleRow = { id: string; plate: string; label: string; assignee: string | null; schedules: ScheduleRow[] }

const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)

function ScheduleForm({ vehicle, kind, row, onDone }: { vehicle: VehicleRow; kind?: string; row?: ScheduleRow; onDone: () => void }) {
  const [state, action, busy] = useActionState(saveSchedule, null as ScheduleResult | null)
  const [handover, setHandover] = useState(row?.handover ?? 'bring')
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])
  return (
    <form action={action} className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10, alignItems: 'end' }}>
      {row && <input type="hidden" name="id" value={row.id} />}
      <input type="hidden" name="vehicle_id" value={vehicle.id} />
      <input type="hidden" name="plate" value={vehicle.plate} />
      <label className="field">種類
        <select className="input" name="kind" defaultValue={row?.kind ?? kind ?? 'inspection_3m'}>{SCHEDULE_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </label>
      <label className="field">予約日<input className="input" type="date" name="scheduled_on" defaultValue={row?.scheduled_on ?? ''} required /></label>
      <label className="field">時間<input className="input" name="scheduled_time" defaultValue={row?.scheduled_time ?? ''} placeholder="例：9:30" /></label>
      <label className="field">場所<input className="input" name="place" defaultValue={row?.place ?? ''} placeholder="例：日野自動車 厚木" /></label>
      <label className="field">入庫
        <select className="input" name="handover" value={handover} onChange={(e) => setHandover(e.target.value)}>
          <option value="bring">共栄持込</option>
          <option value="pickup">業者の引取</option>
        </select>
      </label>
      {handover === 'pickup' && <label className="field">引取の業者名<input className="input" name="vendor" defaultValue={row?.vendor ?? ''} required placeholder="例：東名自動車" /></label>}
      <label className="field" style={{ gridColumn: '1 / -1' }}>特記事項<input className="input" name="notes" defaultValue={row?.notes ?? ''} placeholder="例：前日までに洗車、代車あり" /></label>
      <div className="row" style={{ gridColumn: '1 / -1', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-primary" disabled={busy}>保存</button>
        <button type="button" className="btn" onClick={onDone}>やめる</button>
        {state && !state.ok && <span className="error">{state.error}</span>}
      </div>
    </form>
  )
}

function ScheduleCell({ vehicle, kind, onEdit, onAdd }: { vehicle: VehicleRow; kind: string; onEdit: (row: ScheduleRow) => void; onAdd: () => void }) {
  const open = vehicle.schedules.filter((s) => s.kind === kind && !s.completed_at).sort((a, b) => a.scheduled_on.localeCompare(b.scheduled_on))
  const last = vehicle.schedules.find((s) => s.kind === kind && s.completed_at)
  const [pending, start] = useTransition()
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {open.map((s) => {
        const past = s.scheduled_on < today()
        return (
          <div key={s.id} style={{ border: `1.5px solid ${past ? '#d7262e' : '#7c3aed'}`, borderRadius: 8, padding: '6px 8px', fontSize: 13 }}>
            <b>{whenLabel(s.scheduled_on, s.scheduled_time)}</b>{past && <span className="chip chip-red" style={{ marginLeft: 4 }}>予定日を過ぎています</span>}
            <div>{[s.place, handoverLabel(s)].filter(Boolean).join('・')}</div>
            {s.notes && <div style={{ color: 'var(--muted)' }}>{s.notes}</div>}
            <div className="row" style={{ gap: 4, marginTop: 4 }}>
              <button type="button" className="btn btn-small btn-primary" disabled={pending} onClick={() => start(async () => { await completeSchedule(s.id, `${vehicle.plate} ${scheduleKindLabel(kind)}`, true) })}>完了</button>
              <button type="button" className="btn btn-small" onClick={() => onEdit(s)}>編集</button>
              <button type="button" className="btn btn-small btn-danger" disabled={pending} onClick={() => confirm('この予約を削除しますか？') && start(async () => { await deleteSchedule(s.id, `${vehicle.plate} ${scheduleKindLabel(kind)}`) })}>削除</button>
            </div>
          </div>
        )
      })}
      {open.length === 0 && <span style={{ color: 'var(--muted)', fontSize: 13 }}>予約なし</span>}
      {last && <span style={{ fontSize: 11, color: 'var(--muted)' }}>前回 {whenLabel(last.scheduled_on)} 完了</span>}
      <button type="button" className="btn btn-small" onClick={onAdd}>＋ 予約</button>
    </div>
  )
}

export function ScheduleBoard({ vehicles }: { vehicles: VehicleRow[] }) {
  const [form, setForm] = useState<{ vehicle: string; kind?: string; row?: ScheduleRow } | null>(null)
  const [query, setQuery] = useState('')
  const shown = vehicles.filter((v) => !query.trim() || `${v.plate}${v.assignee ?? ''}${v.label}`.includes(query.trim()))
  return (
    <>
      <input className="input" placeholder="ナンバー・担当・車格で絞り込み" value={query} onChange={(e) => setQuery(e.target.value)} style={{ maxWidth: 320, marginBottom: 10 }} />
      <table className="table">
        <thead><tr><th>車両</th>{SCHEDULE_KINDS.map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
        <tbody>
          {shown.map((v) => (
            <Fragment key={v.id}>
              <tr>
                <td style={{ verticalAlign: 'top' }}>
                  <div className="mono" style={{ fontWeight: 800 }}>{v.plate}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{v.label}</div>
                  <div style={{ fontSize: 12 }}>{v.assignee ?? '未割り当て'}</div>
                </td>
                {SCHEDULE_KINDS.map(([k]) => (
                  <td key={k} style={{ verticalAlign: 'top' }}>
                    <ScheduleCell vehicle={v} kind={k} onEdit={(row) => setForm({ vehicle: v.id, row })} onAdd={() => setForm({ vehicle: v.id, kind: k })} />
                  </td>
                ))}
              </tr>
              {form?.vehicle === v.id && (
                <tr><td colSpan={4}><ScheduleForm vehicle={v} kind={form.kind} row={form.row} onDone={() => setForm(null)} /></td></tr>
              )}
            </Fragment>
          ))}
          {shown.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>車両がありません（「車両」で登録してください）</td></tr>}
        </tbody>
      </table>
    </>
  )
}
