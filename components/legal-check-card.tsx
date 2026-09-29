'use client'

import { ShieldCheck } from 'lucide-react'
import {
  canTakeHolidayShift,
  getRemainingOver14hCount,
  getSplitRestUsageThisMonth,
} from '@/lib/legal-limits'
import type { TripHistoryEntry } from '@/lib/trip-history'

/**
 * 改善基準告示の法定チェック（今週の14時間超え運行残数・今月の分割休息残数・
 * 休日出勤可否）。乗務員モードの帳票 —休息ページ（RestStatusView）と運行履歴の
 * カレンダー — に常時表示する。タイムカードモード（乗務員以外の勤務者向け）
 * には表示しない。
 */
export function LegalCheckCard({
  trips,
  now,
}: {
  trips: TripHistoryEntry[]
  now: number
}) {
  const remainingOver14hCount = getRemainingOver14hCount(trips, now)
  const { used: splitRestUsed, total: splitRestTotal } =
    getSplitRestUsageThisMonth(trips, now)
  // 基準は「分割休息の回数 < 当該月の総勤務回数の半分」。月の途中は総勤務回数が
  // まだ増えていく途中なので、この判定自体も目安にすぎない。
  const splitRestOverHalf =
    splitRestTotal > 0 && splitRestUsed * 2 >= splitRestTotal
  const holidayShiftAvailable = canTakeHolidayShift(trips, now)

  return (
    <section
      aria-label="法定チェック"
      className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card px-5 py-4"
    >
      <div className="flex items-center gap-1.5">
        <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="text-sm font-bold tracking-wide text-primary">
          法定チェック
        </span>
      </div>
      <div className="flex flex-col gap-1.5 text-sm text-foreground">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">
            今月の分割休息使用回数（目安：全運行の半分未満）
          </span>
          <span
            className={`font-mono text-base font-bold tabular-nums ${
              splitRestOverHalf ? 'text-destructive' : 'text-foreground'
            }`}
          >
            {splitRestUsed}回 / {splitRestTotal}回中
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">
            今週あと何回14時間超え運行ができるか
          </span>
          <span className="font-mono text-base font-bold tabular-nums">
            {remainingOver14hCount}回
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">今週は休日出勤が可能か</span>
          <span
            className={`text-sm font-bold ${
              holidayShiftAvailable ? 'text-secondary' : 'text-muted-foreground'
            }`}
          >
            {holidayShiftAvailable ? '可能' : '不可'}
          </span>
        </div>
      </div>
    </section>
  )
}
