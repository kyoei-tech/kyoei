'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ChevronRight,
  ArrowLeft,
  MapPin,
  Search,
  Plus,
  Trash2,
  X,
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
  | 'method'
  | 'notes'

type InfoEntry = {
  id: string
} & Record<FieldKey, string>

const FIELDS: { key: FieldKey; label: string; multiline?: boolean }[] = [
  { key: 'shopName', label: '店舗名' },
  { key: 'address', label: '住所' },
  { key: 'phone', label: '電話番号' },
  { key: 'hours', label: '搬入可能時間' },
  { key: 'breakTime', label: '休憩時間' },
  { key: 'place', label: '搬入場所' },
  { key: 'method', label: '搬入方法', multiline: true },
  { key: 'notes', label: '注意事項', multiline: true },
]

function emptyForm(): Record<FieldKey, string> {
  return {
    shopName: '',
    address: '',
    phone: '',
    hours: '',
    breakTime: '',
    place: '',
    method: '',
    notes: '',
  }
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

export function LolView() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<EntriesMap>({})
  const [hydrated, setHydrated] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<Record<FieldKey, string>>(emptyForm)

  useEffect(() => {
    setEntries(loadEntries())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  }, [hydrated, entries])

  const selected = DESTINATIONS.find((d) => d.id === selectedId) ?? null

  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      q
        ? DESTINATIONS.filter(
            (d) =>
              d.name.toLowerCase().includes(q) ||
              d.category.toLowerCase().includes(q),
          )
        : DESTINATIONS,
    [q],
  )

  function openDetail(id: string) {
    setSelectedId(id)
    setAdding(false)
    setForm(emptyForm())
  }

  function saveEntry() {
    if (!selected || !form.shopName.trim()) return
    const entry: InfoEntry = { id: `${Date.now()}`, ...form }
    ;(Object.keys(form) as FieldKey[]).forEach((k) => {
      entry[k] = form[k].trim()
    })
    setEntries((prev) => ({
      ...prev,
      [selected.id]: [...(prev[selected.id] ?? []), entry],
    }))
    setForm(emptyForm())
    setAdding(false)
  }

  function deleteEntry(entryId: string) {
    if (!selected) return
    setEntries((prev) => ({
      ...prev,
      [selected.id]: (prev[selected.id] ?? []).filter((e) => e.id !== entryId),
    }))
  }

  if (selected) {
    const list = entries[selected.id] ?? []
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
            onClick={() => setAdding((v) => !v)}
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
        </div>

        {adding && (
          <section className="flex flex-col gap-3 rounded-3xl border border-border bg-card px-5 py-5">
            {FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1">
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
            ))}
            <button
              type="button"
              onClick={saveEntry}
              disabled={!form.shopName.trim()}
              className="self-end rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
            >
              保存
            </button>
          </section>
        )}

        {list.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
            まだ情報がありません。
            <br />
            右上の「情報を追加」から登録できます。
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {list.map((e) => (
              <li
                key={e.id}
                className="rounded-2xl border border-border bg-card px-5 py-4"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold text-foreground">
                    {e.shopName || '（店舗名なし）'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => deleteEntry(e.id)}
                    aria-label={`${e.shopName}を削除`}
                    className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:text-destructive active:scale-90"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <dl className="flex flex-col gap-1.5">
                  {FIELDS.filter((f) => f.key !== 'shopName' && e[f.key]).map(
                    (f) => (
                      <div
                        key={f.key}
                        className="grid grid-cols-[6.5rem_1fr] gap-2 text-sm"
                      >
                        <dt className="text-muted-foreground">{f.label}</dt>
                        <dd className="whitespace-pre-wrap leading-relaxed text-foreground">
                          {e[f.key]}
                        </dd>
                      </div>
                    ),
                  )}
                </dl>
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
          placeholder="配達先を検索"
          aria-label="配達先を検索"
          className="w-full rounded-2xl border border-border bg-card py-3 pl-11 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
          「{query}」に一致する配達先はありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {filtered.map((d) => {
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
