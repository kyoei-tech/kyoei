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

  return (
    <div className="flex flex-1 flex-col gap-3">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 self-start text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        ホームへ戻る
      </button>

      <div className="rounded-2xl border border-border bg-card px-4 py-3 text-center">
        <p className="text-xs font-medium text-muted-foreground">
          {nowParts.date}
          <span className="ml-1.5 text-foreground">{nowParts.weekday}</span>
        </p>
        <p className="font-mono text-3xl font-semibold tabular-nums text-foreground">
          {nowParts.time}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card px-3 py-3 text-center">
          <p className="text-xs font-bold text-primary">帰庫時刻</p>
          <p className="font-mono text-xl font-bold tabular-nums text-primary">
            {returnParts.time}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card px-3 py-3 text-center">
          <p className="text-xs font-bold text-primary">出庫可能時刻</p>
          <p className="font-mono text-xl font-bold tabular-nums text-primary">
            {departableParts.time}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
        {COUNTDOWN_OPTIONS.map((h) => {
          const active = h === countdownOffset
          return (
            <button
              key={h}
              type="button"
              onClick={() => onSelectCountdown(h)}
              aria-pressed={active}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors active:scale-95 ${
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

      <div className="rounded-3xl border border-border bg-card px-6 py-6 text-center">
        <p className="text-sm font-bold tracking-wide text-muted-foreground">
          休息時間
        </p>
        <p className="mt-1 font-mono text-5xl font-bold tabular-nums tracking-tight text-foreground">
          {formatDuration(restElapsedMs)}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3">
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
