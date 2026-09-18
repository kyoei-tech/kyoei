'use client'

import { useMemo, useState } from 'react'
import { Check, Pencil, Plus, Search, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { useKanaSearch } from '@/lib/search/use-kana-search'
import { ConfirmDeleteInline, DeleteIconButton } from './confirm-delete'
import { BackHeader } from './back-header'

// Shared across every browser via the `yard_destination_titles` /
// `yard_destination_stores` Supabase tables.
type TitleRow = { id: string; title: string; sort_order: number }
type StoreRow = {
  id: string
  title_id: string
  name: string
  sort_order: number
}

async function fetchTitles(): Promise<TitleRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('yard_destination_titles')
    .select('id, title, sort_order')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as TitleRow[]) ?? []
}

async function fetchStores(): Promise<StoreRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('yard_destination_stores')
    .select('id, title_id, name, sort_order')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as StoreRow[]) ?? []
}

/** Splits a bulk-entry textarea value into trimmed, non-empty store names. */
function splitStoreNames(raw: string): string[] {
  return raw
    .split(/[\n、]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export function YardDestinationRegistryView({
  onBack,
}: {
  onBack: () => void
}) {
  const { data: titleRows, mutate: refetchTitles } = useRealtimeTable<TitleRow>(
    'yard_destination_titles',
    fetchTitles,
  )
  const { data: storeRows, mutate: refetchStores } = useRealtimeTable<StoreRow>(
    'yard_destination_stores',
    fetchStores,
  )

  const [search, setSearch] = useState('')
  const [addingTitle, setAddingTitle] = useState(false)
  const [newTitleName, setNewTitleName] = useState('')
  const [titleEditId, setTitleEditId] = useState<string | null>(null)
  const [titleEditName, setTitleEditName] = useState('')
  const [confirmDeleteTitleId, setConfirmDeleteTitleId] = useState<
    string | null
  >(null)
  const [storeEditId, setStoreEditId] = useState<string | null>(null)
  const [storeEditName, setStoreEditName] = useState('')
  const [confirmDeleteStoreId, setConfirmDeleteStoreId] = useState<
    string | null
  >(null)
  const [bulkInputs, setBulkInputs] = useState<Record<string, string>>({})
  const { matches } = useKanaSearch()

  const titles = useMemo(
    () => [...titleRows].sort((a, b) => a.sort_order - b.sort_order),
    [titleRows],
  )

  const storesByTitle = useMemo(() => {
    const map = new Map<string, StoreRow[]>()
    for (const s of storeRows) {
      const list = map.get(s.title_id) ?? []
      list.push(s)
      map.set(s.title_id, list)
    }
    for (const list of map.values())
      list.sort((a, b) => a.sort_order - b.sort_order)
    return map
  }, [storeRows])

  const titleById = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of titles) map.set(t.id, t.title)
    return map
  }, [titles])

  const searchResults = useMemo(() => {
    const query = search.trim()
    if (!query) return null
    return storeRows.filter((s) => matches(s.name, query))
  }, [search, storeRows, matches])

  async function addTitle() {
    const title = newTitleName.trim()
    if (!title) return
    const supabase = createClient()
    await supabase
      .from('yard_destination_titles')
      .insert({ title, sort_order: titles.length })
    setNewTitleName('')
    setAddingTitle(false)
    await refetchTitles()
  }

  function startEditTitle(title: TitleRow) {
    setTitleEditId(title.id)
    setTitleEditName(title.title)
  }

  async function saveTitleName() {
    const title = titleEditName.trim()
    const id = titleEditId
    if (!id || !title) {
      setTitleEditId(null)
      return
    }
    const supabase = createClient()
    await supabase
      .from('yard_destination_titles')
      .update({ title })
      .eq('id', id)
    setTitleEditId(null)
    await refetchTitles()
  }

  async function deleteTitle(id: string) {
    const supabase = createClient()
    await supabase.from('yard_destination_titles').delete().eq('id', id)
    setConfirmDeleteTitleId(null)
    await refetchTitles()
    await refetchStores()
  }

  function startEditStore(store: StoreRow) {
    setStoreEditId(store.id)
    setStoreEditName(store.name)
  }

  async function saveStoreName() {
    const name = storeEditName.trim()
    const id = storeEditId
    if (!id || !name) {
      setStoreEditId(null)
      return
    }
    const supabase = createClient()
    await supabase.from('yard_destination_stores').update({ name }).eq('id', id)
    setStoreEditId(null)
    await refetchStores()
  }

  async function deleteStore(id: string) {
    const supabase = createClient()
    await supabase.from('yard_destination_stores').delete().eq('id', id)
    setConfirmDeleteStoreId(null)
    await refetchStores()
  }

  async function registerBulkStores(titleId: string) {
    const raw = bulkInputs[titleId] ?? ''
    const names = splitStoreNames(raw)
    if (names.length === 0) return
    const supabase = createClient()
    const existing = storesByTitle.get(titleId) ?? []
    await supabase.from('yard_destination_stores').insert(
      names.map((name, i) => ({
        title_id: titleId,
        name,
        sort_order: existing.length + i,
      })),
    )
    setBulkInputs((prev) => ({ ...prev, [titleId]: '' }))
    await refetchStores()
  }

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <BackHeader onBack={onBack} label="通知の管理へ戻る" variant="subtle" />

      <h2 className="text-xl font-bold text-foreground">検索結果登録</h2>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
          <Search
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="店舗名で検索"
            aria-label="店舗名で検索"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="検索をクリア"
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {searchResults != null && (
          <div className="flex flex-col gap-1 rounded-xl border border-border/60 bg-card px-3 py-2">
            {searchResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                該当なし。確認してください。
              </p>
            ) : (
              searchResults.map((s) => (
                <p key={s.id} className="text-sm text-foreground">
                  {s.name}　{titleById.get(s.title_id) ?? '不明'}
                </p>
              ))
            )}
          </div>
        )}
      </div>

      {addingTitle ? (
        <div className="flex items-center gap-2 rounded-2xl border border-dashed border-primary/50 bg-primary/5 p-3">
          <input
            type="text"
            value={newTitleName}
            onChange={(e) => setNewTitleName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault()
                addTitle()
              }
            }}
            placeholder="行き先タイトル名"
            aria-label="新しい行き先タイトル名"
            autoFocus
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
          />
          <button
            type="button"
            onClick={addTitle}
            className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
          >
            追加
          </button>
          <button
            type="button"
            onClick={() => {
              setAddingTitle(false)
              setNewTitleName('')
            }}
            aria-label="キャンセル"
            className="shrink-0 rounded-full border border-border p-2 text-muted-foreground transition-colors hover:text-foreground active:scale-95"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingTitle(true)}
          className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-primary/50 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 active:scale-[0.99]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          行き先タイトルを追加
        </button>
      )}

      {titles.map((title) => {
        const stores = storesByTitle.get(title.id) ?? []
        return (
          <section
            key={title.id}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
          >
            <div className="flex items-center justify-between gap-2">
              {titleEditId === title.id ? (
                <input
                  type="text"
                  value={titleEditName}
                  onChange={(e) => setTitleEditName(e.target.value)}
                  onBlur={saveTitleName}
                  autoFocus
                  aria-label="行き先タイトル名"
                  className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-1.5 text-base font-bold text-foreground outline-none focus:border-primary/60"
                />
              ) : (
                <h3 className="min-w-0 flex-1 truncate text-base font-bold text-foreground">
                  {title.title}
                </h3>
              )}
              <button
                type="button"
                onClick={() => startEditTitle(title)}
                aria-label={`${title.title}を編集`}
                className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground active:scale-90"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <DeleteIconButton
                onClick={() => setConfirmDeleteTitleId(title.id)}
                label={`${title.title}を削除`}
              />
            </div>

            {confirmDeleteTitleId === title.id && (
              <ConfirmDeleteInline
                message={`「${title.title}」を削除しますか？このタイトルと配下の店舗名がすべて削除されます。`}
                onConfirm={() => deleteTitle(title.id)}
                onCancel={() => setConfirmDeleteTitleId(null)}
              />
            )}

            <div className="flex flex-col gap-1.5">
              {stores.length === 0 && (
                <p className="py-1 text-sm text-muted-foreground/60">
                  店舗名が登録されていません。
                </p>
              )}
              {stores.map((store) => (
                <div key={store.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2">
                    {storeEditId === store.id ? (
                      <input
                        type="text"
                        value={storeEditName}
                        onChange={(e) => setStoreEditName(e.target.value)}
                        onBlur={saveStoreName}
                        autoFocus
                        aria-label="店舗名"
                        className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary/60"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditStore(store)}
                        className="min-w-0 flex-1 truncate text-left text-sm text-foreground"
                      >
                        {store.name}
                      </button>
                    )}
                    <DeleteIconButton
                      onClick={() => setConfirmDeleteStoreId(store.id)}
                      label={`${store.name}を削除`}
                    />
                  </div>
                  {confirmDeleteStoreId === store.id && (
                    <ConfirmDeleteInline
                      message={`「${store.name}」を削除しますか？`}
                      onConfirm={() => deleteStore(store.id)}
                      onCancel={() => setConfirmDeleteStoreId(null)}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-1.5">
              <textarea
                value={bulkInputs[title.id] ?? ''}
                onChange={(e) =>
                  setBulkInputs((prev) => ({
                    ...prev,
                    [title.id]: e.target.value,
                  }))
                }
                placeholder={'店舗名を改行または「、」区切りで入力\n（複数件を一括登録できます）'}
                aria-label="店舗名の一括登録"
                rows={2}
                className="min-w-0 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
              />
              <button
                type="button"
                onClick={() => registerBulkStores(title.id)}
                className="flex items-center justify-center gap-1.5 self-end rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                登録
              </button>
            </div>
          </section>
        )
      })}
    </div>
  )
}
