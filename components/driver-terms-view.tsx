'use client'

import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ChevronRight,
  FolderOpen,
  LayoutGrid,
  Pencil,
  Plus,
  Quote,
  Search,
  SortAsc,
  Trash2,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { ConfirmDeleteInline } from './confirm-delete'
import { useSettings } from '@/lib/settings/settings-context'
import { useScrollToTop } from '@/lib/use-scroll-to-top'

const UNSET_CATEGORY = '未分類'
const NEW_CATEGORY_VALUE = '__new__'

type Term = {
  id: string
  category: string
  term: string
  reading: string
  meaning: string
  antonym: string
  example: string
}

// Shared across every browser via the `dictionary_terms` Supabase table.
type TermRow = {
  id: string
  category: string
  term: string
  reading: string
  meaning: string
  antonym: string
  example: string
}

// Managed list of category names, shared via `dictionary_categories`, so the
// register form's dropdown offers every category anyone has ever used.
type CategoryRow = { id: string; name: string; sort_order: number }

function rowToTerm(r: TermRow): Term {
  return {
    id: r.id,
    category: r.category,
    term: r.term,
    reading: r.reading,
    meaning: r.meaning,
    antonym: r.antonym,
    example: r.example,
  }
}

async function fetchTermRows(): Promise<TermRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('dictionary_terms')
    .select('id, category, term, reading, meaning, antonym, example')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as TermRow[]) ?? []
}

async function fetchCategoryRows(): Promise<CategoryRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('dictionary_categories')
    .select('id, name, sort_order')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as CategoryRow[]) ?? []
}

function emptyForm() {
  return {
    categorySelection: '',
    newCategory: '',
    term: '',
    reading: '',
    meaning: '',
    antonym: '',
    example: '',
  }
}

// Sorts by reading (kana) so the default list reads in 50音順; falls back
// to the term itself when a reading hasn't been filled in yet.
function byKana(a: Term, b: Term) {
  return (a.reading.trim() || a.term).localeCompare(
    b.reading.trim() || b.term,
    'ja',
  )
}

type Mode = 'kana' | 'category'
type Screen = 'top' | 'terms' | 'detail'

