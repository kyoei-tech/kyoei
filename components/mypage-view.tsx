'use client'

import { useState } from 'react'
import {
  Award,
  CalendarOff,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileText,
  History,
  IdCard,
  LogOut,
  PackageSearch,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuthenticatedStaff } from '@/lib/supabase/use-authenticated-staff'
import { tenureDuration, formatTenure, formatHireDate } from '@/lib/tenure'
import { AuthForm } from './auth-form'
import { BackHeader } from './back-header'
import { DispatchSheetView } from './dispatch-sheet-view'
import { TripHistoryView } from './trip-history-view'
import { ComingSoonView } from './coming-soon-view'

type SubItemId =
  | 'dispatch-sheet'
  | 'trip-history'
  | 'inspection'
  | 'self-eval'
  | 'award-vote'
  | 'leave-request'
  | 'repair-request'
  | 'packaging-history'

// These used to be their own 試験運転モード menu entries (see
// menu-view.tsx's history); they now live inside マイページ, below the
// driver's own profile, since every one of them is personal to the
// signed-in driver rather than a general reference page.
const SUB_ITEMS: {
  id: SubItemId
  label: string
  description: string
  Icon: LucideIcon
}[] = [
  {
    id: 'dispatch-sheet',
    label: '配車表',
    description: '配車表を確認できます。',
    Icon: FileText,
  },
  {
    id: 'trip-history',
    label: '運行履歴',
    description: '過去の出庫・帰庫と休息時間を確認できます。',
    Icon: History,
  },
  {
    id: 'inspection',
    label: '点検簿',
    description: '車両の点検記録を確認できます。',
    Icon: ClipboardCheck,
  },
  {
    id: 'self-eval',
    label: '自己評価シート',
    description: '自己評価を記入・確認できます。',
    Icon: ClipboardList,
  },
  {
    id: 'award-vote',
    label: '社長賞投票',
    description: '社長賞にふさわしい方へ投票できます。',
    Icon: Award,
  },
  {
    id: 'leave-request',
    label: '休暇申請',
    description: '休暇の申請ができます。',
    Icon: CalendarOff,
  },
  {
    id: 'repair-request',
    label: '修理申請',
    description: '車両の修理を申請できます。',
    Icon: Wrench,
  },
  {
    id: 'packaging-history',
    label: '荷姿履歴',
    description: '荷姿の履歴を確認できます。',
    Icon: PackageSearch,
  },
]

const COMING_SOON_TITLES: Record<
  Exclude<SubItemId, 'dispatch-sheet' | 'trip-history'>,
  { title: string; description: string }
> = {
  inspection: {
    title: '点検簿',
    description: '車両の点検記録を確認できます。',
  },
  'self-eval': {
    title: '自己評価シート',
    description: '自己評価を記入・確認できます。',
  },
  'award-vote': {
    title: '社長賞投票',
    description: '社長賞にふさわしい方へ投票できます。',
  },
  'leave-request': {
    title: '休暇申請',
    description: '休暇の申請ができます。',
  },
  'repair-request': {
    title: '修理申請',
    description: '車両の修理を申請できます。',
  },
  'packaging-history': {
    title: '荷姿履歴',
    description: '荷姿の履歴を確認できます。',
  },
}

/**
 * マイページ。メール+パスワードでログインした本人のアカウントに、乗務員
 * 一覧から自分の名前を1回だけ紐づけると、名前・入社年月日・勤続年数が
 * シンプルに表示され、その下に本人専用の各機能（配車表・運行履歴など）
 * への入口が並ぶ。紐づけ後は auth_user_id で本人確認するので、2台目以降
 * の端末でログインしても同じ情報が見える。ログイン+紐づけの共通ロジック
 * は use-authenticated-staff.ts に切り出してある。
 */
export function MyPageView() {
  const { user, me, unlinked, linking, linkError, linkTo, signOut } =
    useAuthenticatedStaff()
  const [selected, setSelected] = useState<SubItemId | null>(null)

  if (user === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeading />
        <div className="h-32 animate-pulse rounded-2xl border border-border bg-card/50" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeading />
        <AuthForm onSignedIn={() => {}} />
      </div>
    )
  }

  if (!me) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeading />
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-5">
          <p className="text-sm font-semibold text-foreground">
            ご自身の名前を選択してください
          </p>
          <p className="text-xs text-muted-foreground">
            乗務員一覧から自分の名前を1回だけ選ぶと、次回以降はログインするだけで表示されます。
          </p>
          {unlinked.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              選択できる乗務員が見つかりませんでした。管理者にご確認ください。
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {unlinked.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={linking}
                    onClick={() => linkTo(p.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3 text-left transition-colors hover:border-primary/60 hover:bg-accent active:scale-[0.99] disabled:opacity-50"
                  >
                    <span className="text-sm font-semibold text-foreground">
                      {p.name}
                    </span>
                    <ChevronRight
                      className="h-4 w-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {linkError && (
            <p className="text-xs font-semibold text-destructive">
              {linkError}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={signOut}
          className="flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent active:scale-95"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          ログアウト
        </button>
      </div>
    )
  }

  if (selected) {
    const comingSoon =
      selected !== 'dispatch-sheet' && selected !== 'trip-history'
        ? COMING_SOON_TITLES[selected]
        : null
    return (
      <div className="flex flex-col gap-4">
        <BackHeader
          onBack={() => setSelected(null)}
          label="マイページへ戻る"
          variant="subtle"
        />
        {selected === 'dispatch-sheet' && (
          <DispatchSheetView staffId={me.id} staffName={me.name} />
        )}
        {selected === 'trip-history' && <TripHistoryView />}
        {comingSoon && (
          <ComingSoonView
            title={comingSoon.title}
            description={comingSoon.description}
          />
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeading />
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary">
            <IdCard className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-lg font-bold text-foreground">{me.name}</span>
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

      <ul className="flex flex-col gap-2.5">
        {SUB_ITEMS.map(({ id, label, description, Icon }) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => setSelected(id)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:border-primary/60 hover:bg-accent active:scale-[0.99]"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="flex flex-col">
                  <span className="text-base font-semibold text-foreground">
                    {label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {description}
                  </span>
                </span>
              </span>
              <ChevronRight
                className="h-5 w-5 text-muted-foreground"
                aria-hidden="true"
              />
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={signOut}
        className="flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent active:scale-95"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        ログアウト
      </button>
    </div>
  )
}

function PageHeading() {
  return (
    <div>
      <h2 className="text-xl font-bold text-foreground">マイページ</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        ご自身の名前・入社年月日・勤続年数を確認できます。
      </p>
    </div>
  )
}
