import type { ClockParts } from '@/lib/shift-time'

export function LiveClock({ parts }: { parts: ClockParts }) {
  return (
    <section
      aria-label="現在時刻"
      className="rounded-3xl border border-border bg-card px-6 py-7 text-center"
    >
      <p className="text-base font-medium text-muted-foreground">
        {parts.date}
        <span className="ml-2 text-foreground">{parts.weekday}</span>
      </p>
      <p className="mt-1 font-mono text-5xl font-semibold tabular-nums tracking-tight text-foreground">
        {parts.time}
      </p>
    </section>
  )
}
