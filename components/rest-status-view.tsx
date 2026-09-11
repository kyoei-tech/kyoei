'use client'

import { ArrowLeft } from 'lucide-react'
import { formatClock, formatDuration, type ClockParts } from '@/lib/shift-time'

const COUNTDOWN_OPTIONS = [3, 9, 33]

export function RestStatusView({
  nowParts,
  returnedAt,
  restElapsedMs,
  countdownOffset,
  onSelectCountdown,
  onBack,
}: {
  nowParts: ClockParts
  returnedAt: number
  restElapsedMs: number
  countdownOffset: number
  onSelectCountdown: (hours: number) => void
  onBack: () => void
}) {
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

  return (
    <div className="flex flex-1 flex-col gap-3">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 self-start rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-transform active:scale-95"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        出帰庫
      </button>

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
          <p className="font-mono text-2xl font-bold tabular-nums text-primary">
            {returnParts.time}
          </p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {returnDateLabel}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card px-3 py-3.5 text-center">
          <p className="text-sm font-bold text-primary">出庫可能時刻</p>
          <p className="font-mono text-2xl font-bold tabular-nums text-primary">
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
    </div>
  )
}
