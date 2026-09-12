'use client'

import { useEffect, useRef, useState } from 'react'
import { Target } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { usePasswordGate } from './password-prompt'
import { currentMonthKey } from '@/lib/month-calendar'

// Shared across every browser via the `weekly_goal` Supabase table (single row).
type GoalRow = {
  id: string
  title: string
  content: string
  next_content: string
  next_content_set_at: string | null
  content_month: string
  updated_at: string
}

function fetchGoal(goalId: string) {
  return async (): Promise<GoalRow[]> => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('weekly_goal')
      .select(
        'id, title, content, next_content, next_content_set_at, content_month, updated_at',
      )
      .eq('id', goalId)
    if (error) throw error
    return (data as GoalRow[]) ?? []
  }
}

const DEFAULT_TITLE = '今月の目標'
const DOUBLE_TAP_MS = 350

export function WeeklyGoal({ goalId = 'current' }: { goalId?: string }) {
  const { data: rows, mutate: refetch } = useRealtimeTable<GoalRow>(
    'weekly_goal',
    fetchGoal(goalId),
    { cacheKey: goalId },
  )
  const row = rows[0]
  const title = row?.title ?? DEFAULT_TITLE
  const goal = row?.content ?? ''
  const nextGoal = row?.next_content ?? ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [nextDraft, setNextDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const rolloverRef = useRef<string | null>(null)
  const lastTapRef = useRef(0)
  const { guard, prompt } = usePasswordGate('2486')

  // If the stored content is from a past month and a next-month draft was
  // saved, roll it over into the current month on load. Also archives the
  // outgoing month's content into weekly_goal_history. Idempotent so
  // whichever client opens first "wins" without breaking the others.
  useEffect(() => {
    if (!row) return
    const nowMonth = currentMonthKey()
    if (row.content_month === nowMonth) return
    if (!row.next_content) return
    if (rolloverRef.current === row.id) return
    rolloverRef.current = row.id

    async function rollover() {
      const supabase = createClient()
      await supabase.from('weekly_goal_history').upsert(
        {
          goal_id: goalId,
          month: nowMonth,
          content: row!.next_content,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'goal_id,month' },
      )
      await supabase
        .from('weekly_goal')
        .update({
          content: row!.next_content,
          content_month: nowMonth,
          next_content: '',
          next_content_set_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', goalId)
      await refetch()
    }

    rollover()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per row identity change
  }, [row?.id, row?.content_month, row?.next_content, goalId])

  function startEditing() {
    setDraft(goal)
    setNextDraft(nextGoal)
    setEditing(true)
  }

  function handleTap() {
    if (editing) return
    const now = Date.now()
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0
      guard(startEditing)
    } else {
      lastTapRef.current = now
    }
  }

  async function save() {
    setSaving(true)
    try {
      const supabase = createClient()
      const nowMonth = currentMonthKey()
      const trimmedNext = nextDraft.trim()
      await supabase
        .from('weekly_goal')
        .update({
          content: draft.trim(),
          content_month: nowMonth,
          next_content: trimmedNext,
          next_content_set_at: trimmedNext ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', goalId)
      await supabase.from('weekly_goal_history').upsert(
        {
          goal_id: goalId,
          month: nowMonth,
          content: draft.trim(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'goal_id,month' },
      )
      await refetch()
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      onClick={handleTap}
      aria-label={title}
      className="rounded-2xl border border-border bg-card px-4 py-2.5"
    >
      <div className="flex items-center gap-1.5">
        <Target className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="text-sm font-bold tracking-wide text-primary">
          {title}
        </span>
      </div>

      {editing ? (
        <div
          className="mt-2 flex flex-col gap-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground">
              今月の目標
            </span>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              autoFocus
              placeholder="今月の目標を入力"
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground">
              来月の目標
            </span>
            <textarea
              value={nextDraft}
              onChange={(e) => setNextDraft(e.target.value)}
              rows={2}
              placeholder="来月の目標を入力"
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
            />
          </div>
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
        <p className="mt-1 line-clamp-1 text-sm font-medium text-foreground">
          {goal || 'ダブルタップして目標を設定'}
        </p>
      )}

      {prompt}
    </section>
  )
}
