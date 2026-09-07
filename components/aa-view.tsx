'use client'

import { useEffect, useState } from 'react'
import { Pencil, X, Plus, Store, Clock } from 'lucide-react'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
const STORAGE_KEY_DAYS = 'kyoei-aa-auction-days'
const STORAGE_KEY_DEADLINES = 'kyoei-aa-deadlines'

// 0:00 〜 24:00 in 1-hour steps.
const TIME_OPTIONS: string[] = (() => {
  const arr: string[] = []
  for (let h = 0; h <= 24; h++) arr.push(`${h}:00`)
  return arr
})()

function weekdayColor(i: number): string {
  if (i === 0) return 'text-destructive'
  if (i === 6) return 'text-secondary'
  return 'text-foreground'
}

type VenueEntry = { id: string; name: string }
type DeadlineEntry = { id: string; name: string; time: string }

function emptyDays(): VenueEntry[][] {
  return Array.from({ length: 7 }, () => [])
}

function emptyDeadlines(): DeadlineEntry[][] {
  return Array.from({ length: 7 }, () => [])
}

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length === 7) return parsed as T
  } catch {
    // ignore malformed storage
  }
  return fallback
}

function handleEnter(fn: () => void) {
  return (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      e.key === 'Enter' &&
      !e.nativeEvent.isComposing &&
      e.keyCode !== 229
    ) {
      e.preventDefault()
      fn()
    }
  }
}

