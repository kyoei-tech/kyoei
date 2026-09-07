import type { ClockParts } from '@/lib/shift-time'
import { FormatToggle } from './format-toggle'

type Mode = 'idle' | 'departure' | 'return'

const LABELS: Record<Mode, string> = {
  idle: '連動表示（待機中）',
  departure: '出庫時刻',
  return: '出庫可能時刻',
}

const ACCENT: Record<Mode, string> = {
  idle: 'text-muted-foreground',
  departure: 'text-secondary',
  return: 'text-primary',
}

export function StatusDisplay({
  parts,
  mode,
  hour12,
  onToggleFormat,
}: {
  parts: ClockParts
  mode: Mode
  hour12: boolean
  onToggleFormat: () => void
}) {
  return (
    <section
      aria-label="連動表示"
      className="rounded-3xl border border-border bg-card px-6 py-5"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className={`text-2xl font-bold tracking-wide ${ACCENT[mode]}`}>
          {LABELS[mode]}
        </span>
        <FormatToggle hour12={hour12} onToggle={onToggleFormat} />
      </div>
      <p className="text-lg font-medium text-muted-foreground">
        {parts.date}
        <span className="ml-2 text-foreground">{parts.weekday}</span>
      </p>
      <p
        className={`my-4 text-center font-mono text-6xl font-semibold tabular-nums tracking-tight ${
          mode === 'idle' ? 'text-foreground' : ACCENT[mode]
        }`}
      >
        {parts.meridiem && (
          <span className="mr-1 text-2xl font-medium text-muted-foreground">
            {parts.meridiem}
          </span>
        )}
        {parts.time}
      </p>
    </section>
  )
}
