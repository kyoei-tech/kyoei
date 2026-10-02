'use client'
import { useState, useTransition } from 'react'
import { EVENT_STYLE, monthGrid, type CalendarEvent } from '@/lib/schedule'
import { deleteAllTrips, deleteTrip } from '../actions'

export function EmployeeCalendar({ userId, name, month, events, tripCount }: { userId: string; name: string; month: string; events: CalendarEvent[]; tripCount: number }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
  const byDay = new Map<string, CalendarEvent[]>()
  for (const e of events) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e])
  const dayEvents = selected ? byDay.get(selected) ?? [] : []
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 16, alignItems: 'start' }}>
      <div className="card" style={{ padding: 10 }}>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', fontSize: 12, marginBottom: 8 }}>
          {Object.entries(EVENT_STYLE).map(([k, s]) => <span key={k}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: s.color, marginRight: 4 }} />{s.label}</span>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {'日月火水木金土'.split('').map((w, i) => <div key={w} style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: i === 0 ? '#d7262e' : i === 6 ? '#2563eb' : undefined }}>{w}</div>)}
          {monthGrid(month).flat().map((day, i) => {
            if (!day) return <div key={i} />
            const list = byDay.get(day) ?? []
            return (
              <button key={day} type="button" onClick={() => setSelected(day)}
                style={{ minHeight: 78, textAlign: 'left', padding: 4, borderRadius: 8, cursor: 'pointer', background: selected === day ? '#eaffea' : 'var(--card, #fff)', border: `1.5px solid ${day === today ? '#0b7a0b' : 'var(--line, #e5e7e3)'}` }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{Number(day.slice(8))}</div>
                <div style={{ display: 'grid', gap: 2, marginTop: 2 }}>
                  {Object.keys(EVENT_STYLE).filter((k) => list.some((e) => e.kind === k)).map((k) => (
                    <span key={k} style={{ fontSize: 10, color: '#fff', background: EVENT_STYLE[k as CalendarEvent['kind']].color, borderRadius: 4, padding: '1px 4px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                      {EVENT_STYLE[k as CalendarEvent['kind']].label}{list.filter((e) => e.kind === k).length > 1 ? `×${list.filter((e) => e.kind === k).length}` : ''}
                    </span>
                  ))}
                </div>
              </button>
            )
          })}
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>出勤（運行履歴）は、2026年10月以降にアプリで記録した分から表示されます。</p>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="card">
          <b>{selected ? `${Number(selected.slice(5, 7))}月${Number(selected.slice(8))}日` : '日付を選んでください'}</b>
          {selected && dayEvents.length === 0 && <p style={{ color: 'var(--muted)' }}>予定・記録はありません。</p>}
          {dayEvents.map((e, i) => (
            <div key={i} style={{ borderLeft: `4px solid ${EVENT_STYLE[e.kind].color}`, padding: '4px 8px', marginTop: 8, fontSize: 13 }}>
              <div style={{ fontSize: 11, color: EVENT_STYLE[e.kind].color, fontWeight: 700 }}>{EVENT_STYLE[e.kind].label}</div>
              {e.label}
              {e.kind === 'trip' && e.id && (
                <div><button type="button" className="btn btn-small btn-danger" disabled={pending} style={{ marginTop: 4 }}
                  onClick={() => confirm('この運行履歴を削除しますか？') && start(async () => { const r = await deleteTrip(userId, e.id!, `${name} ${selected}`); setError(r.ok ? null : r.error) })}>この運行履歴を削除</button></div>
              )}
            </div>
          ))}
        </div>
        <div className="card">
          <b>運行履歴の削除（本運用前のテスト用）</b>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>{name}さんの運行履歴は {tripCount}件 あります。テストで記録した分は、本運用の前にここから削除できます（変更履歴に残ります）。</p>
          <button type="button" className="btn btn-small btn-danger" disabled={pending || tripCount === 0}
            onClick={() => confirm(`${name}さんの運行履歴 ${tripCount}件 をすべて削除しますか？元に戻せません。`) && start(async () => { const r = await deleteAllTrips(userId, name); setError(r.ok ? null : r.error) })}>すべて削除</button>
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    </div>
  )
}
