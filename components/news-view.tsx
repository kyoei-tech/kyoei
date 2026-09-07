'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ChevronRight,
  History,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'

type NewsPost = {
  id: string
  title: string
  category: string
  content: string
  author: string
  createdAt: number
}

type ViewMode = 'list' | 'detail' | 'create' | 'manage'

const STORAGE_KEY = 'kyoei-news-posts'

function loadPosts(): NewsPost[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function emptyForm() {
  return { title: '', category: '', content: '', author: '' }
}

export function NewsView() {
  const [posts, setPosts] = useState<NewsPost[]>([])
  const [loaded, setLoaded] = useState(false)
  const [view, setView] = useState<ViewMode>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())

  useEffect(() => {
    setPosts(loadPosts())
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(posts))
  }, [posts, loaded])

  const sorted = useMemo(
    () => [...posts].sort((a, b) => b.createdAt - a.createdAt),
    [posts],
  )
  const selected = posts.find((p) => p.id === selectedId) ?? null

  function openDetail(id: string) {
    setSelectedId(id)
    setView('detail')
  }

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm())
    setView('create')
  }

  function openEdit(post: NewsPost) {
    setEditingId(post.id)
    setForm({
      title: post.title,
      category: post.category,
      content: post.content,
      author: post.author,
    })
    setConfirmDeleteId(null)
    setView('create')
  }

  function savePost() {
    const trimmed = {
      title: form.title.trim(),
      category: form.category.trim(),
      content: form.content.trim(),
      author: form.author.trim(),
    }
    if (!trimmed.title) return
    if (editingId) {
      setPosts((prev) =>
        prev.map((p) => (p.id === editingId ? { ...p, ...trimmed } : p)),
      )
    } else {
      setPosts((prev) => [
        ...prev,
        { id: `${Date.now()}`, ...trimmed, createdAt: Date.now() },
      ])
    }
    setEditingId(null)
    setForm(emptyForm())
    setView('list')
  }

  function deletePost(id: string) {
    setPosts((prev) => prev.filter((p) => p.id !== id))
    setConfirmDeleteId(null)
    if (selectedId === id) setSelectedId(null)
  }

  if (view === 'detail' && selected) {
    return (
      <div className="flex flex-col gap-5 pb-6">
        <button
          type="button"
          onClick={() => setView('list')}
          className="flex items-center gap-1.5 self-start text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          一覧へ戻る
        </button>
        <div className="rounded-2xl border border-border bg-card px-5 py-6">
          <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
            {selected.content || '内容はありません。'}
          </p>
        </div>
      </div>
    )
  }

  if (view === 'create') {
    return (
      <div className="flex flex-col gap-5 pb-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setView('list')}
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            戻る
          </button>
          <button
            type="button"
            onClick={() => setView('manage')}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            過去の投稿を編集
          </button>
        </div>

        <h2 className="text-xl font-bold text-foreground">
          {editingId ? 'おしらせを編集' : '新しいおしらせ'}
        </h2>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              タイトル
            </span>
            <input
              type="text"
              value={form.title}
              onChange={(e) =>
                setForm((p) => ({ ...p, title: e.target.value }))
              }
              className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              カテゴリー
            </span>
            <input
              type="text"
              value={form.category}
              onChange={(e) =>
                setForm((p) => ({ ...p, category: e.target.value }))
              }
              className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              内容
            </span>
            <textarea
              value={form.content}
              onChange={(e) =>
                setForm((p) => ({ ...p, content: e.target.value }))
              }
              rows={6}
              className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              投稿者名
            </span>
            <input
              type="text"
              value={form.author}
              onChange={(e) =>
                setForm((p) => ({ ...p, author: e.target.value }))
              }
              className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={savePost}
          disabled={!form.title.trim()}
          className="self-end rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          {editingId ? '更新する' : '投稿する'}
        </button>
      </div>
    )
  }

  if (view === 'manage') {
    return (
      <div className="flex flex-col gap-4 pb-6">
        <button
          type="button"
          onClick={() => setView('create')}
          className="flex items-center gap-1.5 self-start text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          戻る
        </button>
        <h2 className="text-xl font-bold text-foreground">
          過去の投稿を編集
        </h2>
        {sorted.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
            まだ投稿がありません。
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {sorted.map((p) => (
              <li
                key={p.id}
                className="rounded-2xl border border-border bg-card px-4 py-3.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {p.title}
                  </span>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      aria-label={`${p.title}を編集`}
                      className="rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:text-foreground active:scale-90"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(p.id)}
                      aria-label={`${p.title}を削除`}
                      className="rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:text-destructive active:scale-90"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {confirmDeleteId === p.id && (
                  <div className="mt-3 flex flex-col gap-2.5 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3">
                    <p className="text-sm font-medium text-foreground">
                      本当に削除しますか？
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => deletePost(p.id)}
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
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">おしらせ</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            新しい投稿から順に表示されます。
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          投稿
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
          まだおしらせはありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {sorted.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => openDetail(p.id)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:border-primary/60 hover:bg-accent active:scale-[0.99]"
              >
                <span className="truncate text-base font-semibold text-foreground">
                  {p.title}
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
