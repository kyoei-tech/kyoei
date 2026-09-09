'use client'

import { useState } from 'react'
import { ChevronDown, Plus, Pencil, Trash2 } from 'lucide-react'
import { CHANGELOG, type ChangeKind } from '@/lib/changelog'

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
  const [openVersion, setOpenVersion] = useState<string | null>(
    CHANGELOG[0]?.version ?? null,
  )

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Version</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          これまでの更新内容を日付順に確認できます。
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {CHANGELOG.map((v, idx) => {
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
                    return (
                      <li
                        key={i}
                        className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-background px-3 py-2.5"
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${className}`}
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        <span className="flex flex-col gap-0.5">
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
