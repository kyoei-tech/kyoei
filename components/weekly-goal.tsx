'use client'

import { useRef, useState } from 'react'
import { Target } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { usePasswordGate } from './password-prompt'

// Shared across every browser via the `weekly_goal` Supabase table (single row).
type GoalRow = {
  id: string
  title: string
  content: string
  updated_at: string
}

function fetchGoal(goalId: string) {
  return async (): Promise<GoalRow[]> => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('weekly_goal')
      .select('id, title, content, updated_at')
      .eq('id', goalId)
    if (error) throw error
    return (data as GoalRow[]) ?? []
  }
}

const DOUBLE_TAP_MS = 350
const DEFAULT_TITLE = '今週の目標'

export function WeeklyGoal({ goalId = 'current' }: { goalId?: string }) {
  const { data: rows, mutate: refetch } = useRealtimeTable<GoalRow>(
    'weekly_goal',
    fetchGoal(goalId),
    { cacheKey: goalId },
  )
  const title = rows[0]?.title ?? DEFAULT_TITLE
  const goal = rows[0]?.content ?? ''
  const [editing, setEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const lastTapRef = useRef(0)
  const { guard, prompt } = usePasswordGate('2486')

  function startEditing() {
    setTitleDraft(title)
    setDraft(goal)
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
      await supabase
        .from('weekly_goal')
        .update({
          title: titleDraft.trim() || DEFAULT_TITLE,
          content: draft.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', goalId)
      await refetch()
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      onClick={handleTap}
      aria-label="今週の目標"
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
          className="mt-2 flex flex-col gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            placeholder="タイトルを入力"
            aria-label="今週の目標のタイトル"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-primary outline-none placeholder:text-muted-foreground focus:border-primary/60"
          />
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            autoFocus
            placeholder="今週の目標を入力"
            className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
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
        <p className="mt-1 line-clamp-1 text-sm font-medium text-foreground">
          {goal || 'ダブルタップして目標を設定'}
        </p>
      )}

      {prompt}
    </section>
  )
}
