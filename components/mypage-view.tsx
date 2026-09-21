'use client'

import { useEffect, useState } from 'react'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { ChevronRight, IdCard, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { tenureDuration, formatTenure, formatHireDate } from '@/lib/tenure'
import { AuthForm } from './auth-form'

type StaffOption = {
  id: string
  name: string
  hire_date: string | null
  auth_user_id: string | null
}

// Same table, only the fields this page needs — distinct from
// staff-attendance-view.tsx's fuller StaffRow shape (see the cacheKey note
// in use-realtime-table.ts).
async function fetchStaffProfiles(): Promise<StaffOption[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('staff_members')
    .select('id, name, hire_date, auth_user_id')
  if (error) throw error
  return (data as StaffOption[]) ?? []
}

/**
 * マイページ。メール+パスワードでログインした本人のアカウントに、乗務員
 * 一覧から自分の名前を1回だけ紐づけると、名前・入社年月日・勤続年数が
 * 表示される。紐づけ後は auth_user_id で本人確認するので、2台目以降の端末
 * でログインしても同じ情報が見える。
 */
export function MyPageView() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  const { data: profiles, mutate } = useRealtimeTable<StaffOption>(
    'staff_members',
    fetchStaffProfiles,
    { cacheKey: 'mypage-profile' },
  )

  useEffect(() => {
    const supabase = createClient()
    supabase.auth
      .getUser()
      .then(({ data }: { data: { user: User | null } }) =>
        setUser(data.user ?? null),
      )
    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setUser(session?.user ?? null)
      },
    )
    return () => sub.subscription.unsubscribe()
  }, [])

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

  const me = profiles.find((p) => p.auth_user_id === user.id) ?? null
  const unlinked = profiles.filter((p) => p.auth_user_id === null)

  async function linkTo(staffId: string) {
    setLinking(true)
    setLinkError(null)
    const supabase = createClient()
    const { error } = await supabase
      .from('staff_members')
      .update({ auth_user_id: user!.id })
      .eq('id', staffId)
      .is('auth_user_id', null)
    setLinking(false)
    if (error) {
      setLinkError('紐づけに失敗しました。もう一度お試しください。')
      return
    }
    await mutate()
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
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
          onClick={handleSignOut}
          className="flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent active:scale-95"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          ログアウト
        </button>
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
      <button
        type="button"
        onClick={handleSignOut}
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
