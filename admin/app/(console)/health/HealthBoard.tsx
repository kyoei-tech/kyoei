'use client'
import { Fragment, useActionState, useEffect, useState, useTransition } from 'react'
import { HEALTH_LABEL, whenLabel, type HealthStatus } from '@/lib/schedule'
import { completeHealth, deleteHealth, saveHealth, setPerYear, type HealthResult } from './actions'

type Check = { id: string; scheduled_on: string; scheduled_time: string; place: string; notes: string; completed_on: string | null }
export type HealthPerson = { userId: string; loginId: string; name: string; perYear: number; lastCompleted: string | null; open: Check[]; history: Check[]; status: HealthStatus }

const CHIP: Record<HealthStatus, string> = { scheduled: 'chip-ink', done: 'chip-gray', due: 'chip-red', none: 'chip-orange' }

function HealthForm({ person, row, onDone }: { person: HealthPerson; row?: Check; onDone: () => void }) {
  const [state, action, busy] = useActionState(saveHealth, null as HealthResult | null)
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])
  return (
    <form action={action} className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, alignItems: 'end' }}>
      {row && <input type="hidden" name="id" value={row.id} />}
      <input type="hidden" name="user" value={person.userId} />
      <input type="hidden" name="name" value={person.name} />
      <label className="field">予約日<input className="input" type="date" name="scheduled_on" defaultValue={row?.scheduled_on ?? ''} required /></label>
      <label className="field">時間<input className="input" name="scheduled_time" defaultValue={row?.scheduled_time ?? ''} placeholder="例：9:00" /></label>
      <label className="field">医療機関<input className="input" name="place" defaultValue={row?.place ?? ''} placeholder="例：〇〇クリニック" /></label>
      <label className="field">メモ<input className="input" name="notes" defaultValue={row?.notes ?? ''} placeholder="例：朝食抜き" /></label>
      <div className="row" style={{ gridColumn: '1 / -1', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-primary" disabled={busy}>保存</button>
        <button type="button" className="btn" onClick={onDone}>やめる</button>
        {state && !state.ok && <span className="error">{state.error}</span>}
      </div>
    </form>
  )
}

export function HealthBoard({ people }: { people: HealthPerson[] }) {
  const [form, setForm] = useState<{ user: string; row?: Check } | null>(null)
  const [filter, setFilter] = useState<'all' | 'todo'>('all')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (task: () => Promise<HealthResult>) => start(async () => { const r = await task(); setError(r.ok ? null : r.error) })
  const shown = filter === 'todo' ? people.filter((p) => p.status === 'none' || p.status === 'due') : people
  const count = (s: HealthStatus) => people.filter((p) => p.status === s).length
  return (
    <>
      <div className="row" style={{ gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <button type="button" className={`btn btn-small ${filter === 'all' ? 'btn-primary' : ''}`} onClick={() => setFilter('all')}>全員 {people.length}</button>
        <button type="button" className={`btn btn-small ${filter === 'todo' ? 'btn-primary' : ''}`} onClick={() => setFilter('todo')}>未予約 {count('none') + count('due')}</button>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>予約済み {count('scheduled')} ・ 受診済み {count('done')}</span>
      </div>
      {error && <div className="notice notice-orange error">{error}</div>}
      <table className="table">
        <thead><tr><th>名前</th><th>回数</th><th>状態</th><th>次の予約</th><th>前回の受診</th><th /></tr></thead>
        <tbody>
          {shown.map((p) => (
            <Fragment key={p.userId}>
              <tr>
                <td><b>{p.name}</b><div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.loginId}</div></td>
                <td>
                  <select className="input" value={p.perYear} disabled={pending} style={{ width: 90 }} onChange={(e) => run(() => setPerYear(p.userId, p.name, Number(e.target.value) as 1 | 2))}>
                    <option value={1}>年1回</option>
                    <option value={2}>年2回</option>
                  </select>
                </td>
                <td><span className={`chip ${CHIP[p.status]}`}>{HEALTH_LABEL[p.status]}</span></td>
                <td style={{ fontSize: 13 }}>
                  {p.open.map((c) => (
                    <div key={c.id} style={{ marginBottom: 6 }}>
                      <b>{whenLabel(c.scheduled_on, c.scheduled_time)}</b> {c.place}{c.notes && <span style={{ color: 'var(--muted)' }}>（{c.notes}）</span>}
                      <div className="row" style={{ gap: 4, marginTop: 2 }}>
                        <button type="button" className="btn btn-small btn-primary" disabled={pending}
                          onClick={() => { const on = prompt('受診日（YYYY-MM-DD）', c.scheduled_on); if (on) run(() => completeHealth(c.id, p.name, on)) }}>受診済み</button>
                        <button type="button" className="btn btn-small" onClick={() => setForm({ user: p.userId, row: c })}>編集</button>
                        <button type="button" className="btn btn-small btn-danger" disabled={pending} onClick={() => confirm('この予約を削除しますか？') && run(() => deleteHealth(c.id, p.name))}>削除</button>
                      </div>
                    </div>
                  ))}
                  {p.open.length === 0 && <span style={{ color: 'var(--muted)' }}>なし</span>}
                </td>
                <td className="mono" style={{ fontSize: 13 }}>{p.lastCompleted ?? '－'}</td>
                <td><button type="button" className="btn btn-small" onClick={() => setForm({ user: p.userId })}>＋ 予約</button></td>
              </tr>
              {form?.user === p.userId && <tr><td colSpan={6}><HealthForm person={p} row={form.row} onDone={() => setForm(null)} /></td></tr>}
            </Fragment>
          ))}
        </tbody>
      </table>
    </>
  )
}
