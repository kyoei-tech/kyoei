'use client'

import type { ComponentType } from 'react'
import { useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CarFront,
  Coffee,
  TriangleAlert,
} from 'lucide-react'
import { BackHeader } from './back-header'
import { formatClock, formatDuration, type ClockParts } from '@/lib/shift-time'
import {
  FIFTEEN_HOURS_MS,
  FOUR_HOURS_MS,
  TEN_MINUTES_MS,
  THIRTEEN_HOURS_MS,
  THIRTY_MINUTES_MS,
  THREE_HOURS_30_MS,
  TWELVE_HOURS_MS,
  formatHoursMinutes,
  liveBreakTimerMs,
  liveCategoryMs,
  liveContinuousDrivingMs,
  type ActiveCategory,
  type BreakCategory,
  type TripState,
} from '@/lib/trip-log'
import { ConfirmActionModal } from './confirm-action-modal'
import { StyledNotificationText } from './styled-notification-text'
import { PAGE_BLEED_CLASS, pageTintClass } from '@/lib/page-tint'
import {
  getConfirmActionCancelLabel,
  getConfirmActionConfirmLabel,
  getConfirmActionMessage,
  useConfirmActionMessages,
} from '@/lib/notifications/confirm-messages'

type IconProps = { className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }
type IconComponent = ComponentType<IconProps>

/** Car being driven up onto the carrier bed — represents 荷積 (loading). */
const LoadCarIcon: IconComponent = ({ className }) => (
  <span
    className={`relative inline-flex items-center justify-center ${className ?? ''}`}
    aria-hidden="true"
  >
    <CarFront className="h-full w-full" />
    <ArrowUpFromLine
      className="absolute -top-1.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2"
      strokeWidth={3}
    />
  </span>
)

/** Car being driven down off the carrier bed — represents 荷卸 (unloading). */
const UnloadCarIcon: IconComponent = ({ className }) => (
  <span
    className={`relative inline-flex items-center justify-center ${className ?? ''}`}
    aria-hidden="true"
  >
    <CarFront className="h-full w-full" />
    <ArrowDownToLine
      className="absolute -bottom-1.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2"
      strokeWidth={3}
    />
  </span>
)

const BREAK_BUTTONS: { id: BreakCategory; label: string; icon: IconComponent }[] = [
  { id: 'loading', label: '荷積', icon: LoadCarIcon },
  { id: 'unloading', label: '荷卸', icon: UnloadCarIcon },
  { id: 'waiting', label: '待機', icon: Boxes },
  { id: 'resting', label: '休憩', icon: Coffee },
]

const CATEGORY_LABELS: Record<string, string> = {
  driving: '走行時間',
  loading: '荷積時間',
  unloading: '荷降時間',
  waiting: '待機時間',
  resting: '休憩時間',
}

