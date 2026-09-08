'use client'

import { useEffect, useId } from 'react'
import useSWR from 'swr'
import { createClient } from './client'

/**
 * Keeps a Supabase table's rows in sync across every browser that has this
 * app open. Fetches via SWR, then subscribes to Postgres Changes so any
 * insert/update/delete made anywhere else triggers an instant refetch here.
 */
export function useRealtimeTable<T>(
  table: string,
  fetcher: () => Promise<T[]>,
  options?: { orderKey?: string },
) {
  const { data, error, isLoading, mutate } = useSWR<T[]>(table, fetcher, {
    revalidateOnFocus: false,
  })

  // Supabase dedupes channels by name, so two hook instances watching the
  // same table at the same time (e.g. this page and an embedded badge) must
  // use distinct channel names or the second `.on()` call throws once the
  // first channel has already subscribed.
  const instanceId = useId()

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`realtime:${table}:${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          mutate()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- table is stable per hook usage
  }, [table, instanceId])

  return { data: data ?? [], error, isLoading, mutate }
}
