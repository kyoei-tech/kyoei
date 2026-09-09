'use client'

import { useState } from 'react'
import { ChevronDown, Plus, Pencil, Trash2 } from 'lucide-react'
import {
  CHANGELOG,
  type ChangeKind,
  type ChangelogEntry,
  type ChangelogVersion,
} from '@/lib/changelog'

const DELETE_TAP_COUNT = 4
const TAP_RESET_MS = 600

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
  const [versions, setVersions] = useState<ChangelogVersion[]>(CHANGELOG)
  const [openVersion, setOpenVersion] = useState<string | null>(
    CHANGELOG[0]?.version ?? null,
  )
  const [tapState, setTapState] = useState<
    Record<
      string,
      { count: number; timer: ReturnType<typeof setTimeout> | null }
    >
  >({})

  function deleteEntry(versionKey: string, entryIndex: number) {
    setVersions((prev) =>
      prev
        .map((v) =>
          v.version === versionKey
            ? { ...v, entries: v.entries.filter((_, i) => i !== entryIndex) }
            : v,
        )
        .filter((v) => v.entries.length > 0),
    )
  }

  // Requires 4 consecutive taps within TAP_RESET_MS of each other so a
  // stray double-tap can never delete an entry by accident.
  function handleEntryTap(versionKey: string, entryIndex: number) {
    const key = `${versionKey}-${entryIndex}`
    setTapState((prev) => {
      const current = prev[key]
      const count = (current?.count ?? 0) + 1
      if (current?.timer) clearTimeout(current.timer)
      if (count >= DELETE_TAP_COUNT) {
        deleteEntry(versionKey, entryIndex)
        const next = { ...prev }
        delete next[key]
        return next
      }
      const timer = setTimeout(() => {
        setTapState((p) => {
          const n = { ...p }
          delete n[key]
          return n
        })
      }, TAP_RESET_MS)
      return { ...prev, [key]: { count, timer } }
    })
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Version</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          これまでの更新内容を日付順に確認できます。項目を4回連続でタップすると削除できます。
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {versions.map((v, idx) => {
          const isOpen = openVersion === v.version
          const isLatest = idx === 0
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
                  {v.entries.map((entry, i) => {
                    const { Icon, className } = kindStyle(entry.kind)
                    const tapCount = tapState[`${v.version}-${i}`]?.count ?? 0
                    return (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEntryTap(v.version, i)
                          }}
                          aria-label={`${entry.description}（4回タップで削除）`}
                          className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors active:scale-[0.99] ${
                            tapCount > 0
                              ? 'border-destructive/60 bg-destructive/10'
                              : 'border-border/60 bg-background'
                          }`}
                        >
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${className}`}
                          >
                            <Icon
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
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
                          {tapCount > 0 && (
                            <span className="flex shrink-0 items-center gap-1 self-center">
                              {Array.from({ length: DELETE_TAP_COUNT }).map(
                                (_, dotIdx) => (
                                  <span
                                    key={dotIdx}
                                    className={`h-1.5 w-1.5 rounded-full ${
                                      dotIdx < tapCount
                                        ? 'bg-destructive'
                                        : 'bg-destructive/25'
                                    }`}
                                  />
                                ),
                              )}
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
