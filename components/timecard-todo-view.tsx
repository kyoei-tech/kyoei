'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import {
  ArrowLeft,
  ChevronDown,
  ClipboardList,
  ImagePlus,
  Pencil,
  Plus,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { useSettings } from '@/lib/settings/settings-context'
import { NOTIFICATION_MARKUP_HELP } from '@/lib/notifications/notification-style'
import { StyledNotificationText } from './styled-notification-text'
import { ConfirmDeleteInline, DeleteIconButton } from './confirm-delete'
import { usePasswordGate } from './password-prompt'

type TodoItem = {
  id: string
  title: string
  body: string
  imageUrl: string | null
  createdAt: number
}

// Shared across every browser via the `timecard_todo_items` table.
type TodoRow = {
  id: string
  title: string
  body: string
  image_url: string | null
  created_at: string
}

function rowToTodo(r: TodoRow): TodoItem {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    imageUrl: r.image_url,
    createdAt: new Date(r.created_at).getTime(),
  }
}

async function fetchTodoRows(): Promise<TodoRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('timecard_todo_items')
    .select('id, title, body, image_url, created_at')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as TodoRow[]) ?? []
}

function emptyForm() {
  return { title: '', body: '', imageUrl: '' }
}

/**
 * 「やること」ページ — タイムカードモードの勤務状況ページから開く、共有のやる
 * べきことリスト。Q&A方式（タイトルをタップして本文を開閉）で、本文は
 * push通知と同じ太字/色マークアップ記法（**太字** ;;赤;; ::オレンジ:: ##緑##）
 * に対応する。追加・編集・削除は社員モード（!partTimeMode）でのみボタンが
 * 現れ、実行前に共通の4桁パスワード（2486）で保護される。
 */