export function DriverTermsView() {
  const [mode, setMode] = useState<Mode>('kana')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    null,
  )
  const { partTimeMode } = useSettings()
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())

  const { data: termRows, mutate: refetchTerms } = useRealtimeTable<TermRow>(
    'dictionary_terms',
    fetchTermRows,
  )
  const { data: categoryRows, mutate: refetchCategories } =
    useRealtimeTable<CategoryRow>('dictionary_categories', fetchCategoryRows)

  const terms: Term[] = useMemo(() => termRows.map(rowToTerm), [termRows])
  const categories = useMemo(
    () => categoryRows.map((c) => c.name),
    [categoryRows],
  )

  const kanaList = useMemo(() => [...terms].sort(byKana), [terms])

  const categoryGroups = useMemo(() => {
    const map = new Map<string, Term[]>()
    for (const t of terms) {
      const key = t.category.trim() || UNSET_CATEGORY
      const list = map.get(key) ?? []
      list.push(t)
      map.set(key, list)
    }
    return Array.from(map.entries())
      .map(([category, list]) => ({ category, terms: list.sort(byKana) }))
      .sort((a, b) => a.category.localeCompare(b.category, 'ja'))
  }, [terms])

  const termsInSelectedCategory = useMemo(
    () =>
      categoryGroups.find((g) => g.category === selectedCategory)?.terms ??
      [],
    [categoryGroups, selectedCategory],
  )

  const q = query.trim().toLowerCase()
  const searchResults = useMemo(() => {
    if (!q) return null
    return kanaList.filter(
      (t) =>
        t.term.toLowerCase().includes(q) ||
        t.reading.toLowerCase().includes(q) ||
        t.meaning.toLowerCase().includes(q) ||
        t.antonym.toLowerCase().includes(q) ||
        t.example.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    )
  }, [kanaList, q])

  const selectedTerm = useMemo(
    () => terms.find((t) => t.id === selectedTermId) ?? null,
    [terms, selectedTermId],
  )

  const screen: Screen = selectedTermId
    ? 'detail'
    : mode === 'category' && selectedCategory
      ? 'terms'
      : 'top'
  const showingSearch = screen === 'top' && q.length > 0
  useScrollToTop([screen])

  function closeForm() {
    setAdding(false)
    setEditingId(null)
    setForm(emptyForm())
  }

  function toggleMode() {
    setMode((m) => (m === 'kana' ? 'category' : 'kana'))
    setSelectedCategory(null)
    setSelectedTermId(null)
    closeForm()
  }

  function openCategory(category: string) {
    setSelectedCategory(category)
    setQuery('')
    closeForm()
  }

  function openTerm(id: string) {
    setSelectedTermId(id)
    setConfirmDeleteId(null)
    closeForm()
  }

  function backToTop() {
    setSelectedCategory(null)
    setSelectedTermId(null)
    setConfirmDeleteId(null)
    closeForm()
  }

  function backFromDetail() {
    setSelectedTermId(null)
    setConfirmDeleteId(null)
  }

  function startAdd() {
    setEditingId(null)
    setForm(emptyForm())
    setConfirmDeleteId(null)
    setAdding(true)
  }

  function startEdit(term: Term) {
    setEditingId(term.id)
    setForm({
      categorySelection: term.category,
      newCategory: '',
      term: term.term,
      reading: term.reading,
      meaning: term.meaning,
      antonym: term.antonym,
      example: term.example,
    })
    setConfirmDeleteId(null)
    setAdding(true)
  }

  const finalCategory =
    form.categorySelection === NEW_CATEGORY_VALUE
      ? form.newCategory.trim()
      : form.categorySelection
  const canSubmit = Boolean(form.term.trim() && finalCategory)

  async function submitTerm() {
    if (!canSubmit) return
    const supabase = createClient()
    const payload = {
      category: finalCategory,
      term: form.term.trim(),
      reading: form.reading.trim(),
      meaning: form.meaning.trim(),
      antonym: form.antonym.trim(),
      example: form.example.trim(),
    }
    if (editingId) {
      await supabase
        .from('dictionary_terms')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingId)
    } else {
      await supabase.from('dictionary_terms').insert(payload)
    }
    // Keep the dropdown's category list up to date for next time, without
    // erroring out if this name is already registered.
    await supabase
      .from('dictionary_categories')
      .upsert(
        { name: finalCategory, sort_order: categories.length },
        { onConflict: 'name', ignoreDuplicates: true },
      )
    await refetchTerms()
    await refetchCategories()
    closeForm()
  }

  async function deleteTerm(id: string) {
    const supabase = createClient()
    await supabase.from('dictionary_terms').delete().eq('id', id)
    await refetchTerms()
    setConfirmDeleteId(null)
    setSelectedTermId(null)
  }

  function renderForm() {
    return (
      <section className="flex flex-col gap-3 rounded-3xl border border-border bg-card px-5 py-5">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            カテゴリー
          </span>
          <select
            value={form.categorySelection}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                categorySelection: e.target.value,
                newCategory:
                  e.target.value === NEW_CATEGORY_VALUE ? p.newCategory : '',
              }))
            }
            className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
          >
            <option value="" disabled>
              カテゴリーを選択
            </option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value={NEW_CATEGORY_VALUE}>
              ＋ 新しいカテゴリーを追加
            </option>
          </select>
          {form.categorySelection === NEW_CATEGORY_VALUE && (
            <input
              type="text"
              value={form.newCategory}
              onChange={(e) =>
                setForm((p) => ({ ...p, newCategory: e.target.value }))
              }
              placeholder="新しいカテゴリー名"
              className="mt-1.5 w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
            />
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            単語（用語名）
          </span>
          <input
            type="text"
            value={form.term}
            onChange={(e) => setForm((p) => ({ ...p, term: e.target.value }))}
            className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            読みがな
          </span>
          <input
            type="text"
            value={form.reading}
            onChange={(e) =>
              setForm((p) => ({ ...p, reading: e.target.value }))
            }
            placeholder="ひらがなで入力（50音順の並びに使用）"
            className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            意味（概要）
          </span>
          <textarea
            value={form.meaning}
            onChange={(e) =>
              setForm((p) => ({ ...p, meaning: e.target.value }))
            }
            rows={2}
            className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            対義語（反対の意味の言葉）
          </span>
          <input
            type="text"
            value={form.antonym}
            onChange={(e) =>
              setForm((p) => ({ ...p, antonym: e.target.value }))
            }
            className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            例文（どのような時に使われるか）
          </span>
          <textarea
            value={form.example}
            onChange={(e) =>
              setForm((p) => ({ ...p, example: e.target.value }))
            }
            rows={2}
            className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
          />
        </label>
        <button
          type="button"
          onClick={submitTerm}
          disabled={!canSubmit}
          className="self-end rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          {editingId ? '更新' : '登録'}
        </button>
      </section>
    )
  }

  // Detail view: full information for a single term.
  if (screen === 'detail' && selectedTerm) {
    return (
      <div className="flex flex-col gap-4 pb-6">
        <button
          type="button"
          onClick={backFromDetail}
          className="flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          一覧へ戻る
        </button>

        {!partTimeMode && adding ? (
          renderForm()
        ) : (
          <section className="flex flex-col gap-4 rounded-3xl border border-border bg-card px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  {selectedTerm.category || UNSET_CATEGORY}
                </span>
                <h2 className="truncate text-xl font-bold text-foreground">
                  {selectedTerm.term}
                </h2>
                {selectedTerm.reading && (
                  <p className="text-sm text-muted-foreground">
                    {selectedTerm.reading}
                  </p>
                )}
              </div>
              {!partTimeMode && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(selectedTerm)}
                    aria-label="編集"
                    className="rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:text-foreground active:scale-90"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(selectedTerm.id)}
                    aria-label="削除"
                    className="rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:text-destructive active:scale-90"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>

            {!partTimeMode && confirmDeleteId === selectedTerm.id && (
              <ConfirmDeleteInline
                message="この単語を削除しますか？"
                onConfirm={() => deleteTerm(selectedTerm.id)}
                onCancel={() => setConfirmDeleteId(null)}
              />
            )}

            {selectedTerm.meaning && (
              <div className="rounded-2xl border border-border/60 bg-background px-4 py-3.5">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  意味
                </p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {selectedTerm.meaning}
                </p>
              </div>
            )}

            {selectedTerm.antonym && (
              <div className="rounded-2xl border border-border/60 bg-background px-4 py-3.5">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  対義語
                </p>
                <p className="text-sm leading-relaxed text-foreground">
                  {selectedTerm.antonym}
                </p>
              </div>
            )}

            {selectedTerm.example && (
              <div className="rounded-2xl border border-border/60 bg-background px-4 py-3.5">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  例文
                </p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {selectedTerm.example}
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    )
  }

  // Terms-in-category view (category display mode only).
  if (screen === 'terms' && selectedCategory) {
    return (
      <div className="flex flex-col gap-4 pb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={backToTop}
              aria-label="カテゴリー一覧に戻る"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-accent active:scale-90"
            >
              <ArrowLeft
                className="h-4 w-4 text-foreground"
                aria-hidden="true"
              />
            </button>
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                ドライバー語録
              </p>
              <h2 className="text-xl font-bold text-foreground">
                {selectedCategory}
              </h2>
            </div>
          </div>
          {!partTimeMode && (
            <button
              type="button"
              onClick={() => (adding ? closeForm() : startAdd())}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
            >
              {adding ? (
                <X className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              {adding ? '閉じる' : '登録'}
            </button>
          )}
        </div>

        {!partTimeMode && adding && renderForm()}

        {termsInSelectedCategory.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
            まだ登録がありません。
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {termsInSelectedCategory.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => openTerm(t.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:bg-accent active:scale-[0.99]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <Quote className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-base font-semibold text-foreground">
                        {t.term}
                      </span>
                      {t.reading && (
                        <span className="truncate text-xs text-muted-foreground">
                          {t.reading}
                        </span>
                      )}
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
        )}
      </div>
    )
  }

  // Top-level view: 50音順の一覧、カテゴリー一覧、または検索結果。
  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">
            ドライバー語録
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            業界用語、隠語を調べられるおもしろ辞典📖
          </p>
        </div>
        {!partTimeMode && (
          <button
            type="button"
            onClick={() => (adding ? closeForm() : startAdd())}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
          >
            {adding ? (
              <X className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            {adding ? '閉じる' : '登録'}
          </button>
        )}
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
          placeholder="単語・読みがな・意味などで検索"
          aria-label="ドライバー語録を検索"
          className="w-full rounded-2xl border border-border bg-card py-3 pl-11 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
        />
      </div>

      {!showingSearch && (
        <button
          type="button"
          onClick={toggleMode}
          className="flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-95"
        >
          {mode === 'kana' ? (
            <>
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
              カテゴリー表示に切り替え
            </>
          ) : (
            <>
              <SortAsc className="h-3.5 w-3.5" aria-hidden="true" />
              50音順表示に切り替え
            </>
          )}
        </button>
      )}

        {!partTimeMode && adding && renderForm()}

      {showingSearch ? (
        searchResults && searchResults.length > 0 ? (
          <ul className="flex flex-col gap-2.5">
            {searchResults.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => openTerm(t.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:bg-accent active:scale-[0.99]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <Quote className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="w-fit truncate rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                        {t.category.trim() || UNSET_CATEGORY}
                      </span>
                      <span className="truncate text-base font-semibold text-foreground">
                        {t.term}
                      </span>
                      {t.reading && (
                        <span className="truncate text-xs text-muted-foreground">
                          {t.reading}
                        </span>
                      )}
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
        ) : (
          <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
            一致する単語はありません。
          </p>
        )
      ) : mode === 'kana' ? (
        kanaList.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
            まだ登録がありません。
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {kanaList.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => openTerm(t.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:bg-accent active:scale-[0.99]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <Quote className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-base font-semibold text-foreground">
                        {t.term}
                      </span>
                      {t.reading && (
                        <span className="truncate text-xs text-muted-foreground">
                          {t.reading}
                        </span>
                      )}
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
      ) : categoryGroups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
          まだ登録がありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {categoryGroups.map((group) => (
            <li key={group.category}>
              <button
                type="button"
                onClick={() => openCategory(group.category)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:border-primary/60 hover:bg-accent active:scale-[0.99]"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <FolderOpen className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-base font-semibold text-foreground">
                      {group.category}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {group.terms.length}件
                    </span>
                  </span>
                </span>
                <ChevronRight
                  className="h-5 w-5 text-muted-foreground"
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
