'use client'

import { useMemo, useRef, useState } from 'react'
import {
  Calendar,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { ConfirmDeleteInline } from './confirm-delete'
import { AccidentStreakBadge } from './accident-streak-badge'
import { usePasswordGate } from './password-prompt'
import {
  AccidentCategorySelect,
  useAccidentCategories,
} from './accident-category-select'
import { AccidentYearlyView } from './accident-yearly-view'
import { useSettings } from '@/lib/settings/settings-context'
import { useScrollToTop } from '@/lib/use-scroll-to-top'

// Shared across every browser via the `accident_records` Supabase table.
type AccidentRow = {
  id: string
  occurred_on: string
  vehicle_class: string
  location: string
  description: string
  category: string
}

async function fetchAccidentRows(): Promise<AccidentRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('accident_records')
    .select('id, occurred_on, vehicle_class, location, description, category')
    .order('occurred_on', { ascending: false })
  if (error) throw error
  return (data as AccidentRow[]) ?? []
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function toISODate(y: number, m: number, d: number) {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`
}

function monthLabel(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`
}

function todayISO() {
  const t = new Date()
  return toISODate(t.getFullYear(), t.getMonth(), t.getDate())
}

function weekdayColor(i: number): string {
  if (i === 0) return 'text-destructive'
  if (i === 6) return 'text-secondary'
  return 'text-foreground'
}

function useMonthSwipe(onPrev: () => void, onNext: () => void) {
  const touchX = useRef<number | null>(null)
  return {
    onTouchStart: (e: React.TouchEvent) => {
      touchX.current = e.touches[0].clientX
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (touchX.current == null) return
      const delta = e.changedTouches[0].clientX - touchX.current
      touchX.current = null
      if (delta > 50) onPrev()
      else if (delta < -50) onNext()
    },
  }
}

function MonthNav({
  date,
  onPrev,
  onNext,
}: {
  date: Date
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={onPrev}
        aria-label="前の月"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground active:scale-90"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="text-base font-bold text-foreground">
        {monthLabel(date)}
      </span>
      <button
        type="button"
        onClick={onNext}
        aria-label="次の月"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground active:scale-90"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

function emptyForm() {
  return {
    occurredOn: todayISO(),
    category: '',
    vehicleClass: '',
    location: '',
    description: '',
  }
}

export function AccidentCalendarView() {
  const { partTimeMode } = useSettings()
  const [periodMode, setPeriodMode] = useState<'month' | 'year'>('month')
  const [viewMonth, setViewMonth] = useState(() => {
    const t = new Date()
    return new Date(t.getFullYear(), t.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const [editingNew, setEditingNew] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [showHistory, setShowHistory] = useState(false)
  const [historyMonth, setHistoryMonth] = useState(() => {
    const t = new Date()
    return new Date(t.getFullYear(), t.getMonth(), 1)
  })
  const [historyEditId, setHistoryEditId] = useState<string | null>(null)
  const [historyForm, setHistoryForm] = useState(emptyForm)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const { guard, prompt } = usePasswordGate('2486')
  useScrollToTop([periodMode, showHistory])

  const { data: rows, mutate: refetch } = useRealtimeTable<AccidentRow>(
    'accident_records',
    fetchAccidentRows,
  )
  const { data: categories, mutate: refetchCategories } =
    useAccidentCategories()

  function prevMonth() {
    setSelectedDate(null)
    setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  }
  function nextMonth() {
    setSelectedDate(null)
    setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }
  const calendarSwipe = useMonthSwipe(prevMonth, nextMonth)

  function prevHistoryMonth() {
    setHistoryMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  }
  function nextHistoryMonth() {
    setHistoryMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }
  const historySwipe = useMonthSwipe(prevHistoryMonth, nextHistoryMonth)

  const countsByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of rows) map.set(r.occurred_on, (map.get(r.occurred_on) ?? 0) + 1)
    return map
  }, [rows])

  const cells = useMemo(() => {
    const y = viewMonth.getFullYear()
    const m = viewMonth.getMonth()
    const firstWeekday = new Date(y, m, 1).getDay()
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    const list: { day: number; iso: string }[] = []
    for (let i = 0; i < firstWeekday; i++) list.push({ day: 0, iso: '' })
    for (let d = 1; d <= daysInMonth; d++) list.push({ day: d, iso: toISODate(y, m, d) })
    while (list.length % 7 !== 0) list.push({ day: 0, iso: '' })
    return list
  }, [viewMonth])

  const selectedAccidents = useMemo(
    () => (selectedDate ? rows.filter((r) => r.occurred_on === selectedDate) : []),
    [rows, selectedDate],
  )

  const historyRows = useMemo(() => {
    const y = historyMonth.getFullYear()
    const m = historyMonth.getMonth()
    return rows.filter((r) => {
      const [ry, rm] = r.occurred_on.split('-').map(Number)
      return ry === y && rm === m + 1
    })
  }, [rows, historyMonth])

  function canSaveNewAccident(f: typeof form) {
    // The date input always has a value (defaults to today), so requiring
    // only `occurredOn` let a blank tap on 保存 silently create a phantom
    // record for the current day. Require actual content instead.
    return Boolean(f.occurredOn && (f.vehicleClass.trim() || f.description.trim()))
  }

  async function addAccident() {
    if (!canSaveNewAccident(form) || isSaving) return
    setIsSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('accident_records').insert({
        occurred_on: form.occurredOn,
        category: form.category,
        vehicle_class: form.vehicleClass.trim(),
        location: form.location.trim(),
        description: form.description.trim(),
      })
      if (error) throw error
      setForm(emptyForm())
      await refetch()
    } finally {
      setIsSaving(false)
    }
  }

  function openHistoryEdit(row: AccidentRow) {
    setHistoryEditId(row.id)
    setHistoryForm({
      occurredOn: row.occurred_on,
      category: row.category,
      vehicleClass: row.vehicle_class,
      location: row.location,
      description: row.description,
    })
  }

  async function saveHistoryEdit() {
    if (!historyEditId || !historyForm.occurredOn) return
    const supabase = createClient()
    await supabase
      .from('accident_records')
      .update({
        occurred_on: historyForm.occurredOn,
        category: historyForm.category,
        vehicle_class: historyForm.vehicleClass.trim(),
        location: historyForm.location.trim(),
        description: historyForm.description.trim(),
      })
      .eq('id', historyEditId)
    setHistoryEditId(null)
    await refetch()
  }

  async function deleteAccident(id: string) {
    const supabase = createClient()
    await supabase.from('accident_records').delete().eq('id', id)
    setConfirmDeleteId(null)
    setHistoryEditId(null)
    await refetch()
  }

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">無事故カレンダー</h2>
          <p className="mt-1 text-sm text-muted-foreground">目指せ無事故！</p>
        </div>
        <div className="flex shrink-0 rounded-full border border-border p-0.5">
          <button
            type="button"
            onClick={() => setPeriodMode('month')}
            className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              periodMode === 'month'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            月間
          </button>
          <button
            type="button"
            onClick={() => setPeriodMode('year')}
            className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              periodMode === 'year'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
            年間
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-card px-5 py-5">
        <AccidentStreakBadge size="lg" />
      </section>

      {periodMode === 'year' ? (
        <AccidentYearlyView rows={rows} categories={categories} />
      ) : (
        <>
          <section
            className="rounded-2xl border border-border bg-card p-4"
            onTouchStart={calendarSwipe.onTouchStart}
            onTouchEnd={calendarSwipe.onTouchEnd}
          >
            <MonthNav date={viewMonth} onPrev={prevMonth} onNext={nextMonth} />
            <div className="mt-3 grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map((d, i) => (
                <span
                  key={d}
                  className={`text-xs font-semibold ${weekdayColor(i)}`}
                >
                  {d}
                </span>
              ))}
              {cells.map((cell, idx) => {
                if (!cell.iso) return <span key={`blank-${idx}`} />
                const count = countsByDate.get(cell.iso) ?? 0
                const isSelected = cell.iso === selectedDate
                const weekdayIdx = idx % 7
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() =>
                      setSelectedDate((cur) =>
                        cur === cell.iso ? null : cell.iso,
                      )
                    }
                    className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 transition-colors active:scale-95 ${
                      isSelected
                        ? 'bg-primary/20 ring-1 ring-primary'
                        : 'hover:bg-accent'
                    }`}
                  >
                    <span
                      className={`text-sm font-medium ${weekdayColor(weekdayIdx)}`}
                    >
                      {cell.day}
                    </span>
                    <span
                      className={`text-[0.65rem] font-bold tabular-nums ${
                        count > 0
                          ? 'text-destructive'
                          : 'text-muted-foreground/40'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          {selectedDate && (
            <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card px-5 py-4">
              <h3 className="text-sm font-bold text-foreground">
                {selectedDate} の事故詳細
              </h3>
              {selectedAccidents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  事故はありません。
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {selectedAccidents.map((a) => (
                    <li
                      key={a.id}
                      className="rounded-xl border border-border/60 bg-background px-3 py-2.5"
                    >
                      <div className="flex items-center gap-1.5">
                        {a.category && (
                          <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-foreground">
                            {a.category}
                          </span>
                        )}
                        {a.vehicle_class && (
                          <span className="text-xs font-semibold text-primary">
                            {a.vehicle_class}
                          </span>
                        )}
                      </div>
                      {a.location && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          発生場所：{a.location}
                        </p>
                      )}
                      <p className="mt-0.5 text-sm text-foreground">
                        {a.description || '詳細なし'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      {prompt}

      {!partTimeMode && (
        <button
          type="button"
          onClick={() => {
            if (editingNew) {
              setEditingNew(false)
              setShowHistory(false)
              setForm(emptyForm())
              return
            }
            guard(() => {
              setEditingNew(true)
              setShowHistory(false)
              setForm(emptyForm())
            })
          }}
          className={`flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors active:scale-95 ${
            editingNew
              ? 'bg-primary text-primary-foreground'
              : 'border border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          {editingNew ? (
            <X className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Pencil className="h-4 w-4" aria-hidden="true" />
          )}
          {editingNew ? '編集を終了' : '編集'}
        </button>
      )}

      {editingNew && (
        <>
          <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-5">
            <h3 className="text-sm font-bold text-foreground">事故を記録</h3>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                発生日
              </span>
              <input
                type="date"
                value={form.occurredOn}
                onChange={(e) =>
                  setForm((p) => ({ ...p, occurredOn: e.target.value }))
                }
                className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/60"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                カテゴリー
              </span>
              <AccidentCategorySelect
                categories={categories}
                value={form.category}
                onChange={(value) =>
                  setForm((p) => ({ ...p, category: value }))
                }
                onCategoryCreated={refetchCategories}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                車格
              </span>
              <input
                type="text"
                value={form.vehicleClass}
                onChange={(e) =>
                  setForm((p) => ({ ...p, vehicleClass: e.target.value }))
                }
                placeholder="例：中型"
                className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                事故発生場所
              </span>
              <input
                type="text"
                value={form.location}
                onChange={(e) =>
                  setForm((p) => ({ ...p, location: e.target.value }))
                }
                placeholder="例：東京都渋谷区付近"
                className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                事故内容
              </span>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm((p) => ({ ...p, description: e.target.value }))
                }
                placeholder="事故の内容を入力"
                rows={3}
                className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
              />
            </label>
            <p className="text-xs text-muted-foreground">
              車格または事故内容のいずれかを入力してください。
            </p>
            <button
              type="button"
              onClick={addAccident}
              disabled={!canSaveNewAccident(form) || isSaving}
              className="self-end rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
            >
              {isSaving ? '保存中…' : '保存'}
            </button>
          </section>

          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center justify-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground active:scale-95"
          >
            過去の詳細を編集
          </button>

          {showHistory && (
            <section
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
              onTouchStart={historySwipe.onTouchStart}
              onTouchEnd={historySwipe.onTouchEnd}
            >
              <MonthNav
                date={historyMonth}
                onPrev={prevHistoryMonth}
                onNext={nextHistoryMonth}
              />
              {historyRows.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  この月の記録はありません。
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {historyRows.map((row) => (
                    <li key={row.id} className="flex flex-col gap-2">
                      {historyEditId === row.id ? (
                        <div className="flex flex-col gap-2 rounded-xl border border-primary/40 bg-background px-3 py-3">
                          <input
                            type="date"
                            value={historyForm.occurredOn}
                            onChange={(e) =>
                              setHistoryForm((p) => ({
                                ...p,
                                occurredOn: e.target.value,
                              }))
                            }
                            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
                          />
                          <AccidentCategorySelect
                            categories={categories}
                            value={historyForm.category}
                            onChange={(value) =>
                              setHistoryForm((p) => ({
                                ...p,
                                category: value,
                              }))
                            }
                            onCategoryCreated={refetchCategories}
                          />
                          <input
                            type="text"
                            value={historyForm.vehicleClass}
                            onChange={(e) =>
                              setHistoryForm((p) => ({
                                ...p,
                                vehicleClass: e.target.value,
                              }))
                            }
                            placeholder="車格"
                            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
                          />
                          <input
                            type="text"
                            value={historyForm.location}
                            onChange={(e) =>
                              setHistoryForm((p) => ({
                                ...p,
                                location: e.target.value,
                              }))
                            }
                            placeholder="事故発生場所"
                            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
                          />
                          <textarea
                            value={historyForm.description}
                            onChange={(e) =>
                              setHistoryForm((p) => ({
                                ...p,
                                description: e.target.value,
                              }))
                            }
                            rows={2}
                            placeholder="事故内容"
                            className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
                          />
                          {confirmDeleteId === row.id ? (
                            <ConfirmDeleteInline
                              onConfirm={() => deleteAccident(row.id)}
                              onCancel={() => setConfirmDeleteId(null)}
                            />
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(row.id)}
                                className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-destructive/80 transition-colors hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                削除
                              </button>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setHistoryEditId(null)}
                                  className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent active:scale-95"
                                >
                                  キャンセル
                                </button>
                                <button
                                  type="button"
                                  onClick={saveHistoryEdit}
                                  className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
                                >
                                  保存
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openHistoryEdit(row)}
                          className="flex flex-col gap-0.5 rounded-xl border border-border/60 bg-background px-3 py-2.5 text-left transition-colors hover:border-primary/50 active:scale-[0.99]"
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-muted-foreground">
                              {row.occurred_on}
                            </span>
                            <span className="flex items-center gap-1.5">
                              {row.category && (
                                <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-foreground">
                                  {row.category}
                                </span>
                              )}
                              {row.vehicle_class && (
                                <span className="text-xs font-semibold text-primary">
                                  {row.vehicle_class}
                                </span>
                              )}
                            </span>
                          </span>
                          {row.location && (
                            <span className="text-xs text-muted-foreground">
                              発生場所：{row.location}
                            </span>
                          )}
                          <span className="text-sm text-foreground">
                            {row.description || '詳細なし'}
                          </span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
