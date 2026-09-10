'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Coffee, Pause, Play } from 'lucide-react'
import { formatClock, formatDuration, type ClockParts } from '@/lib/shift-time'
import {
  liveBreakTotalMs,
  liveShiftElapsedMs,
  type TimecardState,
} from '@/lib/timecard-log'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { ConfirmActionModal } from './confirm-action-modal'

// Shared across every browser via the `timecard_shared_memos` table. This is
// an append-only log (no edit/delete) — each entry stays exactly as its
// author wrote it, and new entries are added to the bottom.
type SharedMemoRow = {
  id: string
  author_name: string
  content: string
  created_at: string
}

async function fetchSharedMemos(): Promise<SharedMemoRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('timecard_shared_memos')
    .select('id, author_name, content, created_at')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as SharedMemoRow[]) ?? []
}

const TRIPLE_TAP_MS = 500
const DOUBLE_TAP_MS = 350
const PERSONAL_MEMO_KEY = 'kyoei-timecard-personal-memo'

function loadPersonalMemo(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(PERSONAL_MEMO_KEY) ?? ''
  } catch {
    return ''
  }
}

function formatMemoTimestamp(iso: string): string {
  const parts = formatClock(new Date(iso), { hour12: false, seconds: false })
  return `${parts.date} ${parts.time}`
}

