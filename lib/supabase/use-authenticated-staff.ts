'use client'

import { useEffect, useState } from 'react'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { createClient } from './client'
import { useRealtimeTable } from './use-realtime-table'

export type StaffOption = {
  id: string
  name: string
  hire_date: string | null
  auth_user_id: string | null
}

async function fetchStaffProfiles(): Promise<StaffOption[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('staff_members')
    .select('id, name, hire_date, auth_user_id')
  if (error) throw error
  return (data as StaffOption[]) ?? []
}

/**
 * Shared login + "自分の名前を選ぶ" linking state for any feature that's
 * per-driver (マイページ, 配車表). A user must be signed in via Supabase
 * Auth *and* have linked their account to a `staff_members` row (once,
 * via `linkTo`) before `me` is non-null. See mypage-view.tsx for the
 * original version of this flow.
 */
export function useAuthenticatedStaff() {
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

  const me = user ? profiles.find((p) => p.auth_user_id === user.id) ?? null : null
  const unlinked = profiles.filter((p) => p.auth_user_id === null)

  async function linkTo(staffId: string) {
    if (!user) return
    setLinking(true)
    setLinkError(null)
    const supabase = createClient()
    const { error } = await supabase
      .from('staff_members')
      .update({ auth_user_id: user.id })
      .eq('id', staffId)
      .is('auth_user_id', null)
    setLinking(false)
    if (error) {
      setLinkError('紐づけに失敗しました。もう一度お試しください。')
      return
    }
    await mutate()
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
  }

  return {
    // undefined = still resolving initial session
    user,
    me,
    unlinked,
    linking,
    linkError,
    linkTo,
    signOut,
  }
}
