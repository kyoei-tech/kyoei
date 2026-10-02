'use client'
import { useActionState, useState, useTransition } from 'react'
import { addPaidEntry, confirmLeave, deleteDayLimit, deletePaidEntry, grantException, saveDayLimit, saveSettings, type LeaveResult } from './actions'

function Status({ state, okText }: { state: LeaveResult | null; okText: string }) {
  if (!state) return null
  return state.ok ? <span style={{ color: 'var(--muted)' }}>{okText}</span> : <span className="error">{state.error}</span>
}

export function SettingsForm({ noticeDays, defaultLimit }: { noticeDays: number; defaultLimit: number | null }) {
  const [state, action, busy] = useActionState(saveSettings, null as LeaveResult | null)
  return (
    <form action={action} className="card" style={{ display: 'grid', gap: 10 }}>
      <b>締切と普段の上限</b>
      <label className="field">何日前まで申請できるか<input className="input" type="number" name="notice_days" min={0} max={60} defaultValue={noticeDays} /></label>
      <label className="field">1日に休める人数（普段）<input className="input" type="number" name="default_daily_limit" min={0} max={99} defaultValue={defaultLimit ?? ''} placeholder="空欄＝上限なし" /></label>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <button className="btn btn-primary" disabled={busy}>保存</button>
        <Status state={state} okText="保存しました。" />
      </div>
    </form>
  )
}

export function DayLimitForm() {
  const [state, action, busy] = useActionState(saveDayLimit, null as LeaveResult | null)
  return (
    <form action={action} className="row" style={{ gap: 8, alignItems: 'end', flexWrap: 'wrap', marginTop: 8 }}>
      <label className="field">日付<input className="input" type="date" name="day" required /></label>
      <label className="field" style={{ width: 90 }}>人数<input className="input" type="number" name="max_people" min={0} max={99} required /></label>
      <label className="field" style={{ flex: 1 }}>メモ<input className="input" name="note" placeholder="例：繁忙期" /></label>
      <button className="btn btn-primary" disabled={busy}>設定</button>
      <Status state={state} okText="設定しました。" />
    </form>
  )
}

export function DeleteDayLimit({ day }: { day: string }) {
  const [pending, start] = useTransition()
  return <button type="button" className="btn btn-small" disabled={pending} onClick={() => start(async () => { await deleteDayLimit(day) })}>解除</button>
}

export function ConfirmButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <span>
      <button type="button" className="btn btn-small btn-primary" disabled={pending}
        onClick={() => confirm(`${name}さんの休暇を確認しますか？`) && start(async () => { const r = await confirmLeave(id); setError(r.ok ? null : r.error) })}>確認する</button>
      {error && <div className="error">{error}</div>}
    </span>
  )
}

export function ExceptionForm({ people }: { people: { user_id: string; name: string }[] }) {
  const [state, action, busy] = useActionState(grantException, null as LeaveResult | null)
  return (
    <form action={action} style={{ display: 'grid', gap: 8, marginTop: 8 }}>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>相談して休めると判断した日は、1週間を切っていても、上限に達していても、本人がアプリから申請できるようになります。</p>
      <select className="input" name="user" required defaultValue="">
        <option value="" disabled>誰に</option>
        {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
      </select>
      <div className="row" style={{ gap: 8 }}>
        <label className="field">から<input className="input" type="date" name="start" required /></label>
        <label className="field">まで<input className="input" type="date" name="end" required /></label>
      </div>
      <input className="input" name="note" placeholder="メモ（例：電話で相談済み）" />
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <button className="btn btn-primary" disabled={busy}>申請を許可する</button>
        <Status state={state} okText="許可しました。本人に申請してもらってください。" />
      </div>
    </form>
  )
}

export function PaidEntryForm({ user, name }: { user: string; name: string }) {
  const [state, action, busy] = useActionState(addPaidEntry, null as LeaveResult | null)
  return (
    <form action={action} className="card" style={{ display: 'grid', gap: 8 }}>
      <input type="hidden" name="user" value={user} />
      <input type="hidden" name="name" value={name} />
      <b>手入力で追加</b>
      <div className="row" style={{ gap: 14 }}>
        <label className="check"><input type="radio" name="kind" value="grant" defaultChecked />付与（2年で期限切れ）</label>
        <label className="check"><input type="radio" name="kind" value="use" />取得（アプリ外）</label>
      </div>
      <div className="row" style={{ gap: 8, alignItems: 'end' }}>
        <label className="field">日付<input className="input" type="date" name="on" required /></label>
        <label className="field" style={{ width: 90 }}>日数<input className="input" type="number" name="days" min={1} max={40} required /></label>
        <label className="field" style={{ flex: 1 }}>メモ<input className="input" name="note" placeholder="例：アルバイト比例付与／導入前の取得分" /></label>
      </div>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <button className="btn btn-primary" disabled={busy}>追加</button>
        <Status state={state} okText="追加しました。" />
      </div>
    </form>
  )
}

export function DeletePaidEntry({ kind, id }: { kind: 'grant' | 'use'; id: string }) {
  const [pending, start] = useTransition()
  return <button type="button" className="btn btn-small btn-danger" disabled={pending} onClick={() => confirm('この記録を削除しますか？') && start(async () => { await deletePaidEntry(kind, id) })}>削除</button>
}