function CalendarCard({
  title,
  editing,
  onToggleEdit,
  children,
}: {
  title: string
  editing: boolean
  onToggleEdit: () => void
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        <button
          type="button"
          onClick={onToggleEdit}
          className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors active:scale-95 ${
            editing
              ? 'bg-primary text-primary-foreground'
              : 'border border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          {editing ? (
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {editing ? '完了' : '編集'}
        </button>
      </div>
      {children}
    </section>
  )
}

export function AAView() {
  const [days, setDays] = useState<VenueEntry[][]>(emptyDays)
  const [deadlines, setDeadlines] = useState<DeadlineEntry[][]>(emptyDeadlines)
  const [loaded, setLoaded] = useState(false)
  const [editingDays, setEditingDays] = useState(false)
  const [editingDeadlines, setEditingDeadlines] = useState(false)
  const [dayInputs, setDayInputs] = useState<string[]>(Array(7).fill(''))
  const [deadlineNameInputs, setDeadlineNameInputs] = useState<string[]>(
    Array(7).fill(''),
  )
  const [deadlineTimeInputs, setDeadlineTimeInputs] = useState<string[]>(
    Array(7).fill('9:00'),
  )

  useEffect(() => {
    setDays(loadJson(STORAGE_KEY_DAYS, emptyDays()))
    setDeadlines(loadJson(STORAGE_KEY_DEADLINES, emptyDeadlines()))
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    window.localStorage.setItem(STORAGE_KEY_DAYS, JSON.stringify(days))
  }, [days, loaded])

  useEffect(() => {
    if (!loaded) return
    window.localStorage.setItem(
      STORAGE_KEY_DEADLINES,
      JSON.stringify(deadlines),
    )
  }, [deadlines, loaded])

  function addVenue(dayIndex: number) {
    const name = dayInputs[dayIndex].trim()
    if (!name) return
    setDays((prev) =>
      prev.map((list, i) =>
        i === dayIndex ? [...list, { id: `${Date.now()}`, name }] : list,
      ),
    )
    setDayInputs((prev) => prev.map((v, i) => (i === dayIndex ? '' : v)))
  }

  function removeVenue(dayIndex: number, id: string) {
    setDays((prev) =>
      prev.map((list, i) =>
        i === dayIndex ? list.filter((v) => v.id !== id) : list,
      ),
    )
  }

  function addDeadline(dayIndex: number) {
    const name = deadlineNameInputs[dayIndex].trim()
    if (!name) return
    const time = deadlineTimeInputs[dayIndex]
    setDeadlines((prev) =>
      prev.map((list, i) =>
        i === dayIndex
          ? [...list, { id: `${Date.now()}`, name, time }]
          : list,
      ),
    )
    setDeadlineNameInputs((prev) =>
      prev.map((v, i) => (i === dayIndex ? '' : v)),
    )
  }

  function removeDeadline(dayIndex: number, id: string) {
    setDeadlines((prev) =>
      prev.map((list, i) =>
        i === dayIndex ? list.filter((v) => v.id !== id) : list,
      ),
    )
  }

  return (
    <div className="flex flex-col gap-6 pb-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">AA</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          オークションの開催日と各会場の搬出期限を確認できます。
        </p>
      </div>

      <CalendarCard
        title="オークション開催日一覧"
        editing={editingDays}
        onToggleEdit={() => setEditingDays((v) => !v)}
      >
        <div className="flex flex-col gap-1.5">
          {WEEKDAYS.map((d, i) => (
            <div
              key={d}
              className="flex items-start gap-3 rounded-xl border border-border/60 bg-background px-3 py-2.5"
            >
              <span
                className={`w-6 shrink-0 pt-0.5 text-center text-sm font-bold ${weekdayColor(i)}`}
              >
                {d}
              </span>
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {days[i].length === 0 && !editingDays ? (
                    <span className="pt-0.5 text-sm text-muted-foreground/50">
                      —
                    </span>
                  ) : (
                    days[i].map((v) => (
                      <span
                        key={v.id}
                        className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary"
                      >
                        <Store className="h-3 w-3" aria-hidden="true" />
                        {v.name}
                        {editingDays && (
                          <button
                            type="button"
                            onClick={() => removeVenue(i, v.id)}
                            aria-label={`${v.name}を削除`}
                            className="ml-0.5 text-primary/70 transition-colors hover:text-destructive"
                          >
                            <X className="h-3 w-3" aria-hidden="true" />
                          </button>
                        )}
                      </span>
                    ))
                  )}
                </div>
                {editingDays && (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={dayInputs[i]}
                      onChange={(e) =>
                        setDayInputs((prev) =>
                          prev.map((v, idx) =>
                            idx === i ? e.target.value : v,
                          ),
                        )
                      }
                      onKeyDown={handleEnter(() => addVenue(i))}
                      placeholder="会場名を追加"
                      aria-label={`${d}曜日の会場名を追加`}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
                    />
                    <button
                      type="button"
                      onClick={() => addVenue(i)}
                      aria-label={`${d}曜日に会場を追加`}
                      className="flex shrink-0 items-center justify-center rounded-lg bg-primary px-2.5 text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CalendarCard>

      <CalendarCard
        title="各会場搬出期限"
        editing={editingDeadlines}
        onToggleEdit={() => setEditingDeadlines((v) => !v)}
      >
        <div className="flex flex-col gap-1.5">
          {WEEKDAYS.map((d, i) => (
            <div
              key={d}
              className="flex items-start gap-3 rounded-xl border border-border/60 bg-background px-3 py-2.5"
            >
              <span
                className={`w-6 shrink-0 pt-0.5 text-center text-sm font-bold ${weekdayColor(i)}`}
              >
                {d}
              </span>
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex flex-col gap-1.5">
                  {deadlines[i].length === 0 && !editingDeadlines ? (
                    <span className="pt-0.5 text-sm text-muted-foreground/50">
                      —
                    </span>
                  ) : (
                    deadlines[i].map((v) => (
                      <span
                        key={v.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-primary/15 px-2.5 py-1.5 text-xs font-medium text-primary"
                      >
                        <span className="flex items-center gap-1.5">
                          <Store className="h-3 w-3 shrink-0" aria-hidden="true" />
                          {v.name}
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {v.time}
                          {editingDeadlines && (
                            <button
                              type="button"
                              onClick={() => removeDeadline(i, v.id)}
                              aria-label={`${v.name}を削除`}
                              className="ml-0.5 text-primary/70 transition-colors hover:text-destructive"
                            >
                              <X className="h-3 w-3" aria-hidden="true" />
                            </button>
                          )}
                        </span>
                      </span>
                    ))
                  )}
                </div>
                {editingDeadlines && (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={deadlineNameInputs[i]}
                      onChange={(e) =>
                        setDeadlineNameInputs((prev) =>
                          prev.map((v, idx) =>
                            idx === i ? e.target.value : v,
                          ),
                        )
                      }
                      onKeyDown={handleEnter(() => addDeadline(i))}
                      placeholder="会場名を追加"
                      aria-label={`${d}曜日の会場名を追加`}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
                    />
                    <select
                      value={deadlineTimeInputs[i]}
                      onChange={(e) =>
                        setDeadlineTimeInputs((prev) =>
                          prev.map((v, idx) =>
                            idx === i ? e.target.value : v,
                          ),
                        )
                      }
                      aria-label={`${d}曜日の搬出期限時刻`}
                      className="shrink-0 rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/60"
                    >
                      {TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => addDeadline(i)}
                      aria-label={`${d}曜日に搬出期限を追加`}
                      className="flex shrink-0 items-center justify-center rounded-lg bg-primary px-2.5 text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CalendarCard>
    </div>
  )
}
