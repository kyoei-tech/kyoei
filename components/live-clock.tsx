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
      className="relative rounded-3xl border border-border bg-card px-6 py-7 text-center"
    >
      <div className="absolute right-3 top-3">
        <FormatToggle hour12={hour12} onToggle={onToggleFormat} />
      </div>
      <p className="text-xl font-medium text-muted-foreground">
        {parts.date}
        <span className="ml-2 text-foreground">{parts.weekday}</span>
      </p>
      <p className="mt-1 font-mono text-5xl font-semibold tabular-nums tracking-tight text-foreground">
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
