'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  ChevronRight,
  ArrowLeft,
  MapPin,
  Search,
  Plus,
  Trash2,
  X,
  Pencil,
} from 'lucide-react'

type Destination = {
  id: string
  name: string
  category: string
}

type FieldKey =
  | 'shopName'
  | 'address'
  | 'phone'
  | 'hours'
  | 'breakTime'
  | 'place'
  | 'loadOut'
  | 'loadIn'
  | 'method'
  | 'notes'

type FieldConfig = { key: FieldKey; label: string; multiline?: boolean }

type InfoEntry = {
  id: string
  calOut?: string[]
  calIn?: string[]
} & Record<FieldKey, string>

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

// Standard template used by every destination except AA.
const FIELDS: FieldConfig[] = [
  { key: 'shopName', label: '店舗名' },
  { key: 'address', label: '住所' },
  { key: 'phone', label: '電話番号' },
  { key: 'hours', label: '搬入可能時間' },
  { key: 'breakTime', label: '休憩時間' },
  { key: 'place', label: '搬入場所' },
  { key: 'method', label: '搬入方法', multiline: true },
  { key: 'notes', label: '注意事項', multiline: true },
]

// AA uses a venue-oriented template with a weekly calendar.
const AA_FIELDS: FieldConfig[] = [
  { key: 'shopName', label: '会場名' },
  { key: 'address', label: '住所' },
  { key: 'phone', label: '電話番号' },
  { key: 'loadOut', label: '搬出時間' },
  { key: 'loadIn', label: '搬入時間' },
  { key: 'method', label: '搬入方法', multiline: true },
  { key: 'notes', label: '注意事項', multiline: true },
]

function fieldsFor(id: string | undefined): FieldConfig[] {
  return id === 'aa' ? AA_FIELDS : FIELDS
}

function emptyForm(): Record<FieldKey, string> {
  return {
    shopName: '',
    address: '',
    phone: '',
    hours: '',
    breakTime: '',
    place: '',
    loadOut: '',
    loadIn: '',
    method: '',
    notes: '',
  }
}

function emptyWeek(): string[] {
  return Array(7).fill('')
}

const DESTINATIONS: Destination[] = [
  { id: 'ippan', name: '一般', category: '一般配送' },
  { id: 'aa', name: 'AA', category: 'オートオークション' },
  { id: 'kokunaisen', name: '国内船', category: '国内船 港' },
  { id: 'yushutsu', name: '輸出', category: '輸出ヤード' },
  { id: 'nx', name: 'NX', category: 'NXグループ拠点' },
  { id: 'nagoya', name: '名古屋', category: '名古屋方面' },
]

const STORAGE_KEY = 'kyoei-lol-entries'

type EntriesMap = Record<string, InfoEntry[]>

function loadEntries(): EntriesMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as EntriesMap) : {}
  } catch {
    return {}
  }
}

function weekdayColor(i: number): string {
  if (i === 0) return 'text-destructive'
  if (i === 6) return 'text-secondary'
  return 'text-muted-foreground'
}

function hasCalendar(e: InfoEntry): boolean {
  return (
    (e.calOut?.some((v) => v.trim()) ?? false) ||
    (e.calIn?.some((v) => v.trim()) ?? false)
  )
}

