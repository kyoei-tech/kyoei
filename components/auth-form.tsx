'use client'

import { useState } from 'react'
import { Mail, MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/**
 * Embedded email + password sign-up / login, used by マイページ (see
 * mypage-view.tsx). Not a routed page — the app has no other navigation
 * beyond its bottom tabs, so this renders inline where マイページ needs it.
 * Errors are genericized per the Supabase skill (no raw signUp /
 * signInWithPassword messages), except for the specific signals users must
 * act on (unconfirmed email, weak password, rate limit).
 */
export function AuthForm({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<'login' | 'sign-up'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signUpSent, setSignUpSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)

    const supabase = createClient()

    if (mode === 'sign-up') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ??
            `${window.location.origin}/auth/callback`,
        },
      })
      setSubmitting(false)
      if (error) {
        if (error.message.toLowerCase().includes('password')) {
          setError('パスワードは6文字以上で入力してください。')
        } else if (error.message.toLowerCase().includes('rate limit')) {
          setError('しばらく時間をおいて再度お試しください。')
        } else {
          setError('登録できませんでした。時間をおいて再度お試しください。')
        }
        return
      }
      setSignUpSent(true)
      return
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    setSubmitting(false)
    if (error) {
      if (error.message.toLowerCase().includes('email not confirmed')) {
        setError(
          '登録時に届いたメールの確認リンクを開いてから、ログインしてください。',
        )
      } else {
        setError('メールアドレスまたはパスワードが正しくありません。')
      }
      return
    }
    onSignedIn()
  }

  if (signUpSent) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-10 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary">
          <MailCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="text-sm font-semibold text-foreground">
          確認メールを送信しました
        </p>
        <p className="text-xs text-muted-foreground">
          {email} 宛のメールに記載のリンクを開くと、登録が完了します。
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card px-5 py-5">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Mail className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-base font-bold text-foreground">
            {mode === 'login' ? 'ログイン' : '新規登録'}
          </p>
          <p className="text-xs text-muted-foreground">
            マイページを利用するにはアカウント登録が必要です。
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            メールアドレス
          </span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            パスワード
          </span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={
              mode === 'login' ? 'current-password' : 'new-password'
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
          />
        </label>

        {error && (
          <p className="text-xs font-semibold text-destructive">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-1 flex items-center justify-center rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          {mode === 'login' ? 'ログイン' : '登録する'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'login' ? 'sign-up' : 'login')
          setError(null)
        }}
        className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
      >
        {mode === 'login'
          ? 'アカウントをお持ちでない方はこちら'
          : 'すでにアカウントをお持ちの方はこちら'}
      </button>
    </div>
  )
}
