'use client'

import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import {
  useAuthenticatedStaff,
  type StaffOption,
} from '@/lib/supabase/use-authenticated-staff'
import { AuthForm } from './auth-form'

/**
 * Gates a per-driver feature behind login + the one-time "自分の名前を
 * 選ぶ" staff link (see use-authenticated-staff.ts). Renders the
 * login/link UI itself while unresolved, and only calls `children` with
 * the resolved staff row once ready — mirrors mypage-view.tsx, which was
 * the first feature to need this and is not itself built on this gate to
 * avoid disturbing its already-shipped UI.
 */
export function StaffAuthGate({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: (staff: StaffOption) => ReactNode
}) {
  const { user, me, unlinked, linking, linkError, linkTo } =
    useAuthenticatedStaff()

  if (user === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <Heading title={title} description={description} />
        <div className="h-32 animate-pulse rounded-2xl border border-border bg-card/50" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex flex-col gap-4">
        <Heading title={title} description={description} />
        <AuthForm
          onSignedIn={() => {}}
          description={`${title}を利用するにはアカウント登録が必要です。`}
        />
      </div>
    )
  }

  if (!me) {
    return (
      <div className="flex flex-col gap-4">
        <Heading title={title} description={description} />
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-5">
          <p className="text-sm font-semibold text-foreground">
            ご自身の名前を選択してください
          </p>
          <p className="text-xs text-muted-foreground">
            乗務員一覧から自分の名前を1回だけ選ぶと、次回以降はログインするだけで利用できます。
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
      </div>
    )
  }

  return <>{children(me)}</>
}

function Heading({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div>
      <h2 className="text-xl font-bold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
