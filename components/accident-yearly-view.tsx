'use client'

import { useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { eraLabel } from '@/lib/era'
import type { CategoryRow } from './accident-category-select'

type AccidentRow = {
  id: string
  occurred_on: string
  vehicle_class: string
  location: string
  description: string
  category: string
}

const MONTH_NAMES = [
  '1月',
  '2月',
  '3月',
  '4月',
  '5月',
  '6月',
  '7月',
  '8月',
  '9月',
  '10月',
  '11月',
  '12月',
]

type Selection = { type: 'month'; month: number } | { type: 'category'; name: string }

export function AccidentYearlyView({
  rows,
  categories,
}: {
  rows: AccidentRow[]
  categories: CategoryRow[]
}) {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [selection, setSelection] = useState<Selection | null>(null)
  const touchX = useRef<number | null>(null)

  function prevYear() {
    setSelection(null)
    setYear((y) => y - 1)
  }
  function nextYear() {
    setSelection(null)
    setYear((y) => y + 1)
  }

  const yearRows = useMemo(
    () =>
      rows.filter((r) => {
        const [ry] = r.occurred_on.split('-').map(Number)
        return ry === year
      }),
    [rows, year],
  )

  const countsByMonth = useMemo(() => {
    const map = new Map<number, number>()
    for (const r of yearRows) {
      const [, rm] = r.occurred_on.split('-').map(Number)
      map.set(rm, (map.get(rm) ?? 0) + 1)
    }
    return map
  }, [yearRows])

  const countsByCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of yearRows) {
      const key = r.category || '未分類'
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [yearRows])

  const categoryNames = useMemo(() => {
    const names = categories.map((c) => c.name)
    if (countsByCategory.has('未分類') && !names.includes('未分類')) {
      names.push('未分類')
    }
    return names
  }, [categories, countsByCategory])

  const selectedRows = useMemo(() => {
    if (!selection) return []
    const filtered =
      selection.type === 'month'
        ? yearRows.filter((r) => {
            const [, rm] = r.occurred_on.split('-').map(Number)
            return rm === selection.month
          })
        : yearRows.filter((r) => (r.category || '未分類') === selection.name)
    return [...filtered].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))
  }, [selection, yearRows])

  function toggleMonth(month: number) {
    setSelection((cur) =>
      cur?.type === 'month' && cur.month === month ? null : { type: 'month', month },
    )
  }
  function toggleCategory(name: string) {
    setSelection((cur) =>
      cur?.type === 'category' && cur.name === name ? null : { type: 'category', name },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <section
        className="rounded-2xl border border-border bg-card p-4"
        onTouchStart={(e) => {
          touchX.current = e.touches[0].clientX
        }}
        onTouchEnd={(e) => {
          if (touchX.current == null) return
          const delta = e.changedTouches[0].clientX - touchX.current
          touchX.current = null
          if (delta > 50) prevYear()
          else if (delta < -50) nextYear()
        }}
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={prevYear}
            aria-label="前の年"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground active:scale-90"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-base font-bold text-foreground">
              {year}年（{eraLabel(year)}）
            </span>
            <span className="mt-1 text-xs font-medium text-muted-foreground">
              年間事故件数：
              <span
                className={`text-sm font-bold ${
                  yearRows.length > 0 ? 'text-destructive' : 'text-muted-foreground'
                }`}
              >
                {yearRows.length}
              </span>
              件
            </span>
          </div>
          <button
            type="button"
            onClick={nextYear}
            aria-label="次の年"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground active:scale-90"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-6 gap-1.5">
          {MONTH_NAMES.map((label, idx) => {
            const month = idx + 1
            const count = countsByMonth.get(month) ?? 0
            const isSelected = selection?.type === 'month' && selection.month === month
            return (
              <button
                key={month}
                type="button"
                onClick={() => toggleMonth(month)}
                className={`flex flex-col items-center gap-0.5 rounded-xl py-2 transition-colors active:scale-95 ${
                  isSelected ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-accent'
                }`}
              >
                <span className="text-xs font-medium text-foreground">{label}</span>
                <span
                  className={`text-sm font-bold tabular-nums ${
                    count > 0 ? 'text-destructive' : 'text-muted-foreground/40'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold text-foreground">カテゴリー別件数</h3>
        {categoryNames.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            カテゴリーがありません。
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {categoryNames.map((name) => {
              const count = countsByCategory.get(name) ?? 0
              const isSelected = selection?.type === 'category' && selection.name === name
              return (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => toggleCategory(name)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-colors active:scale-[0.99] ${
                      isSelected
                        ? 'bg-primary/20 ring-1 ring-primary'
                        : 'hover:bg-accent'
                    }`}
                  >
                    <span className="text-sm text-foreground">{name}</span>
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        count > 0 ? 'text-destructive' : 'text-muted-foreground/40'
                      }`}
                    >
                      {count}件
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {selection && (
        <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card px-5 py-4">
          <h3 className="text-sm font-bold text-foreground">
            {selection.type === 'month'
              ? `${year}年${selection.month}月の事故詳細`
              : `${selection.name} の事故詳細（${year}年）`}
          </h3>
          {selectedRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">事故はありません。</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {selectedRows.map((a) => (
                <li
                  key={a.id}
                  className="rounded-xl border border-border/60 bg-background px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {a.occurred_on}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {a.category && (
                        <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-foreground">
                          {a.category}
                        </span>
                      )}
                      {a.vehicle_class && (
                        <span className="text-xs font-semibold text-primary">
                          {a.vehicle_class}
                        </span>
                      )}
                    </div>
                  </div>
                  {a.location && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      発生場所：{a.location}
                    </p>
                  )}
                  <p className="mt-0.5 text-sm text-foreground">
                    {a.description || '詳細なし'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
