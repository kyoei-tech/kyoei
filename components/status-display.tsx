import { Repeat } from 'lucide-react'
import type { ClockParts } from '@/lib/shift-time'

type Mode = 'idle' | 'departure' | 'return'

const LABELS: Record<Mode, string> = {
  idle: '連動表示（待機中）',
  departure: '出庫時刻（固定）',
  return: '帰庫予定時刻（固定）',
}

const ACCENT: Record<Mode, string> = {
  idle: 'text-muted-foreground',
  departure: 'text-secondary',
  return: 'text-primary',
}

export function StatusDisplay({
  parts,
  mode,
  displayOffset,
  onCycleOffset,
}: {
  parts: ClockParts
  mode: Mode
  displayOffset: number
  onCycleOffset: () => void
}) {
  return (
    <section
      aria-label="連動表示"
      className="rounded-3xl border border-border bg-card px-6 py-5"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className={`text-xs font-semibold tracking-wide ${ACCENT[mode]}`}>
          {LABELS[mode]}
        </span>
        <button
          type="button"
          onClick={onCycleOffset}
          aria-label="固定表示の時間差を切り替え"
          className="flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-95"
        >
          <Repeat className="h-3 w-3" aria-hidden="true" />
          {`+${displayOffset}h`}
        </button>
      </div>
      <p className="text-sm font-medium text-muted-foreground">
        {parts.date}
        <span className="ml-2 text-foreground">{parts.weekday}</span>
      </p>
      <p
        className={`mt-0.5 font-mono text-4xl font-semibold tabular-nums tracking-tight ${
          mode === 'idle' ? 'text-foreground' : ACCENT[mode]
        }`}
      >
        {parts.time}
      </p>
    </section>
  )
}