export function DrivingStatusView({
  now,
  departureAt,
  trip,
  onTapCategory,
  onResumeDriving,
  onBack,
  onOpenEmergencyContacts,
}: {
  now: number
  departureAt: number
  trip: TripState
  onTapCategory: (category: BreakCategory) => void
  onResumeDriving: () => void
  onBack: () => void
  onOpenEmergencyContacts?: () => void
}) {
  const [pendingAction, setPendingAction] = useState<
    { kind: 'category'; category: BreakCategory } | { kind: 'resume' } | null
  >(null)
  const { data: confirmMessages } = useConfirmActionMessages()

  const drivingDurationMs = now - departureAt
  const continuousMs = liveContinuousDrivingMs(trip, now)
  const breakTimerMs = liveBreakTimerMs(trip, now)

  // 拘束時間（運行時間）: 12時間超でオレンジ、13時間超で赤文字、15時間超で
  // 赤背景+視認性の高い文字色に切り替える改善基準告示の目安。
  const drivingOverFifteen = drivingDurationMs >= FIFTEEN_HOURS_MS
  const drivingAccent = drivingOverFifteen
    ? 'text-destructive-foreground'
    : drivingDurationMs >= THIRTEEN_HOURS_MS
      ? 'text-destructive'
      : drivingDurationMs >= TWELVE_HOURS_MS
        ? 'text-orange-500'
        : 'text-secondary'

  const continuousOver = continuousMs >= THREE_HOURS_30_MS
  const continuousRemainingMs = Math.max(0, FOUR_HOURS_MS - continuousMs)
  const continuousRemainingMin = Math.ceil(continuousRemainingMs / 60000)

  const breakOrange = breakTimerMs > 0 && breakTimerMs < THIRTY_MINUTES_MS

  const departureParts = formatClock(new Date(departureAt), {
    hour12: false,
    seconds: false,
  })
  const departureDateLabel = `${departureParts.date} ${departureParts.weekday}`

  const isDriving = trip.activeCategory === 'driving'
  // Elapsed time on the *current* break segment only (resets to 0 the
  // moment 走行再開 or a different 荷積/荷卸/待機/休憩 button is pressed),
  // distinct from the categoryList totals below which accumulate across
  // segments for the whole trip.
  const activeSegmentElapsedMs = Math.max(0, now - trip.segmentStartedAt)

  const categoryList: { key: ActiveCategory; ms: number }[] = (
    ['driving', 'loading', 'unloading', 'waiting', 'resting'] as ActiveCategory[]
  ).map((key) => ({
    key,
    ms: liveCategoryMs(trip, key, now),
  }))

  return (
    <div className="flex flex-1 flex-col gap-3 pb-2">
      <BackHeader
        onBack={onBack}
        label="出帰庫"
        trailing={
          onOpenEmergencyContacts && (
            <button
              type="button"
              onClick={onOpenEmergencyContacts}
              className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors active:scale-95"
            >
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
              事故/トラブルの時は
            </button>
          )
        }
      />

      {/* justify-between spreads the enlarged cards evenly down to the
          bottom action row instead of leaving one large gap in the middle. */}
      <div className={`flex flex-1 flex-col justify-between gap-2.5 ${PAGE_BLEED_CLASS} ${pageTintClass('working')}`}>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl border border-border bg-card px-3 py-3 text-center">
          <p className="text-sm font-bold text-foreground">出庫時刻</p>
          <p className="font-mono text-2xl font-bold tabular-nums text-foreground">
            {departureParts.time}
          </p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {departureDateLabel}
          </p>
        </div>
        <div
          className={`rounded-2xl border px-3 py-3 text-center transition-colors ${
            drivingOverFifteen
              ? 'border-destructive bg-destructive'
              : 'border-border bg-card'
          }`}
        >
          <p className={`text-sm font-bold ${drivingAccent}`}>運行時間</p>
          <p
            className={`font-mono text-2xl font-bold tabular-nums ${drivingAccent}`}
          >
            {formatDuration(drivingDurationMs)}
          </p>
          {trip.splitRestRemainingMs != null && (
            <p
              className={`mt-1 text-xs font-bold ${
                drivingOverFifteen ? 'text-destructive-foreground' : 'text-destructive'
              }`}
            >
              分割休息による運行中
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card px-5 py-3">
        <div className="flex items-center justify-between">
          <span
            className={`text-sm font-bold ${
              continuousOver ? 'text-destructive' : 'text-foreground'
            }`}
          >
            連続走行時間
          </span>
          <span
            className={`font-mono text-2xl font-bold tabular-nums ${
              continuousOver ? 'text-destructive' : 'text-foreground'
            }`}
          >
            {formatDuration(continuousMs)}
          </span>
        </div>
        {continuousOver && (
          <p className="mt-1.5 text-right text-sm font-bold text-destructive">
            {`${continuousRemainingMin}分以内に休憩して下さい`}
          </p>
        )}
      </div>

      {!isDriving && (
        <div className="rounded-2xl border border-border bg-card px-5 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">
              {`${
                BREAK_BUTTONS.find((b) => b.id === trip.activeCategory)
                  ?.label ?? ''
              } 経過時間`}
            </span>
            <span className="font-mono text-2xl font-bold tabular-nums text-foreground">
              {formatDuration(activeSegmentElapsedMs)}
            </span>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card px-5 py-3">
        <div className="flex items-center justify-between">
          <span
            className={`text-sm font-bold ${
              breakOrange ? 'text-orange-500' : 'text-foreground'
            }`}
          >
            累計休憩時間
          </span>
          <span
            className={`font-mono text-2xl font-bold tabular-nums ${
              breakOrange ? 'text-orange-500' : 'text-foreground'
            }`}
          >
            {formatDuration(breakTimerMs)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-x-2 gap-y-2 rounded-2xl border border-border bg-card px-5 py-3 text-center">
        {categoryList.map(({ key, ms }) => (
          <div key={key}>
            <p className="text-xs text-muted-foreground">
              {CATEGORY_LABELS[key]}
            </p>
            <p className="font-mono text-base font-semibold tabular-nums text-foreground">
              {formatHoursMinutes(ms)}
            </p>
          </div>
        ))}
        {trip.splitRestRemainingMs != null && (
          <div>
            <p className="text-xs text-muted-foreground">要休息時間</p>
            <p className="font-mono text-base font-bold tabular-nums text-destructive dark:text-orange-500">
              {formatHoursMinutes(trip.splitRestRemainingMs)}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="grid grid-cols-4 gap-2.5">
          {BREAK_BUTTONS.map(({ id, label, icon: Icon }) => {
            const active = trip.activeCategory === id
            // Only dim the *other* buttons once some break category is
            // actually selected. While driving, none of these buttons is
            // selected, so none should look disabled/dimmed.
            const inactive = !active && !isDriving
            return (
              <button
                key={id}
                type="button"
                disabled={active}
                onClick={() => setPendingAction({ kind: 'category', category: id })}
                className={`flex flex-col items-center gap-1.5 rounded-2xl border py-3.5 text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-100 ${
                  active
                    ? 'border-secondary bg-secondary text-secondary-foreground'
                    : inactive
                      ? 'border-border/60 bg-card text-muted-foreground opacity-60 hover:border-secondary/60 hover:opacity-90'
                      : 'border-border/60 bg-card text-foreground hover:border-secondary/60 hover:opacity-90'
                }`}
              >
                <Icon className="h-6 w-6" aria-hidden="true" />
                {active ? `${label}中` : label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          disabled={isDriving}
          onClick={() => setPendingAction({ kind: 'resume' })}
          className={`flex items-center justify-center gap-1.5 rounded-2xl border py-3.5 text-lg font-bold transition-all active:scale-[0.97] disabled:active:scale-100 ${
            isDriving
              ? 'border-border/60 bg-card text-muted-foreground opacity-60'
              : 'border-orange-500 bg-orange-500 text-white hover:bg-orange-600'
          }`}
        >
          {isDriving ? '走行中' : '走行再開'}
        </button>
      </div>
      </div>

      {pendingAction?.kind === 'category' && (
        <ConfirmActionModal
          message={getConfirmActionMessage(
            confirmMessages,
            `driving-category-${pendingAction.category}`,
            `${
              BREAK_BUTTONS.find((b) => b.id === pendingAction.category)
                ?.label
            }を開始しますか？`,
          )}
          confirmLabel={getConfirmActionConfirmLabel(
            confirmMessages,
            `driving-category-${pendingAction.category}`,
            '開始する',
          )}
          cancelLabel={getConfirmActionCancelLabel(
            confirmMessages,
            `driving-category-${pendingAction.category}`,
            'キャンセル',
          )}
          onConfirm={() => {
            onTapCategory(pendingAction.category)
            setPendingAction(null)
          }}
          onCancel={() => setPendingAction(null)}
        />
      )}
      {pendingAction?.kind === 'resume' && (
        <ConfirmActionModal
          message={getConfirmActionMessage(
            confirmMessages,
            'driving-resume',
            '走行再開を開始しますか？',
          )}
          confirmLabel={getConfirmActionConfirmLabel(
            confirmMessages,
            'driving-resume',
            '開始する',
          )}
          cancelLabel={getConfirmActionCancelLabel(
            confirmMessages,
            'driving-resume',
            'キャンセル',
          )}
          onConfirm={() => {
            onResumeDriving()
            setPendingAction(null)
          }}
          onCancel={() => setPendingAction(null)}
          body={
            !trip.breakSatisfied && breakTimerMs < TEN_MINUTES_MS ? (
              <StyledNotificationText
                text={`まだ休憩が10分未満です（現在${formatDuration(breakTimerMs)}）。このまま再開すると、この休憩は累計休憩時間にカウントされません。もう少し休憩しますか？`}
                className="block rounded-xl bg-destructive/10 px-3 py-2.5 text-sm font-bold leading-relaxed text-destructive"
              />
            ) : undefined
          }
        />
      )}
    </div>
  )
}
