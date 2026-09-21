import { Construction } from 'lucide-react'

/**
 * Placeholder for 試験運転モード menu pages that don't have real content
 * yet (点検簿・自己評価シート・社長賞投票・休暇申請・修理申請・荷姿履歴).
 * Each of these will be replaced by a dedicated view as they're built out.
 */
export function ComingSoonView({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
        <Construction
          className="h-8 w-8 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="text-sm font-semibold text-foreground">
          この機能は準備中です
        </p>
        <p className="text-xs text-muted-foreground">
          試験運転モードで先行公開しています。近日中に使えるようになります。
        </p>
      </div>
    </div>
  )
}
