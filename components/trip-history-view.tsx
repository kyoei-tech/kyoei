'use client'

import { Fragment, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  Clock,
  List,
  LogIn,
  LogOut,
  Moon,
  NotebookPen,
  PackageMinus,
  PackagePlus,
  ScrollText,
  Timer,
  Trash2,
} from 'lucide-react'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import {
  deleteTripHistory,
  fetchRestDayNotes,
  fetchTripHistory,
  updateRestDayNote,
  updateTripHistoryMemo,
  updateTripHistoryTimes,
  type RestDayNote,
  type TripHistoryEntry,
} from '@/lib/trip-history'
import { formatHoursMinutes } from '@/lib/trip-log'
import { pad2 } from '@/lib/shift-time'
import { workdayForTrip } from '@/lib/attendance-calendar'
import {
  fetchAttendanceOverrides,
  type AttendanceOverride,
} from '@/lib/attendance-overrides'
import { ConfirmDeleteInline } from './confirm-delete'
import { AttendanceCalendarView } from './attendance-calendar-view'
import { usePasswordGate } from './password-prompt'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

// Tapping a trip card 5 times within this window is the 隠しコマンド that
// opens the 出庫/帰庫 date-time editor (which also holds the delete button).
// It's gated behind usePasswordGate below so casual taps can't reach it.
// Distinct from the double-tap-to-edit-memo gesture by requiring far more taps.
const UNLOCK_TAP_COUNT = 5
const UNLOCK_TAP_WINDOW_MS = 2000
const DOUBLE_TAP_MS = 350
const EDIT_UNLOCK_CODE = '1357951'

// A gap of 33+ hours between 帰庫 and the next 出庫 is shown as a 休日 card
// instead of the usual small "休息時間" note inside the following trip's card.
const REST_DAY_THRESHOLD_MS = 33 * 60 * 60 * 1000

/** Whether any calendar day within [startMs, endMs] is a Sunday. */
function restGapContainsSunday(startMs: number, endMs: number): boolean {
  const cursor = new Date(startMs)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(endMs)
  while (cursor.getTime() <= end.getTime()) {
    if (cursor.getDay() === 0) return true
    cursor.setDate(cursor.getDate() + 1)
  }
  return false
}

