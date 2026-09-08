'use client'

import { useEffect } from 'react'
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

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`realtime:${table}`)
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
  }, [table])

  return { data: data ?? [], error, isLoading, mutate }
}
