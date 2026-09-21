'use client'

import { IdCard, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { useSettings } from '@/lib/settings/settings-context'
import { tenureDuration, formatTenure, formatHireDate } from '@/lib/tenure'

type StaffOption = { id: string; name: string; hire_date: string | null }

// Same table, only the fields this page needs — distinct from
// staff-attendance-view.tsx's fuller StaffRow shape (see the cacheKey note
// in use-realtime-table.ts).
async function fetchStaffProfiles(): Promise<StaffOption[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('staff_members')
    .select('id, name, hire_date')
  if (error) throw error
  return (data as StaffOption[]) ?? []
}

/**
 * 試験運転モードのマイページ。この端末に紐づく乗務員（設定 > 出勤簿の乗務員ID
 * で選択済み）の名前・入社年月日・勤続年数を表示するだけの簡易ページ。
 * ボタン化はせず、テキストとして提示する。
 */
export function MyPageView() {
  const { staffMemberId } = useSettings()
  const { data: profiles } = useRealtimeTable<StaffOption>(
    'staff_members',
    fetchStaffProfiles,
    { cacheKey: 'mypage-profile' },
  )

  const me = staffMemberId
    ? profiles.find((p) => p.id === staffMemberId) ?? null
    : null

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold text-foreground">マイページ</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          この端末に登録されている乗務員情報です。
        </p>
      </div>

      {me ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary">
              <IdCard className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-lg font-bold text-foreground">
              {me.name}
            </span>
          </div>
          <dl className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <dt className="text-sm text-muted-foreground">入社年月日</dt>
              <dd className="text-sm font-semibold text-foreground">
                {formatHireDate(me.hire_date) ?? '未登録'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-sm text-muted-foreground">勤続年数</dt>
              <dd className="text-sm font-semibold text-foreground">
                {(() => {
                  const duration = tenureDuration(me.hire_date)
                  return duration ? formatTenure(duration) : '未登録'
                })()}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
          <Settings
            className="h-7 w-7 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-sm font-semibold text-foreground">
            乗務員IDが未設定です
          </p>
          <p className="text-xs text-muted-foreground">
            メニュー &gt; 設定 &gt; 出勤簿の乗務員IDから、自分の名前を選択してください。
          </p>
        </div>
      )}
    </div>
  )
}
