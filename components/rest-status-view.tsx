'use client'

import { formatClock, formatDuration, type ClockParts } from '@/lib/shift-time'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { fetchTripHistory, type TripHistoryEntry } from '@/lib/trip-history'
import { BackHeader } from './back-header'
import { LegalCheckCard } from './legal-check-card'
import { PAGE_BLEED_CLASS, pageTintClass } from '@/lib/page-tint'

const COUNTDOWN_OPTIONS = [3, 9, 33]

export function RestStatusView({
  now,
  nowParts,
  returnedAt,
  restElapsedMs,
  countdownOffset,
  onSelectCountdown,
  onBack,
  isSplitRestReturn = false,
}: {
  now: number
  nowParts: ClockParts
  returnedAt: number
  restElapsedMs: number
  countdownOffset: number
  onSelectCountdown: (hours: number) => void
  onBack: () => void
  // True when the trip that just ended was itself a 分割休息 departure with
  // unfulfilled rest remaining, so this rest period must complete that
  // sequence rather than starting a fresh 9h/33h rest — see home-view.tsx.
  isSplitRestReturn?: boolean
}) {
  const { data: trips } = useRealtimeTable<TripHistoryEntry>(
    'trip_history',
    fetchTripHistory,
    { cacheKey: 'device' },
  )

  const returnParts = formatClock(new Date(returnedAt), {
    hour12: false,
    seconds: false,
  })
  const departableParts = formatClock(
    new Date(returnedAt + countdownOffset * 3600 * 1000),
    { hour12: false, seconds: false },
  )
  const returnDateLabel = `${returnParts.date} ${returnParts.weekday}`
  const departableDateLabel = `${departableParts.date} ${departableParts.weekday}`
  // The 分割休息満了時刻 label only applies while still completing the split
  // (3h) option. Switching to 9h/33h means the driver is taking a full rest
  // instead, forfeiting the split — so it's just a normal 出庫可能時刻.
  const isCompletingSplitRest = isSplitRestReturn && countdownOffset === 3

  return (
    <div
      className={`flex flex-1 flex-col gap-3 ${PAGE_BLEED_CLASS} ${pageTintClass('resting')}`}
    >
      <BackHeader onBack={onBack} label="出帰庫" />

      <div className="rounded-2xl border border-border bg-card px-5 py-3 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          {nowParts.date}
          <span className="ml-1.5 text-foreground">{nowParts.weekday}</span>
        </p>
        <p className="font-mono text-3xl font-semibold tabular-nums text-foreground">
          {nowParts.time}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card px-3 py-3.5 text-center">
          <p className="text-sm font-bold text-primary">帰庫時刻</p>
          <p className="font-mono text-2xl font-bold tabular-nums text-white">
            {returnParts.time}
          </p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {returnDateLabel}
          </p>
        </div>
        <div
          className={`rounded-2xl border px-3 py-3.5 text-center ${
            isCompletingSplitRest
              ? 'border-destructive bg-destructive/10'
              : 'border-border bg-card'
          }`}
        >
          <p
            className={`text-sm font-bold ${
              isCompletingSplitRest ? 'text-destructive' : 'text-orange-500'
            }`}
          >
            {isCompletingSplitRest ? '分割休息満了時刻' : '出庫可能時刻'}
          </p>
          <p
            className={`font-mono text-2xl font-bold tabular-nums ${
              isCompletingSplitRest ? 'text-destructive' : 'text-white'
            }`}
          >
            {departableParts.time}
          </p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {departableDateLabel}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2.5">
        {COUNTDOWN_OPTIONS.map((h) => {
          const active = h === countdownOffset
          return (
            <button
              key={h}
              type="button"
              onClick={() => onSelectCountdown(h)}
              aria-pressed={active}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors active:scale-95 ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {`${h}時間`}
            </button>
          )
        })}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-border bg-card px-6 py-6 text-center">
        {isCompletingSplitRest && (
          <p className="mb-1 text-sm font-bold text-destructive">
            分割休息中
          </p>
        )}
        <p className="text-base font-bold tracking-wide text-muted-foreground">
          休息時間
        </p>
        <p className="mt-1 font-mono text-6xl font-bold tabular-nums tracking-tight text-foreground">
          {formatDuration(restElapsedMs)}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-muted/40 px-5 py-3.5">
        <p className="text-sm leading-relaxed text-foreground">
          分割休息は1回<span className="font-bold text-destructive">3時間</span>
          以上とること。
          <br />
          2分割の場合は休息期間が合計
          <span className="font-bold text-destructive">10時間</span>
          以上、
          <br />
          3分割の場合は合計
          <span className="font-bold text-destructive">12時間</span>
          以上になるように休息をとること。
        </p>
      </div>

      <LegalCheckCard trips={trips} now={now} />
    </div>
  )
}
