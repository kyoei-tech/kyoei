import type { ClockParts } from '@/lib/shift-time'

export function LiveClock({ parts }: { parts: ClockParts }) {
  return (
    <section
      aria-label="現在時刻"
      className="rounded-3xl border border-border bg-card px-6 py-7 text-center"
    >
      <div className="mb-3 flex items-center justify-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-secondary" />
        </span>
        <span className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
          現在時刻
        </span>
      </div>
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
