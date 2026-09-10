'use client'

import { useState } from 'react'
import {
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  EyeOff,
  Eye,
  X,
} from 'lucide-react'
import {
  CHANGELOG,
  type ChangeKind,
  type ChangelogEntry,
  type ChangelogVersion,
} from '@/lib/changelog'
import { usePasswordGate } from '@/components/password-prompt'

const EDIT_PIN = '0525'

type EditableEntry = ChangelogEntry & { hidden?: boolean }
type EditableVersion = { version: string; date: string; entries: EditableEntry[] }

const KIND_OPTIONS: ChangeKind[] = ['追加', '変更', '削除']

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

function keyOf(version: string, index: number): string {
  return `${version}-${index}`
}

export function VersionView() {
  const [versions, setVersions] = useState<EditableVersion[]>(() =>
    CHANGELOG.map((v: ChangelogVersion) => ({
      ...v,
      entries: v.entries.map((e) => ({ ...e, hidden: false })),
    })),
  )
  const [openVersion, setOpenVersion] = useState<string | null>(
    CHANGELOG[0]?.version ?? null,
  )
  const [menuKey, setMenuKey] = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{
    page: string
    kind: ChangeKind
    description: string
  }>({ page: '', kind: '追加', description: '' })
  const { guard, prompt } = usePasswordGate(EDIT_PIN)

  function updateEntry(
    versionKey: string,
    index: number,
    updater: (entry: EditableEntry) => EditableEntry,
  ) {
    setVersions((prev) =>
      prev.map((v) =>
        v.version === versionKey
          ? {
              ...v,
              entries: v.entries.map((e, i) => (i === index ? updater(e) : e)),
            }
          : v,
      ),
    )
  }

  function deleteEntry(versionKey: string, index: number) {
    setVersions((prev) =>
      prev
        .map((v) =>
          v.version === versionKey
            ? { ...v, entries: v.entries.filter((_, i) => i !== index) }
            : v,
        )
        .filter((v) => v.entries.length > 0),
    )
  }

  function hideEntry(versionKey: string, index: number) {
    updateEntry(versionKey, index, (e) => ({ ...e, hidden: true }))
  }

  function restoreEntry(versionKey: string, index: number) {
    updateEntry(versionKey, index, (e) => ({ ...e, hidden: false }))
  }

  function openMenu(versionKey: string, index: number) {
    guard(() => setMenuKey(keyOf(versionKey, index)))
  }

  function startEdit(versionKey: string, index: number, entry: EditableEntry) {
    setEditForm({
      page: entry.page,
      kind: entry.kind,
      description: entry.description,
    })
    setEditingKey(keyOf(versionKey, index))
    setMenuKey(null)
  }

  function saveEdit(versionKey: string, index: number) {
    updateEntry(versionKey, index, (e) => ({
      ...e,
      page: editForm.page.trim() || e.page,
      kind: editForm.kind,
      description: editForm.description.trim() || e.description,
    }))
    setEditingKey(null)
  }

  const hiddenEntries = versions.flatMap((v) =>
    v.entries
      .map((e, i) => ({ v, e, i }))
      .filter(({ e }) => e.hidden),
  )

  const menuVersion = menuKey ? menuKey.slice(0, menuKey.lastIndexOf('-')) : null
  const menuIndex = menuKey ? Number(menuKey.slice(menuKey.lastIndexOf('-') + 1)) : -1
  const menuEntry =
    menuVersion != null
      ? versions.find((v) => v.version === menuVersion)?.entries[menuIndex]
      : undefined

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Version</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          これまでの更新内容を日付順に確認できます。各項目の編集ボタンから削除・非表示・編集を行えます（暗証番号が必要です）。
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {versions.map((v, idx) => {
          const isOpen = openVersion === v.version
          const isLatest = idx === 0
          const visibleEntries = v.entries
            .map((e, i) => ({ e, i }))
            .filter(({ e }) => !e.hidden)
          return (
            <li
              key={v.version}
              className="overflow-hidden rounded-2xl border border-border bg-card"
            >
              <button
                type="button"
                onClick={() =>
                  setOpenVersion((cur) => (cur === v.version ? null : v.version))
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
                  {visibleEntries.map(({ e: entry, i }) => {
                    const key = keyOf(v.version, i)
                    const { Icon, className } = kindStyle(entry.kind)

                    if (editingKey === key) {
                      return (
                        <li
                          key={i}
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
                                onClick={() => setEditingKey(null)}
                                className="flex-1 rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-95"
                              >
                                キャンセル
                              </button>
                              <button
                                type="button"
                                onClick={() => saveEdit(v.version, i)}
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
                      <li key={i}>
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
                            onClick={() => openMenu(v.version, i)}
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
            {hiddenEntries.map(({ v, e, i }) => (
              <li
                key={`${v.version}-${i}`}
                className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-background px-3 py-2.5 opacity-70"
              >
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="text-[0.65rem] font-semibold text-muted-foreground">
                    Version {v.version} ・ {e.page}
                  </span>
                  <span className="text-sm leading-relaxed text-foreground">
                    {e.description}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => restoreEntry(v.version, i)}
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

      {menuKey && menuEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-xs rounded-3xl border border-border bg-card p-6">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-foreground">
                {menuEntry.page} の項目を編集
              </p>
              <button
                type="button"
                onClick={() => setMenuKey(null)}
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
                onClick={() => {
                  if (menuVersion == null) return
                  startEdit(menuVersion, menuIndex, menuEntry)
                }}
                className="flex items-center gap-2.5 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-[0.98]"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                編集する
              </button>
              <button
                type="button"
                onClick={() => {
                  if (menuVersion == null) return
                  hideEntry(menuVersion, menuIndex)
                  setMenuKey(null)
                }}
                className="flex items-center gap-2.5 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-[0.98]"
              >
                <EyeOff className="h-4 w-4" aria-hidden="true" />
                非表示にする
              </button>
              <button
                type="button"
                onClick={() => {
                  if (menuVersion == null) return
                  deleteEntry(menuVersion, menuIndex)
                  setMenuKey(null)
                }}
                className="flex items-center gap-2.5 rounded-xl border border-destructive/40 px-4 py-3 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 active:scale-[0.98]"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                削除する
              </button>
            </div>
            <button
              type="button"
              onClick={() => setMenuKey(null)}
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
