'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight, Pencil, Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { ConfirmDeleteInline } from './confirm-delete'

// Shared across every browser via the `beginner_notes` Supabase table.
type NoteRow = {
  id: string
  title: string
  body: string
  created_at: string
}

async function fetchNoteRows(): Promise<NoteRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('beginner_notes')
    .select('id, title, body, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as NoteRow[]) ?? []
}

function emptyForm() {
  return { title: '', body: '' }
}

export function BeginnerNotesView() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const { data: rows, mutate: refetch } = useRealtimeTable<NoteRow>(
    'beginner_notes',
    fetchNoteRows,
  )

  const notes = useMemo(() => rows, [rows])
  const selected = notes.find((n) => n.id === selectedId) ?? null

  function openAdd() {
    setForm(emptyForm())
    setEditingId(null)
    setAdding(true)
  }

  function openEdit(note: NoteRow) {
    setForm({ title: note.title, body: note.body })
    setEditingId(note.id)
    setAdding(true)
  }

  function closeForm() {
    setAdding(false)
    setEditingId(null)
    setForm(emptyForm())
  }

  async function saveNote() {
    const title = form.title.trim()
    if (!title) return
    const supabase = createClient()
    const payload = { title, body: form.body.trim() }
    if (editingId) {
      await supabase.from('beginner_notes').update(payload).eq('id', editingId)
    } else {
      await supabase.from('beginner_notes').insert(payload)
    }
    await refetch()
    closeForm()
  }

  async function deleteNote(id: string) {
    const supabase = createClient()
    await supabase.from('beginner_notes').delete().eq('id', id)
    await refetch()
    setConfirmDeleteId(false)
    setSelectedId(null)
  }

  if (selected) {
    return (
      <div className="flex flex-col gap-4 pb-6">
        <button
          type="button"
          onClick={() => {
            setSelectedId(null)
            setConfirmDeleteId(false)
          }}
          className="flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          一覧へ戻る
        </button>
        <section className="rounded-2xl border border-border bg-card px-5 py-5">
          <h3 className="text-base font-bold text-foreground">
            {selected.title}
          </h3>
          {selected.body && (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {selected.body}
            </p>
          )}
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
          {confirmDeleteId && (
            <div className="mt-3">
              <ConfirmDeleteInline
                onConfirm={() => deleteNote(selected.id)}
                onCancel={() => setConfirmDeleteId(false)}
              />
            </div>
          )}
        </section>

        {adding && (
          <NoteForm
            form={form}
            setForm={setForm}
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
      </div>

      {adding && (
        <NoteForm form={form} setForm={setForm} onSave={saveNote} onCancel={closeForm} />
      )}

      {notes.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
          まだノートがありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {notes.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => setSelectedId(note.id)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:bg-accent active:scale-[0.99]"
              >
                <span className="truncate text-sm font-semibold text-foreground">
                  {note.title}
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

function NoteForm({
  form,
  setForm,
  onSave,
  onCancel,
  isEditing,
}: {
  form: { title: string; body: string }
  setForm: (updater: (p: { title: string; body: string }) => {
    title: string
    body: string
  }) => void
  onSave: () => void
  onCancel: () => void
  isEditing?: boolean
}) {
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
          disabled={!form.title.trim()}
          className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          保存
        </button>
      </div>
    </section>
  )
}
