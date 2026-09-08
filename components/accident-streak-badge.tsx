'use client'

import { useMemo } from 'react'
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
  )
  return useMemo(
    () => computeStreakDays(data.map((d) => d.occurred_on)),
    [data],
  )
}

export function AccidentStreakBadge({
  size = 'md',
}: {
  size?: 'sm' | 'md' | 'lg'
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

  return (
    <p
      className={`text-center font-semibold text-secondary ${labelSize}`}
    >
      連続無事故日数{' '}
      <span
        className={`font-mono font-bold tabular-nums ${numberSize}`}
      >
        {streak}
      </span>{' '}
      日 達成！
    </p>
  )
}
