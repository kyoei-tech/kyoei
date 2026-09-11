'use client'

import { useMemo } from 'react'
import {
  Clock,
  LogIn,
  LogOut,
  Moon,
  PackageMinus,
  PackagePlus,
  ScrollText,
  Timer,
} from 'lucide-react'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { fetchTripHistory, type TripHistoryEntry } from '@/lib/trip-history'
import { formatHoursMinutes } from '@/lib/trip-log'
import { pad2 } from '@/lib/shift-time'

function formatDateTime(ms: number): { date: string; time: string } {
  const d = new Date(ms)
  return {
    date: `${d.getMonth() + 1}/${d.getDate()}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  }
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

function TripCard({
  trip,
  restBeforeMs,
}: {
  trip: TripHistoryEntry
  restBeforeMs: number | null
}) {
  const departure = formatDateTime(trip.departedAt)
  const arrival = formatDateTime(trip.returnedAt)
  const drivingMs = trip.totals.driving

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-4">
      {restBeforeMs != null && (
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Timer className="h-3.5 w-3.5" aria-hidden="true" />
          休息時間：{formatHoursMinutes(restBeforeMs)}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/15 text-secondary">
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-foreground">
              {departure.time}
            </span>
            <span className="text-[0.65rem] text-muted-foreground">
              {departure.date} 出庫
            </span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">→</span>
        <div className="flex items-center gap-2">
          <div className="flex flex-col text-right">
            <span className="text-sm font-bold text-foreground">
              {arrival.time}
            </span>
            <span className="text-[0.65rem] text-muted-foreground">
              {arrival.date} 帰庫
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
    </li>
  )
}

export function TripHistoryView() {
  const { data: trips, isLoading } = useRealtimeTable<TripHistoryEntry>(
    'trip_history',
    fetchTripHistory,
    { cacheKey: 'device' },
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

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold text-foreground">運行履歴</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          過去の出庫・帰庫と休息時間を確認できます。
        </p>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          読み込み中…
        </p>
      ) : trips.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          まだ運行履歴がありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {trips.map((trip, i) => (
            <TripCard
              key={trip.id}
              trip={trip}
              restBeforeMs={restBeforeByIndex[i]}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
