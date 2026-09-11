'use client'

import { useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MonthNav, useMonthSwipe } from './month-nav'
import {
  WEEKDAYS,
  buildMonthCells,
  weekdayColor,
} from '@/lib/month-calendar'
import {
  useAttendanceCalendar,
  type ResolvedAttendanceDay,
} from '@/lib/use-attendance-calendar'
import {
  removeHoliday,
  setHolidayLabel,
  setWorkdayShift,
} from '@/lib/attendance-overrides'

const DOUBLE_TAP_MS = 350
const DEFAULT_HOLIDAY_LABEL = '休日'

function DayCell({
  iso,
  day,
  weekdayIdx,
  entry,
  onChanged,
}: {
  iso: string
  day: number
  weekdayIdx: number
  entry: ResolvedAttendanceDay | undefined
  onChanged: () => void | Promise<void>
}) {
  const lastTapRef = useRef(0)
  const [editing, setEditing] = useState(false)
  const [labelDraft, setLabelDraft] = useState('')
  const [saving, setSaving] = useState(false)

  function handleTap() {
    if (!entry) return
    const now = Date.now()
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0
      if (entry.kind === 'holiday') {
        setLabelDraft(entry.label ?? DEFAULT_HOLIDAY_LABEL)
        setEditing(true)
      } else {
        setEditing(true)
      }
    } else {
      lastTapRef.current = now
    }
  }

  async function shiftWorkday(shiftDays: -1 | 0 | 1) {
    if (!entry || entry.kind === 'holiday') return
    setSaving(true)
    await setWorkdayShift(entry.originIso, shiftDays)
    setSaving(false)
    setEditing(false)
    await onChanged()
  }

  async function saveHolidayLabel() {
    setSaving(true)
    await setHolidayLabel(iso, labelDraft)
    setSaving(false)
    setEditing(false)
    await onChanged()
  }

  async function deleteHoliday() {
    setSaving(true)
    await removeHoliday(iso)
    setSaving(false)
    setEditing(false)
    await onChanged()
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleTap}
        className={`flex w-full flex-col items-center gap-0.5 rounded-lg py-1.5 transition-colors active:scale-95 ${
          editing ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-accent'
        }`}
      >
        <span className={`text-sm font-medium ${weekdayColor(weekdayIdx)}`}>
          {day}
        </span>
        <span
          className={`text-sm font-bold ${
            entry?.kind === 'workday'
              ? 'text-primary'
              : 'text-transparent'
          }`}
          aria-hidden={entry?.kind !== 'workday'}
        >
          〇
        </span>
      </button>

      {editing && (entry?.kind === 'workday' || entry?.kind === 'workday-origin') && (
        <div
          className="absolute left-1/2 top-full z-10 mt-1 flex -translate-x-1/2 flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="whitespace-nowrap text-xs font-semibold text-foreground">
            出勤日を1日ずらす
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => shiftWorkday(-1)}
              disabled={saving}
              aria-label="前日にずらす"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground active:scale-90 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => shiftWorkday(0)}
              disabled={saving}
              className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground active:scale-95 disabled:opacity-40"
            >
              元に戻す
            </button>
            <button
              type="button"
              onClick={() => shiftWorkday(1)}
              disabled={saving}
              aria-label="翌日にずらす"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground active:scale-90 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            閉じる
          </button>
        </div>
      )}

      {editing && entry?.kind === 'holiday' && (
        <div
          className="absolute left-1/2 top-full z-10 mt-1 flex w-48 -translate-x-1/2 flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-foreground">
              休日の表示文言
            </span>
            <input
              type="text"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              placeholder={DEFAULT_HOLIDAY_LABEL}
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/60"
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={deleteHoliday}
              disabled={saving}
              className="rounded-full border border-destructive/40 px-3 py-1 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 active:scale-95 disabled:opacity-40"
            >
              削除
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground active:scale-95"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={saveHolidayLabel}
              disabled={saving}
              className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function AttendanceCalendarView() {
  const [viewMonth, setViewMonth] = useState(() => {
    const t = new Date()
    return new Date(t.getFullYear(), t.getMonth(), 1)
  })
  const { days, isLoading, refetchOverrides } = useAttendanceCalendar()

  function prevMonth() {
    setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  }
  function nextMonth() {
    setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }
  const swipe = useMonthSwipe(prevMonth, nextMonth)

  const cells = useMemo(() => buildMonthCells(viewMonth), [viewMonth])

  return (
    <section
      className="rounded-2xl border border-border bg-card p-4"
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
    >
      <MonthNav date={viewMonth} onPrev={prevMonth} onNext={nextMonth} />

      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((d, i) => (
          <span key={d} className={`text-xs font-semibold ${weekdayColor(i)}`}>
            {d}
          </span>
        ))}
        {cells.map((cell, idx) => {
          if (!cell.iso) return <span key={`blank-${idx}`} />
          return (
            <DayCell
              key={cell.iso}
              iso={cell.iso}
              day={cell.day}
              weekdayIdx={idx % 7}
              entry={days.get(cell.iso)}
              onChanged={refetchOverrides}
            />
          )
        })}
      </div>

      {isLoading && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          読み込み中…
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[0.65rem] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="font-bold text-primary">〇</span>出勤日
        </span>
        <span>空白：休日</span>
        <span>出勤日はダブルタップで1日前後に調整、休日はダブルタップで文言編集・削除できます。</span>
      </div>
    </section>
  )
}