function WeeklyCalendar({
  out,
  inn,
  editable,
  onChangeOut,
  onChangeIn,
}: {
  out: string[]
  inn: string[]
  editable?: boolean
  onChangeOut?: (i: number, v: string) => void
  onChangeIn?: (i: number, v: string) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[22rem] border-collapse text-center text-xs">
        <thead>
          <tr>
            <th className="w-14 border border-border bg-muted p-1 font-medium text-muted-foreground" />
            {WEEKDAYS.map((d, i) => (
              <th
                key={d}
                className={`border border-border bg-muted p-1 font-semibold ${weekdayColor(i)}`}
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(
            [
              ['搬出', out, onChangeOut] as const,
              ['搬入', inn, onChangeIn] as const,
            ] as const
          ).map(([label, values, onChange]) => (
            <tr key={label}>
              <th className="border border-border bg-muted/60 p-1 font-medium text-muted-foreground">
                {label}
              </th>
              {values.map((v, i) => (
                <td key={i} className="border border-border p-0">
                  {editable ? (
                    <input
                      type="text"
                      value={v}
                      onChange={(e) => onChange?.(i, e.target.value)}
                      aria-label={`${label} ${WEEKDAYS[i]}曜日`}
                      className="w-full bg-background px-1 py-2 text-center text-xs text-foreground outline-none focus:bg-accent"
                    />
                  ) : (
                    <span
                      className={
                        v.trim()
                          ? 'block px-1 py-2 text-foreground'
                          : 'block px-1 py-2 text-muted-foreground/40'
                      }
                    >
                      {v.trim() || '—'}
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function LolView() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusedEntryId, setFocusedEntryId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<EntriesMap>({})
  const [hydrated, setHydrated] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<Record<FieldKey, string>>(emptyForm)
  const [calOut, setCalOut] = useState<string[]>(emptyWeek)
  const [calIn, setCalIn] = useState<string[]>(emptyWeek)

  useEffect(() => {
    setEntries(loadEntries())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  }, [hydrated, entries])

  const selected = DESTINATIONS.find((d) => d.id === selectedId) ?? null
  const isAA = selected?.id === 'aa'
  const activeFields = fieldsFor(selected?.id)

  const q = query.trim().toLowerCase()

  // When searching, produce a flat list of matching registered places (entries)
  // across all destinations. An entry matches if any of its field values (or
  // calendar cells), or its parent destination's name/category, contains the query.
  const matchedEntries = useMemo(() => {
    if (!q) return []
    const results: { dest: Destination; entry: InfoEntry }[] = []
    for (const dest of DESTINATIONS) {
      const destMatch =
        dest.name.toLowerCase().includes(q) ||
        dest.category.toLowerCase().includes(q)
      for (const entry of entries[dest.id] ?? []) {
        const textMatch = (Object.keys(emptyForm()) as FieldKey[]).some((k) =>
          entry[k].toLowerCase().includes(q),
        )
        const calMatch = [...(entry.calOut ?? []), ...(entry.calIn ?? [])].some(
          (v) => v.toLowerCase().includes(q),
        )
        if (destMatch || textMatch || calMatch) results.push({ dest, entry })
      }
    }
    return results
  }, [q, entries])

  function openDetail(id: string, entryId: string | null = null) {
    setSelectedId(id)
    setFocusedEntryId(entryId)
    setAdding(false)
    setEditingId(null)
    setConfirmDeleteId(null)
    setForm(emptyForm())
    setCalOut(emptyWeek())
    setCalIn(emptyWeek())
  }

  function startAdd() {
    setEditingId(null)
    setForm(emptyForm())
    setCalOut(emptyWeek())
    setCalIn(emptyWeek())
    setAdding(true)
  }

  function startEdit(entry: InfoEntry) {
    const { id: _id, calOut: eOut, calIn: eIn, ...values } = entry
    setEditingId(entry.id)
    setForm(values)
    setCalOut(eOut ?? emptyWeek())
    setCalIn(eIn ?? emptyWeek())
    setAdding(true)
  }

  function closeForm() {
    setAdding(false)
    setEditingId(null)
    setForm(emptyForm())
    setCalOut(emptyWeek())
    setCalIn(emptyWeek())
  }

  function saveEntry() {
    if (!selected || !form.shopName.trim()) return
    const trimmed = emptyForm()
    ;(Object.keys(form) as FieldKey[]).forEach((k) => {
      trimmed[k] = form[k].trim()
    })
    const base: InfoEntry = { id: editingId ?? `${Date.now()}`, ...trimmed }
    if (isAA) {
      base.calOut = calOut.map((v) => v.trim())
      base.calIn = calIn.map((v) => v.trim())
    }
    setEntries((prev) => {
      const current = prev[selected.id] ?? []
      const next = editingId
        ? current.map((e) => (e.id === editingId ? base : e))
        : [...current, base]
      return { ...prev, [selected.id]: next }
    })
    closeForm()
  }

  function deleteEntry(entryId: string) {
    if (!selected) return
    setEntries((prev) => ({
      ...prev,
      [selected.id]: (prev[selected.id] ?? []).filter((e) => e.id !== entryId),
    }))
    setConfirmDeleteId(null)
  }

  if (selected) {
    const allEntries = entries[selected.id] ?? []
    const focusing =
      focusedEntryId != null && allEntries.some((e) => e.id === focusedEntryId)
    const list = focusing
      ? allEntries.filter((e) => e.id === focusedEntryId)
      : allEntries
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            一覧へ戻る
          </button>

          <button
            type="button"
            onClick={() => (adding ? closeForm() : startAdd())}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 active:scale-95"
          >
            {adding ? (
              <X className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            {adding ? '閉じる' : '情報を追加'}
          </button>
        </div>

        <div>
          <span className="text-xs font-semibold tracking-wide text-primary">
            {selected.category}
          </span>
          <h2 className="mt-1 text-2xl font-bold text-foreground">
            {selected.name}
          </h2>
          {focusing && (
            <button
              type="button"
              onClick={() => setFocusedEntryId(null)}
              className="mt-2 text-xs font-medium text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
            >
              {selected.name}の登録情報をすべて表示（{allEntries.length}件）
            </button>
          )}
        </div>

        {adding && (
          <section className="flex flex-col gap-3 rounded-3xl border border-border bg-card px-5 py-5">
            {activeFields.map((f) => (
              <Fragment key={f.key}>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    {f.label}
                    {f.key === 'shopName' && (
                      <span className="ml-1 text-destructive">*</span>
                    )}
                  </span>
                  {f.multiline ? (
                    <textarea
                      value={form[f.key]}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, [f.key]: e.target.value }))
                      }
                      rows={2}
                      className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
                    />
                  ) : (
                    <input
                      type="text"
                      value={form[f.key]}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, [f.key]: e.target.value }))
                      }
                      className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
                    />
                  )}
                </label>
                {isAA && f.key === 'phone' && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      週間カレンダー（〇 または 時間を入力）
                    </span>
                    <WeeklyCalendar
                      out={calOut}
                      inn={calIn}
                      editable
                      onChangeOut={(i, v) =>
                        setCalOut((p) => p.map((x, j) => (j === i ? v : x)))
                      }
                      onChangeIn={(i, v) =>
                        setCalIn((p) => p.map((x, j) => (j === i ? v : x)))
                      }
                    />
                  </div>
                )}
              </Fragment>
            ))}
            <button
              type="button"
              onClick={saveEntry}
              disabled={!form.shopName.trim()}
              className="self-end rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
            >
              {editingId ? '更新' : '保存'}
            </button>
          </section>
        )}

        {list.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
            まだ情報がありません。
            <br />
            右上の「情報を追加」から登録できます。
          </p>
        ) : focusing ? (
          <ul className="flex flex-col gap-2.5">
            {list.map((e) => (
              <li
                key={e.id}
                className="rounded-2xl border border-border bg-card px-5 py-4"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold text-foreground">
                    {e.shopName || '（名称なし）'}
                  </h3>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => startEdit(e)}
                      aria-label={`${e.shopName}を編集`}
                      className="rounded-lg p-1 text-muted-foreground/50 transition-colors hover:text-foreground active:scale-90"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(e.id)}
                      aria-label={`${e.shopName}を削除`}
                      className="rounded-lg p-1 text-muted-foreground/50 transition-colors hover:text-destructive active:scale-90"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {confirmDeleteId === e.id && (
                  <div className="mb-3 flex flex-col gap-2.5 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3">
                    <p className="text-sm font-medium text-foreground">
                      本当に削除しますか？
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => deleteEntry(e.id)}
                        className="rounded-full bg-destructive px-4 py-1.5 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 active:scale-95"
                      >
                        削除する
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-95"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}
                <dl className="flex flex-col gap-1.5">
                  {activeFields
                    .filter((f) => f.key !== 'shopName' && e[f.key])
                    .map((f) => (
                      <Fragment key={f.key}>
                        <div className="grid grid-cols-[6.5rem_1fr] gap-2 text-sm">
                          <dt className="text-muted-foreground">{f.label}</dt>
                          <dd className="whitespace-pre-wrap leading-relaxed text-foreground">
                            {e[f.key]}
                          </dd>
                        </div>
                        {isAA && f.key === 'phone' && hasCalendar(e) && (
                          <div className="my-1.5">
                            <p className="mb-1 text-sm text-muted-foreground">
                              週間カレンダー
                            </p>
                            <WeeklyCalendar
                              out={e.calOut ?? emptyWeek()}
                              inn={e.calIn ?? emptyWeek()}
                            />
                          </div>
                        )}
                      </Fragment>
                    ))}
                  {isAA &&
                    hasCalendar(e) &&
                    !activeFields.some(
                      (f) => f.key === 'phone' && e.phone,
                    ) && (
                      <div className="my-1.5">
                        <p className="mb-1 text-sm text-muted-foreground">
                          週間カレンダー
                        </p>
                        <WeeklyCalendar
                          out={e.calOut ?? emptyWeek()}
                          inn={e.calIn ?? emptyWeek()}
                        />
                      </div>
                    )}
                </dl>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {list.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setFocusedEntryId(e.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:border-primary/60 hover:bg-accent active:scale-[0.99]"
                >
                  <span className="truncate text-base font-semibold text-foreground">
                    {e.shopName || '（名称なし）'}
                  </span>
                  <ChevronRight
                    className="h-5 w-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold text-foreground">配達先</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          配達先を選ぶと登録した情報を確認できます。
        </p>
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="配達先・店舗名・住所などで検索"
          aria-label="配達先を検索"
          className="w-full rounded-2xl border border-border bg-card py-3 pl-11 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
        />
      </div>

      {q ? (
        matchedEntries.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
            「{query}」に一致する配達先はありません。
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {matchedEntries.map(({ dest, entry }) => (
              <li key={`${dest.id}-${entry.id}`}>
                <button
                  type="button"
                  onClick={() => openDetail(dest.id, entry.id)}
                  className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:border-primary/60 hover:bg-accent active:scale-[0.99]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <MapPin className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-base font-semibold text-foreground">
                        {entry.shopName || '（名称なし）'}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {dest.name}
                        {entry.address ? ` ・ ${entry.address}` : ''}
                      </span>
                    </span>
                  </span>
                  <ChevronRight
                    className="h-5 w-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <ul className="flex flex-col gap-2.5">
          {DESTINATIONS.map((d) => {
            const count = entries[d.id]?.length ?? 0
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => openDetail(d.id)}
                  className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:border-primary/60 hover:bg-accent active:scale-[0.99]"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <MapPin className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="flex flex-col">
                      <span className="text-base font-semibold text-foreground">
                        {d.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {d.category}
                        {count > 0 ? ` ・ ${count}件` : ''}
                      </span>
                    </span>
                  </span>
                  <ChevronRight
                    className="h-5 w-5 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
