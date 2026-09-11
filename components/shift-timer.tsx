import { Timer } from 'lucide-react'

type Mode = 'idle' | 'departure' | 'return'

const LABELS: Record<Mode, string> = {
  idle: 'タイマー',
  departure: '運行時間',
  return: '出庫可能時刻まで残り',
}

const COUNTDOWN_OPTIONS = [3, 9, 33]

// Matches the label accent used by StatusDisplay's 出庫時刻/出庫可能時刻 text
// so the two linked labels read as one visual pair.
const LABEL_ACCENT: Record<Mode, string> = {
  idle: 'text-muted-foreground',
  departure: 'text-secondary',
  return: 'text-primary',
}

export function ShiftTimer({
  mode,
  text,
  finished,
  countdownOffset,
  onSelectCountdown,
}: {
  mode: Mode
  text: string
  finished: boolean
  countdownOffset: number
  onSelectCountdown: (hours: number) => void
}) {
  const accent =
    mode === 'departure'
      ? 'text-secondary'
      : mode === 'return'
        ? finished
          ? 'text-destructive'
          : 'text-primary'
        : 'text-muted-foreground'

  return (
    <section
      aria-label="シフトタイマー"
      className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-border bg-card px-5 py-6 text-center"
    >
      <div className="mb-1.5 flex items-center justify-center gap-1.5">
        <Timer className={`h-5 w-5 ${LABEL_ACCENT[mode]}`} aria-hidden="true" />
        <span className={`text-base font-bold tracking-wide ${LABEL_ACCENT[mode]}`}>
          {LABELS[mode]}
        </span>
      </div>
      <p
        className={`font-mono font-bold tabular-nums tracking-tight ${accent}`}
      >
        {(() => {
          const [hh, mm, ss] = text.split(':')
          return (
            <>
              <span className="text-6xl">{`${hh}:${mm}`}</span>
              <span className="ml-1.5 text-3xl">{`:${ss}`}</span>
            </>
          )
        })()}
      </p>

      {mode === 'return' ? (
        <div className="mt-3 flex items-center justify-center gap-2.5">
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
      ) : mode === 'idle' ? (
        <p className="mt-3 text-sm text-muted-foreground">
          出庫・帰庫ボタンで開始します
        </p>
      ) : null}

      {finished && (
        <p className="mt-3 text-base font-semibold text-destructive">
          出庫可能時刻になりました
        </p>
      )}
    </section>
  )
}
