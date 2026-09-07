'use client'

import { useEffect, useState } from 'react'
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

type InfoEntry = {
  id: string
  title: string
  body: string
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
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

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
  const filtered = q
    ? DESTINATIONS.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.category.toLowerCase().includes(q),
      )
    : DESTINATIONS

  function openDetail(id: string) {
    setSelectedId(id)
    setAdding(false)
    setTitle('')
    setBody('')
  }

  function saveEntry() {
    if (!selected || !title.trim()) return
    const entry: InfoEntry = {
      id: `${Date.now()}`,
      title: title.trim(),
      body: body.trim(),
    }
    setEntries((prev) => ({
      ...prev,
      [selected.id]: [...(prev[selected.id] ?? []), entry],
    }))
    setTitle('')
    setBody('')
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
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="タイトル（例：搬入口・受付時間）"
              aria-label="タイトル"
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="詳細を入力"
              aria-label="詳細"
              rows={3}
              className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
            />
            <button
              type="button"
              onClick={saveEntry}
              disabled={!title.trim()}
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
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold text-foreground">
                    {e.title}
                  </h3>
                  <button
                    type="button"
                    onClick={() => deleteEntry(e.id)}
                    aria-label={`${e.title}を削除`}
                    className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:text-destructive active:scale-90"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                {e.body && (
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {e.body}
                  </p>
                )}
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
