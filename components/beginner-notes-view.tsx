'use client'

import { useMemo, useState } from 'react'
import {
  ChevronRight,
  ImagePlus,
  LayoutList,
  Pencil,
  Plus,
  Tags,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { ConfirmDeleteInline } from './confirm-delete'
import { BackHeader } from './back-header'
import { useSettings } from '@/lib/settings/settings-context'
import { useScrollToTop } from '@/lib/use-scroll-to-top'

const UNCATEGORIZED = '未分類'
const MAX_IMAGES = 6

// Shared across every browser via the `beginner_notes` Supabase table.
type NoteRow = {
  id: string
  title: string
  body: string
  category: string
  image_paths: string[]
  created_at: string
}

async function fetchNoteRows(): Promise<NoteRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('beginner_notes')
    .select('id, title, body, category, image_paths, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as NoteRow[]) ?? []
}

function emptyForm() {
  return { title: '', body: '', category: '' }
}

function imageUrl(pathname: string): string {
  return `/api/beginner-notes/file?pathname=${encodeURIComponent(pathname)}`
}

async function uploadImage(file: File): Promise<string> {
  const res = await fetch('/api/beginner-notes/upload', {
    method: 'POST',
    headers: {
      'x-filename': encodeURIComponent(file.name),
      'content-type': file.type || 'application/octet-stream',
    },
    body: file,
  })
  if (!res.ok) throw new Error('upload failed')
  const data = await res.json()
  return data.pathname as string
}

async function deleteImage(pathname: string): Promise<void> {
  await fetch(`/api/beginner-notes/file?pathname=${encodeURIComponent(pathname)}`, {
    method: 'DELETE',
  }).catch(() => {})
}

type ViewMode = 'list' | 'category'

export function BeginnerNotesView() {
  const { partTimeMode } = useSettings()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  useScrollToTop([selectedId])
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const { data: rows, mutate: refetch } = useRealtimeTable<NoteRow>(
    'beginner_notes',
    fetchNoteRows,
  )

  const notes = useMemo(() => rows, [rows])
  const selected = notes.find((n) => n.id === selectedId) ?? null

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const n of notes) set.add(n.category || UNCATEGORIZED)
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'))
  }, [notes])

  const notesByCategory = useMemo(() => {
    const map: Record<string, NoteRow[]> = {}
    for (const n of notes) {
      const key = n.category || UNCATEGORIZED
      if (!map[key]) map[key] = []
      map[key].push(n)
    }
    return map
  }, [notes])

  function openAdd() {
    setForm(emptyForm())
    setPendingImages([])
    setEditingId(null)
    setAdding(true)
  }

  function openEdit(note: NoteRow) {
    setForm({ title: note.title, body: note.body, category: note.category })
    setPendingImages(note.image_paths ?? [])
    setEditingId(note.id)
    setAdding(true)
  }

  function closeForm() {
    setAdding(false)
    setEditingId(null)
    setForm(emptyForm())
    setPendingImages([])
  }

  async function handleAddImages(files: FileList | null) {
    if (!files || files.length === 0) return
    const room = MAX_IMAGES - pendingImages.length
    const toUpload = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, Math.max(room, 0))
    if (toUpload.length === 0) return
    setUploading(true)
    try {
      const pathnames = await Promise.all(toUpload.map(uploadImage))
      setPendingImages((prev) => [...prev, ...pathnames])
    } catch {
      // Silently ignore failed uploads; user can retry.
    } finally {
      setUploading(false)
    }
  }

  function removePendingImage(pathname: string) {
    setPendingImages((prev) => prev.filter((p) => p !== pathname))
    // Only delete from Blob storage immediately if this note isn't saved
    // yet with this image; for an existing note, the blob is only removed
    // once the user saves (see saveNote), so a cancel leaves it intact.
  }

  async function saveNote() {
    const title = form.title.trim()
    if (!title) return
    const supabase = createClient()
    const category = form.category.trim() || UNCATEGORIZED
    const payload = {
      title,
      body: form.body.trim(),
      category,
      image_paths: pendingImages,
    }
    if (editingId) {
      const previous = notes.find((n) => n.id === editingId)
      const removed = (previous?.image_paths ?? []).filter(
        (p) => !pendingImages.includes(p),
      )
      await supabase.from('beginner_notes').update(payload).eq('id', editingId)
      await Promise.all(removed.map(deleteImage))
    } else {
      await supabase.from('beginner_notes').insert(payload)
    }
    await refetch()
    closeForm()
  }

  async function deleteNote(note: NoteRow) {
    const supabase = createClient()
    await supabase.from('beginner_notes').delete().eq('id', note.id)
    await Promise.all((note.image_paths ?? []).map(deleteImage))
    await refetch()
    setConfirmDeleteId(false)
    setSelectedId(null)
  }

  if (selected) {
    return (
      <div className="flex flex-col gap-4 pb-6">
        <BackHeader
          onBack={() => {
            setSelectedId(null)
            setConfirmDeleteId(false)
          }}
          label="一覧へ戻る"
          variant="subtle"
        />
        <section className="rounded-2xl border border-border bg-card px-5 py-5">
          <span className="inline-flex items-center rounded-full bg-secondary/10 px-2.5 py-0.5 text-xs font-semibold text-secondary">
            {selected.category || UNCATEGORIZED}
          </span>
          <h3 className="mt-2 text-base font-bold text-foreground">
            {selected.title}
          </h3>
          {selected.body && (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {selected.body}
            </p>
          )}
          {selected.image_paths && selected.image_paths.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {selected.image_paths.map((p) => (
                <img
                  key={p}
                  src={imageUrl(p) || '/placeholder.svg'}
                  alt={`${selected.title}の添付画像`}
                  crossOrigin="anonymous"
                  className="aspect-square w-full rounded-xl border border-border object-cover"
                />
              ))}
            </div>
          )}
          {!partTimeMode && (
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => openEdit(selected)}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                編集
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteId(true)}
                className="text-xs font-medium text-muted-foreground/70 transition-colors hover:text-destructive"
              >
                削除
              </button>
            </div>
          )}
          {!partTimeMode && confirmDeleteId && (
            <div className="mt-3">
              <ConfirmDeleteInline
                onConfirm={() => deleteNote(selected)}
                onCancel={() => setConfirmDeleteId(false)}
              />
            </div>
          )}
        </section>

        {!partTimeMode && adding && (
          <NoteForm
            form={form}
            setForm={setForm}
            categories={categories}
            pendingImages={pendingImages}
            uploading={uploading}
            onAddImages={handleAddImages}
            onRemoveImage={removePendingImage}
            onSave={saveNote}
            onCancel={closeForm}
            isEditing
          />
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">初心者ノート</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            新人向けのメモや手順をまとめて共有できます。
          </p>
        </div>
        {!partTimeMode && (
          <button
            type="button"
            onClick={() => {
              if (adding) {
                closeForm()
              } else {
                openAdd()
              }
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
          >
            {adding ? (
              <X className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            {adding ? '閉じる' : 'ノートを追加'}
          </button>
        )}
      </div>

      {!partTimeMode && adding && (
        <NoteForm
          form={form}
          setForm={setForm}
          categories={categories}
          pendingImages={pendingImages}
          uploading={uploading}
          onAddImages={handleAddImages}
          onRemoveImage={removePendingImage}
          onSave={saveNote}
          onCancel={closeForm}
        />
      )}

      {notes.length > 0 && (
        <div className="flex items-center gap-1 rounded-full bg-muted p-1 text-sm">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 font-semibold transition-colors ${
              viewMode === 'list'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground'
            }`}
          >
            <LayoutList className="h-4 w-4" aria-hidden="true" />
            一覧
          </button>
          <button
            type="button"
            onClick={() => setViewMode('category')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 font-semibold transition-colors ${
              viewMode === 'category'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground'
            }`}
          >
            <Tags className="h-4 w-4" aria-hidden="true" />
            カテゴリ
          </button>
        </div>
      )}

      {notes.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
          まだノートがありません。
        </p>
      ) : viewMode === 'list' ? (
        <NoteList notes={notes} onSelect={setSelectedId} />
      ) : activeCategory ? (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className="self-start text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            ← カテゴリ一覧へ戻る
          </button>
          <NoteList
            notes={notesByCategory[activeCategory] ?? []}
            onSelect={setSelectedId}
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {categories.map((cat) => (
            <li key={cat}>
              <button
                type="button"
                onClick={() => setActiveCategory(cat)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:bg-accent active:scale-[0.99]"
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {cat}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {notesByCategory[cat]?.length ?? 0}件
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

function NoteList({
  notes,
  onSelect,
}: {
  notes: NoteRow[]
  onSelect: (id: string) => void
}) {
  return (
    <ul className="flex flex-col gap-2.5">
      {notes.map((note) => (
        <li key={note.id}>
          <button
            type="button"
            onClick={() => onSelect(note.id)}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:bg-accent active:scale-[0.99]"
          >
            {note.image_paths && note.image_paths.length > 0 ? (
              <img
                src={imageUrl(note.image_paths[0]) || '/placeholder.svg'}
                alt=""
                crossOrigin="anonymous"
                className="h-11 w-11 shrink-0 rounded-lg border border-border object-cover"
              />
            ) : null}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold text-foreground">
                {note.title}
              </span>
              <span className="mt-0.5 text-xs text-muted-foreground">
                {note.category || UNCATEGORIZED}
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
}

function NoteForm({
  form,
  setForm,
  categories,
  pendingImages,
  uploading,
  onAddImages,
  onRemoveImage,
  onSave,
  onCancel,
  isEditing,
}: {
  form: { title: string; body: string; category: string }
  setForm: (
    updater: (p: { title: string; body: string; category: string }) => {
      title: string
      body: string
      category: string
    },
  ) => void
  categories: string[]
  pendingImages: string[]
  uploading: boolean
  onAddImages: (files: FileList | null) => void
  onRemoveImage: (pathname: string) => void
  onSave: () => void
  onCancel: () => void
  isEditing?: boolean
}) {
  const inputId = isEditing ? 'note-images-edit' : 'note-images-add'

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-5">
      <h3 className="text-sm font-bold text-foreground">
        {isEditing ? 'ノートを編集' : 'ノートを追加'}
      </h3>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          タイトル
        </span>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          placeholder="例：出庫前の点検手順"
          className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          カテゴリ
        </span>
        <input
          type="text"
          list="beginner-note-categories"
          value={form.category}
          onChange={(e) =>
            setForm((p) => ({ ...p, category: e.target.value }))
          }
          placeholder={UNCATEGORIZED}
          className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
        />
        <datalist id="beginner-note-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          内容
        </span>
        <textarea
          value={form.body}
          onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
          rows={5}
          placeholder="内容を入力してください"
          className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          画像（最大{MAX_IMAGES}枚）
        </span>
        <div className="flex flex-wrap gap-2">
          {pendingImages.map((p) => (
            <div
              key={p}
              className="relative h-16 w-16 overflow-hidden rounded-xl border border-border"
            >
              <img
                src={imageUrl(p) || '/placeholder.svg'}
                alt=""
                crossOrigin="anonymous"
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => onRemoveImage(p)}
                aria-label="画像を削除"
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground/70 text-background transition-colors hover:bg-destructive"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          ))}
          {pendingImages.length < MAX_IMAGES && (
            <label
              htmlFor={inputId}
              className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
            >
              <ImagePlus className="h-5 w-5" aria-hidden="true" />
              <span className="text-[10px]">
                {uploading ? '送信中…' : '追加'}
              </span>
              <input
                id={inputId}
                type="file"
                accept="image/*"
                multiple
                disabled={uploading}
                onChange={(e) => {
                  onAddImages(e.target.files)
                  e.target.value = ''
                }}
                className="sr-only"
              />
            </label>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-95"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!form.title.trim() || uploading}
          className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          保存
        </button>
      </div>
    </section>
  )
}
