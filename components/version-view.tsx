'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  EyeOff,
  Eye,
  X,
} from 'lucide-react'
import { type ChangeKind } from '@/lib/changelog'
import { usePasswordGate } from '@/components/password-prompt'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'

const EDIT_PIN = '0525'

const KIND_OPTIONS: ChangeKind[] = ['追加', '変更', '削除']

// Persisted in the `changelog_entries` table so edits/hides/deletes survive
// reloads and stay in sync across every browser, instead of living only in
// local component state.
type ChangelogRow = {
  id: string
  version: string
  version_date: string
  page: string
  kind: ChangeKind
  description: string
  hidden: boolean
  version_order: number
  entry_order: number
}

type GroupedVersion = {
  version: string
  date: string
  versionOrder: number
  entries: ChangelogRow[]
}

async function fetchChangelogEntries(): Promise<ChangelogRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('changelog_entries')
    .select(
      'id, version, version_date, page, kind, description, hidden, version_order, entry_order',
    )
    .order('version_order', { ascending: true })
    .order('entry_order', { ascending: true })
  if (error) throw error
  return (data as ChangelogRow[]) ?? []
}

function groupByVersion(rows: ChangelogRow[]): GroupedVersion[] {
  const map = new Map<number, GroupedVersion>()
  for (const row of rows) {
    const existing = map.get(row.version_order)
    if (existing) {
      existing.entries.push(row)
    } else {
      map.set(row.version_order, {
        version: row.version,
        date: row.version_date,
        versionOrder: row.version_order,
        entries: [row],
      })
    }
  }
  return [...map.values()].sort((a, b) => a.versionOrder - b.versionOrder)
}