export function TimecardWorkStatusView({
  now,
  nowParts,
  workStartedAt,
  timecardState,
  onStartBreak,
  onEndBreak,
  onBack,
}: {
  now: number
  nowParts: ClockParts
  workStartedAt: number
  timecardState: TimecardState
  onStartBreak: () => void
  onEndBreak: () => void
  onBack: () => void
}) {
  const [pendingBreakAction, setPendingBreakAction] = useState<
    'start' | 'end' | null
  >(null)

  const { data: sharedMemos, mutate: refetchSharedMemos } =
    useRealtimeTable<SharedMemoRow>('timecard_shared_memos', fetchSharedMemos)

  const [sharedTapCount, setSharedTapCount] = useState(0)
  const sharedTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [sharedEditing, setSharedEditing] = useState(false)
  const [sharedAuthorDraft, setSharedAuthorDraft] = useState('')
  const [sharedContentDraft, setSharedContentDraft] = useState('')
  const [sharedSaving, setSharedSaving] = useState(false)

  const [personalMemo, setPersonalMemo] = useState('')
  const [personalEditing, setPersonalEditing] = useState(false)
  const [personalDraft, setPersonalDraft] = useState('')
  const personalLastTapRef = useRef(0)

  useEffect(() => {
    setPersonalMemo(loadPersonalMemo())
  }, [])

  const breakTotalMs = liveBreakTotalMs(timecardState, now)
  const shiftElapsedMs = liveShiftElapsedMs(timecardState, now)

  const workStartedParts = formatClock(new Date(workStartedAt), {
    hour12: false,
    seconds: false,
  })
  const workStartedDateLabel = `${workStartedParts.date} ${workStartedParts.weekday}`

  function handleSharedMemoTap() {
    if (sharedEditing) return
    setSharedTapCount((prev) => {
      const count = prev + 1
      if (sharedTapTimerRef.current) clearTimeout(sharedTapTimerRef.current)
      if (count >= 3) {
        setSharedAuthorDraft('')
        setSharedContentDraft('')
        setSharedEditing(true)
        return 0
      }
      sharedTapTimerRef.current = setTimeout(() => {
        setSharedTapCount(0)
      }, TRIPLE_TAP_MS)
      return count
    })
  }

  async function saveSharedMemo() {
    const author = sharedAuthorDraft.trim()
    const content = sharedContentDraft.trim()
    if (!author || !content) return
    setSharedSaving(true)
    try {
      const supabase = createClient()
      await supabase
        .from('timecard_shared_memos')
        .insert({ author_name: author, content })
      await refetchSharedMemos()
      setSharedEditing(false)
    } finally {
      setSharedSaving(false)
    }
  }

  function handlePersonalMemoTap() {
    if (personalEditing) return
    const tapNow = Date.now()
    if (tapNow - personalLastTapRef.current < DOUBLE_TAP_MS) {
      personalLastTapRef.current = 0
      setPersonalDraft(personalMemo)
      setPersonalEditing(true)
    } else {
      personalLastTapRef.current = tapNow
    }
  }

  function savePersonalMemo() {
    const trimmed = personalDraft.trim()
    setPersonalMemo(trimmed)
    window.localStorage.setItem(PERSONAL_MEMO_KEY, trimmed)
    setPersonalEditing(false)
  }

  return (
    <div className="flex flex-1 flex-col gap-3 pb-2">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 self-start text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        出退勤
      </button>

      <div className="flex flex-1 flex-col justify-evenly gap-3">
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-center">
          <p className="text-xs font-medium text-muted-foreground">
            {nowParts.date}
            <span className="ml-1.5 text-foreground">{nowParts.weekday}</span>
          </p>
          <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">
            {nowParts.time}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-card px-3 py-3.5 text-center">
            <p className="text-xs font-bold text-secondary">出勤時間</p>
            <p className="font-mono text-xl font-bold tabular-nums text-secondary">
              {workStartedParts.time}
            </p>
            <p className="mt-0.5 text-[0.65rem] font-medium text-muted-foreground">
              {workStartedDateLabel}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-3 py-3.5 text-center">
            <p className="text-xs font-bold text-secondary">勤務時間</p>
            <p className="font-mono text-xl font-bold tabular-nums text-secondary">
              {formatDuration(shiftElapsedMs)}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card px-4 py-3.5">
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-bold ${
                timecardState.onBreak ? 'text-primary' : 'text-foreground'
              }`}
            >
              休憩時間
            </span>
            <span
              className={`font-mono text-xl font-bold tabular-nums ${
                timecardState.onBreak ? 'text-primary' : 'text-foreground'
              }`}
            >
              {formatDuration(breakTotalMs)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            setPendingBreakAction(timecardState.onBreak ? 'end' : 'start')
          }
          className={`flex items-center justify-center gap-1.5 rounded-2xl border py-3.5 text-base font-bold transition-all active:scale-[0.97] ${
            timecardState.onBreak
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-primary bg-primary text-primary-foreground'
          }`}
        >
          {timecardState.onBreak ? (
            <>
              <Pause className="h-5 w-5" aria-hidden="true" />
              休憩終了
            </>
          ) : (
            <>
              <Play className="h-5 w-5" aria-hidden="true" />
              休憩開始
            </>
          )}
        </button>

        <section
          aria-label="共有メモ"
          onClick={handleSharedMemoTap}
          className="flex flex-col gap-2 rounded-2xl border border-border bg-card px-4 py-3.5"
        >
          <div className="flex items-center gap-1.5">
            <Coffee className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="text-xs font-bold tracking-wide text-primary">
              共有メモ
            </span>
          </div>

          {sharedEditing ? (
            <div
              className="flex flex-col gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                value={sharedAuthorDraft}
                onChange={(e) => setSharedAuthorDraft(e.target.value)}
                placeholder="入力者の名前"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
              />
              <textarea
                value={sharedContentDraft}
                onChange={(e) => setSharedContentDraft(e.target.value)}
                rows={3}
                autoFocus
                placeholder="メモ内容を入力（改行できます）"
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSharedEditing(false)}
                  className="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground active:scale-95"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={saveSharedMemo}
                  disabled={
                    sharedSaving ||
                    !sharedAuthorDraft.trim() ||
                    !sharedContentDraft.trim()
                  }
                  className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
                >
                  {sharedSaving ? '保存中…' : '追記する'}
                </button>
              </div>
            </div>
          ) : sharedMemos.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              メモはまだありません。3回連続タップで追記できます。
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {sharedMemos.map((memo) => (
                <div
                  key={memo.id}
                  className="rounded-xl border border-border bg-background px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-foreground">
                      {memo.author_name}
                    </span>
                    <span className="text-[0.65rem] text-muted-foreground">
                      {formatMemoTimestamp(memo.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                    {memo.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section
          aria-label="個人メモ"
          onClick={handlePersonalMemoTap}
          className="flex flex-col gap-2 rounded-2xl border border-border bg-card px-4 py-3.5"
        >
          <span className="text-xs font-bold tracking-wide text-muted-foreground">
            個人メモ（この端末のみ）
          </span>

          {personalEditing ? (
            <div
              className="flex flex-col gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <textarea
                value={personalDraft}
                onChange={(e) => setPersonalDraft(e.target.value)}
                rows={3}
                autoFocus
                placeholder="この端末だけに保存されるメモを入力（改行できます）"
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPersonalEditing(false)}
                  className="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground active:scale-95"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={savePersonalMemo}
                  className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
                >
                  保存
                </button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
              {personalMemo || 'ダブルタップしてメモを入力'}
            </p>
          )}
        </section>
      </div>

      {pendingBreakAction === 'start' && (
        <ConfirmActionModal
          message="休憩を開始しますか？"
          onConfirm={() => {
            onStartBreak()
            setPendingBreakAction(null)
          }}
          onCancel={() => setPendingBreakAction(null)}
        />
      )}
      {pendingBreakAction === 'end' && (
        <ConfirmActionModal
          message="休憩を終了しますか？"
          onConfirm={() => {
            onEndBreak()
            setPendingBreakAction(null)
          }}
          onCancel={() => setPendingBreakAction(null)}
        />
      )}
    </div>
  )
}
