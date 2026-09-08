'use client'

import { useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { computeStreakDays } from '@/lib/accident-streak'

type AccidentDateRow = { occurred_on: string }

async function fetchAccidentDates(): Promise<AccidentDateRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('accident_records')
    .select('occurred_on')
  if (error) throw error
  return (data as AccidentDateRow[]) ?? []
}

/** Shared across every browser: recomputed live from the `accident_records` table. */
export function useAccidentStreak() {
  const { data } = useRealtimeTable<AccidentDateRow>(
    'accident_records',
    fetchAccidentDates,
    { cacheKey: 'dates' },
  )
  return useMemo(
    () => computeStreakDays(data.map((d) => d.occurred_on)),
    [data],
  )
}

export function AccidentStreakBadge({
  size = 'md',
  onClick,
}: {
  size?: 'sm' | 'md' | 'lg'
  /** When provided, the badge renders as a button that opens the calendar. */
  onClick?: () => void
}) {
  const streak = useAccidentStreak()

  if (streak === null) {
    return (
      <p className="text-center text-xs text-muted-foreground">
        まだ事故記録がありません
      </p>
    )
  }

  const numberSize =
    size === 'lg' ? 'text-5xl' : size === 'sm' ? 'text-xl' : 'text-3xl'
  const labelSize = size === 'sm' ? 'text-xs' : 'text-sm'

  const content = (
    <span className={`font-semibold text-secondary ${labelSize}`}>
      連続無事故日数{' '}
      <span className={`font-mono font-bold tabular-nums ${numberSize}`}>
        {streak}
      </span>{' '}
      日 達成！
    </span>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="mx-auto flex w-fit items-center gap-1.5 rounded-full border border-secondary/30 bg-secondary/10 px-4 py-1.5 text-center transition-colors active:scale-95 hover:bg-secondary/15"
      >
        {content}
        <ChevronRight
          className="h-4 w-4 shrink-0 text-secondary"
          aria-hidden="true"
        />
      </button>
    )
  }

  return <p className="text-center">{content}</p>
}