function kindStyle(kind: ChangeKind) {
  switch (kind) {
    case '追加':
      return { Icon: Plus, className: 'bg-secondary/15 text-secondary' }
    case '変更':
      return { Icon: Pencil, className: 'bg-primary/15 text-primary' }
    case '削除':
      return {
        Icon: Trash2,
        className: 'bg-destructive/15 text-destructive',
      }
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function VersionView() {
  const { data: rows, isLoading, mutate } = useRealtimeTable(
    'changelog_entries',
    fetchChangelogEntries,
  )
  const versions = groupByVersion(rows)

  const [openVersion, setOpenVersion] = useState<string | null>(null)
  const openVersionInit = useRef(false)
  useEffect(() => {
    if (!openVersionInit.current && versions.length > 0) {
      setOpenVersion(versions[0].version)
      openVersionInit.current = true
    }
  }, [versions])

  const [menuId, setMenuId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{
    page: string
    kind: ChangeKind
    description: string
  }>({ page: '', kind: '追加', description: '' })
  const { guard, prompt } = usePasswordGate(EDIT_PIN)

  function openMenu(row: ChangelogRow) {
    guard(() => setMenuId(row.id))
  }

  function startEdit(row: ChangelogRow) {
    setEditForm({
      page: row.page,
      kind: row.kind,
      description: row.description,
    })
    setEditingId(row.id)
    setMenuId(null)
  }

  async function saveEdit(row: ChangelogRow) {
    const supabase = createClient()
    const page = editForm.page.trim() || row.page
    const description = editForm.description.trim() || row.description
    const { error } = await supabase
      .from('changelog_entries')
      .update({ page, kind: editForm.kind, description })
      .eq('id', row.id)
    if (!error) setEditingId(null)
    await mutate()
  }

  async function hideEntry(id: string) {
    const supabase = createClient()
    await supabase
      .from('changelog_entries')
      .update({ hidden: true })
      .eq('id', id)
    await mutate()
  }

  async function restoreEntry(id: string) {
    const supabase = createClient()
    await supabase
      .from('changelog_entries')
      .update({ hidden: false })
      .eq('id', id)
    await mutate()
  }

  async function deleteEntry(id: string) {
    const supabase = createClient()
    await supabase.from('changelog_entries').delete().eq('id', id)
    await mutate()
  }

  const hiddenEntries = rows.filter((r) => r.hidden)
  const menuEntry = menuId ? rows.find((r) => r.id === menuId) : undefined

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Version</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          これまでの更新内容を日付順に確認できます。各項目の編集ボタンから削除・非表示・編集を行えます（暗証番号が必要です）。
        </p>
      </div>

      {isLoading && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">読み込み中です…</p>
      )}

      <ul className="flex flex-col gap-3">
        {versions.map((v, idx) => {
          const isOpen =
            openVersion !== null ? openVersion === v.version : idx === 0
          const isLatest = idx === 0
          const visibleEntries = v.entries.filter((e) => !e.hidden)
          return (
            <li
              key={v.version}
              className="overflow-hidden rounded-2xl border border-border bg-card"
            >
              <button
                type="button"
                onClick={() =>
                  setOpenVersion((cur) => {
                    const currentlyOpen =
                      cur !== null ? cur === v.version : idx === 0
                    return currentlyOpen ? '' : v.version
                  })
                }
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-accent active:scale-[0.99]"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="text-base font-bold text-foreground">
                      Version {v.version}
                    </span>
                    {isLatest && (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[0.65rem] font-bold text-primary">
                        最新
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(v.date)}
                  </span>
                </span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>

              {isOpen && (
                <ul className="flex flex-col gap-2 border-t border-border px-5 py-4">
                  {visibleEntries.length === 0 && (
                    <li className="rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm text-muted-foreground">
                      表示できる項目はありません（非表示にした項目のみ）。
                    </li>
                  )}
                  {visibleEntries.map((entry) => {
                    const { Icon, className } = kindStyle(entry.kind)

                    if (editingId === entry.id) {
                      return (
                        <li
                          key={entry.id}
                          className="rounded-xl border border-primary/60 bg-background px-3 py-3"
                        >
                          <div className="flex flex-col gap-2">
                            <label className="flex flex-col gap-1">
                              <span className="text-[0.65rem] font-semibold text-muted-foreground">
                                ページ
                              </span>
                              <input
                                type="text"
                                value={editForm.page}
                                onChange={(ev) =>
                                  setEditForm((f) => ({
                                    ...f,
                                    page: ev.target.value,
                                  }))
                                }
                                className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
                              />
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="text-[0.65rem] font-semibold text-muted-foreground">
                                種類
                              </span>
                              <select
                                value={editForm.kind}
                                onChange={(ev) =>
                                  setEditForm((f) => ({
                                    ...f,
                                    kind: ev.target.value as ChangeKind,
                                  }))
                                }
                                className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
                              >
                                {KIND_OPTIONS.map((k) => (
                                  <option key={k} value={k}>
                                    {k}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="text-[0.65rem] font-semibold text-muted-foreground">
                                内容
                              </span>
                              <textarea
                                value={editForm.description}
                                onChange={(ev) =>
                                  setEditForm((f) => ({
                                    ...f,
                                    description: ev.target.value,
                                  }))
                                }
                                rows={3}
                                className="resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm leading-relaxed text-foreground outline-none focus:border-primary/60"
                              />
                            </label>
                            <div className="mt-1 flex gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="flex-1 rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-95"
                              >
                                キャンセル
                              </button>
                              <button
                                type="button"
                                onClick={() => saveEdit(entry)}
                                className="flex-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
                              >
                                保存
                              </button>
                            </div>
                          </div>
                        </li>
                      )
                    }

                    return (
                      <li key={entry.id}>
                        <div className="flex w-full items-start gap-2.5 rounded-xl border border-border/60 bg-background px-3 py-2.5">
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${className}`}
                          >
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                          </span>
                          <span className="flex flex-1 flex-col gap-0.5">
                            <span className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-foreground">
                                {entry.page}
                              </span>
                              <span className="text-[0.65rem] text-muted-foreground">
                                {entry.kind}
                              </span>
                            </span>
                            <span className="text-sm leading-relaxed text-foreground">
                              {entry.description}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => openMenu(entry)}
                            aria-label="この項目を編集"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-90"
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>

      {hiddenEntries.length > 0 && (
        <div className="rounded-2xl border border-border bg-card px-5 py-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
            <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            非表示にした項目
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {hiddenEntries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-background px-3 py-2.5 opacity-70"
              >
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="text-[0.65rem] font-semibold text-muted-foreground">
                    Version {entry.version} ・ {entry.page}
                  </span>
                  <span className="text-sm leading-relaxed text-foreground">
                    {entry.description}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => restoreEntry(entry.id)}
                  aria-label="この項目を再表示"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-90"
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {menuId && menuEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-xs rounded-3xl border border-border bg-card p-6">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-foreground">
                {menuEntry.page} の項目を編集
              </p>
              <button
                type="button"
                onClick={() => setMenuId(null)}
                aria-label="閉じる"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent active:scale-90"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">
              {menuEntry.description}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => startEdit(menuEntry)}
                className="flex items-center gap-2.5 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-[0.98]"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                編集する
              </button>
              <button
                type="button"
                onClick={() => {
                  hideEntry(menuEntry.id)
                  setMenuId(null)
                }}
                className="flex items-center gap-2.5 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-[0.98]"
              >
                <EyeOff className="h-4 w-4" aria-hidden="true" />
                非表示にする
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteEntry(menuEntry.id)
                  setMenuId(null)
                }}
                className="flex items-center gap-2.5 rounded-xl border border-destructive/40 px-4 py-3 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 active:scale-[0.98]"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                削除する
              </button>
            </div>
            <button
              type="button"
              onClick={() => setMenuId(null)}
              className="mt-4 w-full rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-95"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {prompt}
    </div>
  )
}
