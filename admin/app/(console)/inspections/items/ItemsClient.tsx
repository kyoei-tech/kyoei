'use client'
import Link from 'next/link'
import { useActionState, useEffect, useState, useTransition } from 'react'
import { FREQUENCIES, frequencyLabel, SCOPES, scopeLabel } from '@/lib/inspection'
import { VEHICLE_CLASSES, vehicleClassLabel } from '@/lib/profile'
import { deleteItem, saveItem, type ItemResult } from './actions'

export type ItemView = { id: string; section: string; label: string; frequency: string; scope: string; classes: string[] | null; sortOrder: number; active: boolean }

function ItemForm({ item, nextOrder, onDone }: { item?: ItemView; nextOrder: number; onDone: () => void }) {
  const [state, action, busy] = useActionState(saveItem, null as ItemResult | null)
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])
  return (
    <form action={action} className="card" style={{ display: 'grid', gridTemplateColumns: '180px minmax(0,1fr) 110px 260px 90px', gap: 12, alignItems: 'end' }}>
      {item && <input type="hidden" name="id" value={item.id} />}
      <label className="field">部位<input className="input" name="section" defaultValue={item?.section} placeholder="例：タイヤ" required /></label>
      <label className="field">点検内容<input className="input" name="label" defaultValue={item?.label} placeholder="例：空気圧が適当である" required /></label>
      <label className="field">頻度
        <select className="input" name="frequency" defaultValue={item?.frequency ?? 'every'}>{FREQUENCIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </label>
      <label className="field">対象
        <select className="input" name="scope" defaultValue={item?.scope ?? 'each_unit'}>{SCOPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </label>
      <label className="field">並び順<input className="input" type="number" name="sort_order" defaultValue={item?.sortOrder ?? nextOrder} /></label>
      <div className="field" style={{ gridColumn: '1 / -1' }}>
        対象の車格（すべて外すと全車格）
        <div className="row" style={{ flexWrap: 'wrap', gap: 14, marginTop: 6 }}>
          {VEHICLE_CLASSES.map(([v, l]) => (
            <label key={v} className="check"><input type="checkbox" name="classes" value={v} defaultChecked={item?.classes?.includes(v) ?? false} />{l}</label>
          ))}
        </div>
      </div>
      <label className="check" style={{ gridColumn: '1 / span 2' }}><input type="checkbox" name="active" defaultChecked={item?.active ?? true} />アプリで使う（外すと一時的に出なくなります）</label>
      <div className="row" style={{ gridColumn: '3 / -1', justifyContent: 'flex-end', gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={busy}>保存</button>
        <button type="button" className="btn" onClick={onDone}>やめる</button>
      </div>
      {state && !state.ok && <div className="error" style={{ gridColumn: '1 / -1' }}>{state.error}</div>}
    </form>
  )
}

export function ItemsClient({ items }: { items: ItemView[] }) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const nextOrder = (items.at(-1)?.sortOrder ?? 0) + 10
  return (
    <>
      <div className="page-header">
        <div>
          <h1>点検項目</h1>
          <p>
            アプリの日常点検で、1項目ずつ表示される内容です。「週1」「月1」の項目は、前回の点検から期間が空いたときだけ出ます（前回「否」の項目は必ず出ます）。
            変更は次の点検から反映されます。過去の記録は、記録したときの文言のまま残ります。
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link href="/inspections" className="btn">点検記録へ</Link>
          <button type="button" className="btn btn-primary" onClick={() => setAdding((x) => !x)}>＋ 項目を追加</button>
        </div>
      </div>
      {adding && <ItemForm nextOrder={nextOrder} onDone={() => setAdding(false)} />}
      {error && <div className="notice notice-orange error">{error}</div>}
      <table className="table">
        <thead><tr><th style={{ width: 60 }}>順</th><th>部位</th><th>点検内容</th><th>頻度</th><th>対象</th><th /></tr></thead>
        <tbody>
          {items.map((item) =>
            editing === item.id ? (
              <tr key={item.id}><td colSpan={6}><ItemForm item={item} nextOrder={nextOrder} onDone={() => setEditing(null)} /></td></tr>
            ) : (
              <tr key={item.id} style={{ opacity: item.active ? 1 : 0.45 }}>
                <td className="mono">{item.sortOrder}</td>
                <td style={{ fontWeight: 700 }}>{item.section}</td>
                <td>{item.label}{!item.active && <span className="chip chip-gray" style={{ marginLeft: 8 }}>使わない</span>}</td>
                <td>{item.frequency === 'every' ? frequencyLabel(item.frequency) : <span className="chip chip-orange">{frequencyLabel(item.frequency)}</span>}</td>
                <td style={{ fontSize: 13 }}>
                  {scopeLabel(item.scope)}
                  {item.classes && <div style={{ color: 'var(--muted)', fontSize: 12 }}>{item.classes.map(vehicleClassLabel).join('・')}のみ</div>}
                </td>
                <td>
                  <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                    <button type="button" className="btn btn-small" onClick={() => setEditing(item.id)}>編集</button>
                    <button
                      type="button"
                      className="btn btn-small btn-danger"
                      onClick={() => confirm(`「${item.label}」を削除しますか？\n（過去の点検記録は残ります）`) && startTransition(async () => {
                        const r = await deleteItem(item.id, `${item.section}：${item.label}`)
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
          {items.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>点検項目がありません</td></tr>}
        </tbody>
      </table>
    </>
  )
}
