import type { ClockParts } from '@/lib/shift-time'
import { FormatToggle } from './format-toggle'

export function LiveClock({
  parts,
  hour12,
  onToggleFormat,
}: {
  parts: ClockParts
  hour12: boolean
  onToggleFormat: () => void
}) {
  return (
    <section
      aria-label="現在時刻"
      className="relative rounded-3xl border border-border bg-card px-4 py-2 text-center"
    >
      <div className="absolute right-2 top-2">
        <FormatToggle hour12={hour12} onToggle={onToggleFormat} />
      </div>
      <p className="text-xs font-medium text-muted-foreground">
        {parts.date}
        <span className="ml-2 text-foreground">{parts.weekday}</span>
      </p>
      <p className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
        {parts.meridiem && (
          <span className="mr-1 text-base font-medium text-muted-foreground">
            {parts.meridiem}
          </span>
        )}
        {parts.time}
      </p>
    </section>
  )
}
