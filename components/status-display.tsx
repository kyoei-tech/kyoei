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
      className="rounded-3xl border border-border bg-card px-5 py-4"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className={`text-base font-bold tracking-wide ${ACCENT[mode]}`}>
          {LABELS[mode]}
        </span>
        <FormatToggle hour12={hour12} onToggle={onToggleFormat} />
      </div>
      <p className="text-sm font-medium text-muted-foreground">
        {parts.date}
        <span className="ml-2 text-foreground">{parts.weekday}</span>
      </p>
      <p
        className={`text-center font-mono text-4xl font-semibold tabular-nums tracking-tight ${
          mode === 'idle' ? 'text-foreground' : ACCENT[mode]
        }`}
      >
        {parts.meridiem && (
          <span className="mr-1 text-sm font-medium text-muted-foreground">
            {parts.meridiem}
          </span>
        )}
        {parts.time}
      </p>
    </section>
  )
}
