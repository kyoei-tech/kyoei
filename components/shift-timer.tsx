import { Timer } from 'lucide-react'

type Mode = 'idle' | 'departure' | 'return'

const LABELS: Record<Mode, string> = {
  idle: 'タイマー',
  departure: '経過時間 — カウントアップ',
  return: '残り時間 — カウントダウン',
}

const COUNTDOWN_OPTIONS = [4, 9, 33]

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
      className="rounded-3xl border border-border bg-card px-6 py-6 text-center"
    >
      <div className="mb-2 flex items-center justify-center gap-1.5">
        <Timer className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="text-xs font-semibold tracking-wide text-muted-foreground">
          {LABELS[mode]}
        </span>
      </div>
      <p
        className={`font-mono text-6xl font-bold tabular-nums tracking-tight ${accent}`}
      >
        {text}
      </p>

      {mode === 'return' ? (
        <div className="mt-4 flex items-center justify-center gap-2">
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
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          {mode === 'departure'
            ? 'カウントアップ中は切替できません'
            : '出庫・帰庫ボタンで開始します'}
        </p>
      )}

      {finished && (
        <p className="mt-3 text-sm font-semibold text-destructive">
          帰庫予定時刻になりました
        </p>
      )}
    </section>
  )
}
