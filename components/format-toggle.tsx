import { Clock } from 'lucide-react'

export function FormatToggle({
  hour12,
  onToggle,
}: {
  hour12: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="時刻表記を切り替え"
      aria-pressed={hour12}
      className="flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-95"
    >
      <Clock className="h-3 w-3" aria-hidden="true" />
      {hour12 ? '午前/午後' : '24時間'}
    </button>
  )
}