function formatDateTime(ms: number): { date: string; time: string } {
  const d = new Date(ms)
  return {
    date: `${d.getMonth() + 1}/${d.getDate()}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  }
}

/** `<input type="datetime-local">` value, in local time, for one timestamp. */
function toLocalInputValue(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

const CATEGORY_ITEMS: {
  key: keyof TripHistoryEntry['totals']
  label: string
  Icon: typeof Clock
}[] = [
  { key: 'loading', label: '荷積', Icon: PackagePlus },
  { key: 'unloading', label: '荷卸', Icon: PackageMinus },
  { key: 'waiting', label: '待機', Icon: Clock },
  { key: 'resting', label: '休憩', Icon: Moon },
]

const MEMO_FIELDS: {
  key: 'processMemo' | 'trafficMemo' | 'freeMemo'
  label: string
}[] = [
  { key: 'processMemo', label: '工程' },
  { key: 'trafficMemo', label: '渋滞区間' },
  { key: 'freeMemo', label: '自由欄' },
]

function hasMemo(trip: TripHistoryEntry) {
  return !!(trip.processMemo || trip.trafficMemo || trip.freeMemo)
}

/**
 * Shown in place of a trip's small "休息時間" note whenever the gap to the
 * previous 帰庫 is 33+ hours. A gap spanning a Sunday is always a plain
 * 通常休日 (no memo needed); other 33h+ gaps — 平日の点検・車検など — get an
 * editable memo.
 */
function RestDayCard({
  gapMs,
  isRegularHoliday,
  memo,
  onSaveMemo,
}: {
  gapMs: number
  isRegularHoliday: boolean
  memo: string
  onSaveMemo: (memo: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(memo)
  const [saving, setSaving] = useState(false)

  function startEditing() {
    setDraft(memo)
    setEditing(true)
  }

  async function save() {
    setSaving(true)
    await onSaveMemo(draft)
    setSaving(false)
    setEditing(false)
  }

  return (
    <li
      onClick={() => {
        if (!isRegularHoliday && !editing) startEditing()
      }}
      className="flex flex-col gap-2 rounded-2xl border border-dashed border-border bg-background px-5 py-4 select-none"
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Moon className="h-3.5 w-3.5" aria-hidden="true" />
        休日（{formatHoursMinutes(gapMs)}）
      </div>
      {isRegularHoliday ? (
        <span className="text-sm font-bold text-foreground">通常休日</span>
      ) : editing ? (
        <div
          className="flex flex-col gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="例：点検、車検"
            autoFocus
            className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/60"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground active:scale-95"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      ) : (
        <span className="text-sm text-foreground">
          {memo || 'タップして理由を入力（点検・車検など）'}
        </span>
      )}
    </li>
  )
}

function TripCard({
  trip,
  restBeforeMs,
  dayShift,
  guard,
  onChanged,
}: {
  trip: TripHistoryEntry
  restBeforeMs: number | null
  // Days this trip's displayed dates should move by, mirroring a workday
  // shift made on the カレンダー tab (lib/attendance-overrides.ts). Purely
  // cosmetic — the stored departedAt/returnedAt never change.
  dayShift: number
  // From usePasswordGate: runs `action` immediately once unlocked this
  // session, otherwise shows the PIN prompt first. Protects the 出庫/帰庫
  // date-time editor and delete button behind the 隠しコマンド below.
  guard: (action: () => void) => void
  onChanged: () => void | Promise<void>
}) {
  const shiftMs = dayShift * ONE_DAY_MS
  const departure = formatDateTime(trip.departedAt + shiftMs)
  const arrival = formatDateTime(trip.returnedAt + shiftMs)
  const drivingMs = trip.totals.driving

  const unlockTapCountRef = useRef(0)
  const unlockTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTapRef = useRef(0)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [showMemo, setShowMemo] = useState(false)
  const [editingMemo, setEditingMemo] = useState(false)
  const [processDraft, setProcessDraft] = useState('')
  const [trafficDraft, setTrafficDraft] = useState('')
  const [freeDraft, setFreeDraft] = useState('')
  const [savingMemo, setSavingMemo] = useState(false)

  const [editingTimes, setEditingTimes] = useState(false)
  const [departedDraft, setDepartedDraft] = useState('')
  const [returnedDraft, setReturnedDraft] = useState('')
  const [savingTimes, setSavingTimes] = useState(false)
  const [timesError, setTimesError] = useState<string | null>(null)

  function startEditingMemo() {
    setProcessDraft(trip.processMemo)
    setTrafficDraft(trip.trafficMemo)
    setFreeDraft(trip.freeMemo)
    setEditingMemo(true)
    setShowMemo(true)
  }

  function startEditingTimes() {
    setDepartedDraft(toLocalInputValue(trip.departedAt))
    setReturnedDraft(toLocalInputValue(trip.returnedAt))
    setTimesError(null)
    setEditingTimes(true)
    setShowMemo(false)
  }

  function handleCardTap() {
    if (confirmingDelete || editingMemo || editingTimes) return

    // 5-tap-within-2s → 隠しコマンド。Runs through the PIN gate before
    // opening the date-time editor (which also holds the delete button).
    unlockTapCountRef.current += 1
    if (unlockTapTimerRef.current) clearTimeout(unlockTapTimerRef.current)
    if (unlockTapCountRef.current >= UNLOCK_TAP_COUNT) {
      unlockTapCountRef.current = 0
      guard(startEditingTimes)
      return
    }
    unlockTapTimerRef.current = setTimeout(() => {
      unlockTapCountRef.current = 0
    }, UNLOCK_TAP_WINDOW_MS)

    // Double-tap → open the memo editor. Single tap → toggle memo preview.
    const now = Date.now()
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0
      startEditingMemo()
    } else {
      lastTapRef.current = now
      setShowMemo((v) => !v)
    }
  }

  async function confirmDelete() {
    setDeleting(true)
    await deleteTripHistory(trip.id)
    setDeleting(false)
    setConfirmingDelete(false)
    await onChanged()
  }

  async function saveMemo() {
    setSavingMemo(true)
    await updateTripHistoryMemo(trip.id, {
      processMemo: processDraft,
      trafficMemo: trafficDraft,
      freeMemo: freeDraft,
    })
    setSavingMemo(false)
    setEditingMemo(false)
    await onChanged()
  }

  async function saveTimes() {
    const departedAt = new Date(departedDraft).getTime()
    const returnedAt = new Date(returnedDraft).getTime()
    if (Number.isNaN(departedAt) || Number.isNaN(returnedAt)) {
      setTimesError('日時を正しく入力してください')
      return
    }
    setSavingTimes(true)
    const { error } = await updateTripHistoryTimes(trip.id, {
      departedAt,
      returnedAt,
    })
    setSavingTimes(false)
    if (error) {
      setTimesError(error)
      return
    }
    setEditingTimes(false)
    await onChanged()
  }

  if (confirmingDelete) {
    return (
      <li>
        <ConfirmDeleteInline
          message="この運行履歴を削除しますか？"
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      </li>
    )
  }

  return (
    <li
      onClick={handleCardTap}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-4 select-none"
    >
      {deleting && (
        <p className="text-xs font-medium text-muted-foreground">削除中…</p>
      )}
      {restBeforeMs != null && (
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Timer className="h-3.5 w-3.5" aria-hidden="true" />
          休息時間：{formatHoursMinutes(restBeforeMs)}
        </div>
      )}
      {dayShift !== 0 && (
        <p className="text-[0.65rem] font-medium text-primary">
          カレンダーで出勤日を{dayShift > 0 ? '翌日' : '前日'}に調整済み
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/15 text-secondary">
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="flex flex-col">
            <span className="text-base font-bold text-foreground">
              {departure.date}
            </span>
            <span className="text-xs text-muted-foreground">
              {departure.time} 出庫
            </span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">→</span>
        <div className="flex items-center gap-2">
          <div className="flex flex-col text-right">
            <span className="text-base font-bold text-foreground">
              {arrival.date}
            </span>
            <span className="text-xs text-muted-foreground">
              {arrival.time} 帰庫
            </span>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <LogIn className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl bg-background px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <ScrollText className="h-4 w-4 text-primary" aria-hidden="true" />
          走行 {formatHoursMinutes(drivingMs)}
        </div>
        {CATEGORY_ITEMS.map(({ key, label, Icon }) => {
          const ms = trip.totals[key]
          if (ms <= 0) return null
          return (
            <div
              key={key}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label} {formatHoursMinutes(ms)}
            </div>
          )
        })}
      </div>

      {trip.splitRestRemainingMs != null && (
        <p className="rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive">
          分割休息：残り{formatHoursMinutes(trip.splitRestRemainingMs)}を出庫時に保持
        </p>
      )}

      {!editingMemo && !showMemo && hasMemo(trip) && (
        <div className="flex items-center gap-1.5 text-[0.65rem] text-muted-foreground">
          <NotebookPen className="h-3 w-3" aria-hidden="true" />
          メモあり（タップで表示）
        </div>
      )}

      {!editingMemo && showMemo && hasMemo(trip) && (
        <div className="flex flex-col gap-1.5 rounded-xl bg-background px-3 py-2.5">
          {MEMO_FIELDS.map(({ key, label }) => {
            const value = trip[key]
            if (!value) return null
            return (
              <div key={key} className="flex flex-col gap-0.5">
                <span className="text-[0.65rem] font-semibold text-muted-foreground">
                  {label}
                </span>
                <span className="whitespace-pre-line text-sm text-foreground">
                  {value}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {editingMemo && (
        <div
          className="flex flex-col gap-2.5 rounded-xl border border-border/60 bg-background px-3 py-3"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[0.65rem] font-semibold text-muted-foreground">
            メモを編集（ダブルタップで表示）
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">工程</span>
            <input
              type="text"
              value={processDraft}
              onChange={(e) => setProcessDraft(e.target.value)}
              placeholder="例：〇〇センター→△△倉庫"
              className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/60"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">渋滞区間</span>
            <input
              type="text"
              value={trafficDraft}
              onChange={(e) => setTrafficDraft(e.target.value)}
              placeholder="例：〇〇IC～△△IC"
              className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/60"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              自由欄（トラブルなど）
            </span>
            <textarea
              value={freeDraft}
              onChange={(e) => setFreeDraft(e.target.value)}
              rows={2}
              placeholder="気になったことを記録"
              className="resize-none rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/60"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingMemo(false)}
              className="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground active:scale-95"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={saveMemo}
              disabled={savingMemo}
              className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
            >
              {savingMemo ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      )}

      {editingTimes && (
        <div
          className="flex flex-col gap-2.5 rounded-xl border border-primary/30 bg-background px-3 py-3"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[0.65rem] font-semibold text-muted-foreground">
            出庫・帰庫日時を編集
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">出庫</span>
            <input
              type="datetime-local"
              value={departedDraft}
              onChange={(e) => {
                setTimesError(null)
                setDepartedDraft(e.target.value)
              }}
              className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/60"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">帰庫</span>
            <input
              type="datetime-local"
              value={returnedDraft}
              onChange={(e) => {
                setTimesError(null)
                setReturnedDraft(e.target.value)
              }}
              className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/60"
            />
          </label>
          {timesError && (
            <p className="text-xs font-semibold text-destructive">
              {timesError}
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="flex items-center gap-1 rounded-full border border-destructive/40 px-3.5 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 active:scale-95"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              削除
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditingTimes(false)}
                className="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground active:scale-95"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={saveTimes}
                disabled={savingTimes}
                className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
              >
                {savingTimes ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  )
}

type DisplayMode = 'list' | 'calendar'

export function TripHistoryView() {
  const [displayMode, setDisplayMode] = useState<DisplayMode>('list')
  // 隠しコマンド（カードを5回連続タップ）で出た暗証番号入力を管理。一度解除すれば
  // このタブを開いている間は再入力不要。
  const { guard, prompt } = usePasswordGate(EDIT_UNLOCK_CODE)
  const {
    data: trips,
    isLoading,
    mutate,
  } = useRealtimeTable<TripHistoryEntry>('trip_history', fetchTripHistory, {
    cacheKey: 'device',
  })
  // Same overrides the カレンダー tab writes to when 出勤日 is shifted, so a
  // shift made there is reflected here too without touching stored trips.
  const { data: overrides } = useRealtimeTable<AttendanceOverride>(
    'attendance_day_overrides',
    fetchAttendanceOverrides,
    { cacheKey: 'device' },
  )
  const { data: restDayNotes, mutate: refetchRestDayNotes } =
    useRealtimeTable<RestDayNote>('trip_rest_day_notes', fetchRestDayNotes, {
      cacheKey: 'device',
    })
  const restDayNoteByTripId = useMemo(() => {
    const map = new Map<string, string>()
    for (const note of restDayNotes) map.set(note.tripId, note.memo)
    return map
  }, [restDayNotes])

  const shiftByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of overrides) {
      if (o.kind === 'workday_shift' && o.shiftDays) {
        map.set(o.day, o.shiftDays)
      }
    }
    return map
  }, [overrides])

  const dayShiftByIndex = useMemo(
    () => trips.map((trip) => shiftByDay.get(workdayForTrip(trip)) ?? 0),
    [trips, shiftByDay],
  )

  // trips is newest-first; the rest before trip[i] is the gap between the
  // chronologically previous trip's 帰庫 and this trip's 出庫.
  const restBeforeByIndex = useMemo(() => {
    return trips.map((trip, i) => {
      const previous = trips[i + 1]
      if (!previous) return null
      return trip.departedAt - previous.returnedAt
    })
  }, [trips])

  // Gaps of 33h+ get their own 休日 card (rendered just above the following
  // trip) instead of the small "休息時間" note inside that trip's own card.
  const restDayInfoByIndex = useMemo(() => {
    return trips.map((trip, i) => {
      const previous = trips[i + 1]
      if (!previous) return null
      const gapMs = trip.departedAt - previous.returnedAt
      if (gapMs < REST_DAY_THRESHOLD_MS) return null
      return {
        gapMs,
        isRegularHoliday: restGapContainsSunday(
          previous.returnedAt,
          trip.departedAt,
        ),
      }
    })
  }, [trips])

  return (
    <div className="flex flex-col gap-4">
      {prompt}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">運行履歴</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            過去の出庫・帰庫と休息時間を確認できます。
          </p>
        </div>
        <div className="flex shrink-0 rounded-full border border-border p-0.5">
          <button
            type="button"
            onClick={() => setDisplayMode('list')}
            className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              displayMode === 'list'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <List className="h-3.5 w-3.5" aria-hidden="true" />
            全表示
          </button>
          <button
            type="button"
            onClick={() => setDisplayMode('calendar')}
            className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              displayMode === 'calendar'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            カレンダー
          </button>
        </div>
      </div>

      {displayMode === 'calendar' ? (
        <AttendanceCalendarView />
      ) : isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          読み込み中…
        </p>
      ) : trips.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          まだ運行履歴がありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {trips.map((trip, i) => {
            const restDayInfo = restDayInfoByIndex[i]
            return (
              <Fragment key={trip.id}>
                {restDayInfo && (
                  <RestDayCard
                    gapMs={restDayInfo.gapMs}
                    isRegularHoliday={restDayInfo.isRegularHoliday}
                    memo={restDayNoteByTripId.get(trip.id) ?? ''}
                    onSaveMemo={async (memo) => {
                      await updateRestDayNote(trip.id, memo)
                      await refetchRestDayNotes()
                    }}
                  />
                )}
                <TripCard
                  trip={trip}
                  restBeforeMs={restDayInfo ? null : restBeforeByIndex[i]}
                  dayShift={dayShiftByIndex[i]}
                  guard={guard}
                  onChanged={mutate}
                />
              </Fragment>
            )
          })}
        </ul>
      )}
    </div>
  )
}