export function TodoView({ onBack }: { onBack: () => void }) {
  const { partTimeMode } = useSettings()
  const { guard, prompt } = usePasswordGate('2486')

  const { data: rows, mutate: refetch } = useRealtimeTable<TodoRow>(
    'timecard_todo_items',
    fetchTodoRows,
  )
  const items: TodoItem[] = useMemo(() => rows.map(rowToTodo), [rows])

  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  function toggleOpen(id: string) {
    setOpenId((prev) => (prev === id ? null : id))
  }

  function startAdd() {
    guard(() => {
      setForm(emptyForm())
      setAdding(true)
    })
  }

  async function submitAdd() {
    const title = form.title.trim()
    if (!title) return
    const supabase = createClient()
    await supabase.from('timecard_todo_items').insert({
      title,
      body: form.body.trim(),
      image_url: form.imageUrl.trim() || null,
    })
    await refetch()
    setForm(emptyForm())
    setAdding(false)
  }

  function startEdit(item: TodoItem) {
    guard(() => {
      setEditForm({
        title: item.title,
        body: item.body,
        imageUrl: item.imageUrl ?? '',
      })
      setEditingId(item.id)
    })
  }

  async function submitEdit() {
    if (!editingId) return
    const title = editForm.title.trim()
    if (!title) return
    const supabase = createClient()
    await supabase
      .from('timecard_todo_items')
      .update({
        title,
        body: editForm.body.trim(),
        image_url: editForm.imageUrl.trim() || null,
      })
      .eq('id', editingId)
    await refetch()
    setEditingId(null)
  }

  function startDelete(id: string) {
    guard(() => setConfirmDeleteId(id))
  }

  async function confirmDelete(id: string) {
    const supabase = createClient()
    await supabase.from('timecard_todo_items').delete().eq('id', id)
    await refetch()
    setConfirmDeleteId(null)
    if (openId === id) setOpenId(null)
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-95"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        戻る
      </button>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">やること</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            タイトルをタップすると詳しい内容を確認できます。
          </p>
        </div>
        {!partTimeMode && (
          <button
            type="button"
            onClick={() => {
              if (adding) {
                setAdding(false)
                return
              }
              startAdd()
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
          >
            {adding ? (
              <X className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            {adding ? '閉じる' : '追加'}
          </button>
        )}
      </div>

      {!partTimeMode && adding && (
        <section className="flex flex-col gap-3 rounded-3xl border border-border bg-card px-5 py-5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              タイトル
            </span>
            <input
              type="text"
              value={form.title}
              onChange={(e) =>
                setForm((p) => ({ ...p, title: e.target.value }))
              }
              placeholder="一覧に表示される短い見出し"
              className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              内容
            </span>
            <textarea
              value={form.body}
              onChange={(e) =>
                setForm((p) => ({ ...p, body: e.target.value }))
              }
              rows={4}
              placeholder="タップして開いたときに表示される本文"
              className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
            />
            <p className="text-[0.65rem] leading-relaxed text-muted-foreground">
              {NOTIFICATION_MARKUP_HELP}
            </p>
          </label>
          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
              画像URL（任意）
            </span>
            <input
              type="text"
              value={form.imageUrl}
              onChange={(e) =>
                setForm((p) => ({ ...p, imageUrl: e.target.value }))
              }
              placeholder="/images/... または https://..."
              className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
            />
          </label>
          {form.imageUrl.trim() && (
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-background">
              <Image
                src={form.imageUrl.trim() || '/placeholder.svg'}
                alt="添付画像プレビュー"
                width={640}
                height={480}
                className="h-auto w-full object-contain"
                unoptimized
              />
            </div>
          )}
          <button
            type="button"
            onClick={submitAdd}
            disabled={!form.title.trim()}
            className="self-end rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
          >
            追加する
          </button>
        </section>
      )}

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
          まだ登録されていません。
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((item) => {
            const isOpen = openId === item.id
            const isEditing = editingId === item.id
            return (
              <li
                key={item.id}
                className={`rounded-2xl border bg-card px-5 py-4 ${
                  isOpen || isEditing ? 'border-primary/50' : 'border-border'
                }`}
              >
                {isEditing ? (
                  <div className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        タイトル
                      </span>
                      <input
                        type="text"
                        value={editForm.title}
                        onChange={(e) =>
                          setEditForm((p) => ({
                            ...p,
                            title: e.target.value,
                          }))
                        }
                        autoFocus
                        className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        内容
                      </span>
                      <textarea
                        value={editForm.body}
                        onChange={(e) =>
                          setEditForm((p) => ({
                            ...p,
                            body: e.target.value,
                          }))
                        }
                        rows={4}
                        className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
                      />
                      <p className="text-[0.65rem] leading-relaxed text-muted-foreground">
                        {NOTIFICATION_MARKUP_HELP}
                      </p>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                        <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                        画像URL（任意）
                      </span>
                      <input
                        type="text"
                        value={editForm.imageUrl}
                        onChange={(e) =>
                          setEditForm((p) => ({
                            ...p,
                            imageUrl: e.target.value,
                          }))
                        }
                        placeholder="/images/... または https://..."
                        className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
                      />
                    </label>
                    {(editForm.body || editForm.imageUrl.trim()) && (
                      <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
                        <p className="text-[0.65rem] font-semibold text-muted-foreground">
                          プレビュー
                        </p>
                        {editForm.body && (
                          <StyledNotificationText
                            text={editForm.body}
                            className="mt-1 block whitespace-pre-line text-sm leading-relaxed text-foreground"
                          />
                        )}
                        {editForm.imageUrl.trim() && (
                          <div className="mt-2 overflow-hidden rounded-xl border border-border/60">
                            <Image
                              src={editForm.imageUrl.trim() || '/placeholder.svg'}
                              alt="添付画像プレビュー"
                              width={640}
                              height={480}
                              className="h-auto w-full object-contain"
                              unoptimized
                            />
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="flex-1 rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-95"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={submitEdit}
                        disabled={!editForm.title.trim()}
                        className="flex-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleOpen(item.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                          <ClipboardList
                            className="h-4.5 w-4.5"
                            aria-hidden="true"
                          />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                          {item.title}
                        </span>
                        <ChevronDown
                          className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                          aria-hidden="true"
                        />
                      </button>
                      {!partTimeMode && (
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            aria-label="編集する"
                            className="rounded-lg p-1 text-muted-foreground/50 transition-colors hover:text-primary active:scale-90"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <DeleteIconButton
                            onClick={() => startDelete(item.id)}
                            label="削除する"
                          />
                        </div>
                      )}
                    </div>

                    {isOpen && (item.body || item.imageUrl) && (
                      <div className="mt-3 flex flex-col gap-3 pl-12">
                        {item.body && (
                          <StyledNotificationText
                            text={item.body}
                            className="block whitespace-pre-line text-sm leading-relaxed text-foreground"
                          />
                        )}
                        {item.imageUrl && (
                          <div className="overflow-hidden rounded-2xl border border-border">
                            <Image
                              src={item.imageUrl || '/placeholder.svg'}
                              alt={item.title}
                              width={960}
                              height={720}
                              className="h-auto w-full object-contain"
                              unoptimized
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {confirmDeleteId === item.id && (
                      <div className="mt-3">
                        <ConfirmDeleteInline
                          message="この項目を削除しますか？"
                          onConfirm={() => confirmDelete(item.id)}
                          onCancel={() => setConfirmDeleteId(null)}
                        />
                      </div>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {prompt}
    </div>
  )
}
