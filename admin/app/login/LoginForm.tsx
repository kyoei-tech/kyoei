'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { normalizeLoginID, syntheticEmail } from '@/lib/tokens'

type Step =
  | { kind: 'password' }
  | { kind: 'approve'; requestId: string; number: number; expiresAt: string; hasDevice: boolean }
  | { kind: 'ended'; reason: 'denied' | 'expired' }

/**
 * ① login ID + password, then ② approval in the KYOEI iPhone app: this page
 * shows a 2-digit number; the admin picks the same number in the app and
 * confirms with Face ID. Only enabled admin accounts get past ①.
 */
export function LoginForm({ notice }: { notice?: string }) {
  const supabase = createClient()
  const [step, setStep] = useState<Step>({ kind: 'password' })
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(notice)
  const polling = useRef<ReturnType<typeof setInterval> | null>(null)

  const startApproval = useCallback(async () => {
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) return
    const { data: account } = await supabase.from('app_accounts').select('is_admin, disabled_at').eq('user_id', user.user.id).maybeSingle()
    if (!account?.is_admin || account.disabled_at) {
      await supabase.auth.signOut()
      setStep({ kind: 'password' })
      setError('このアカウントでは管理画面を使えません。')
      return
    }
    const { data: already } = await supabase.rpc('is_kyoei_admin_mfa')
    if (already === true) {
      window.location.href = '/'
      return
    }
    const { data, error: requestError } = await supabase.rpc('request_admin_login', { p_user_agent: navigator.userAgent })
    const row = (data as { id: string; number: number; expires_at: string; has_device: boolean }[] | null)?.[0]
    if (requestError || !row) {
      setError('承認の依頼を作れませんでした。しばらくしてからお試しください。')
      return
    }
    setError(undefined)
    setStep({ kind: 'approve', requestId: row.id, number: row.number, expiresAt: row.expires_at, hasDevice: row.has_device })
  }, [supabase])

  // Already signed in with a password (e.g. sent back here): continue at ②.
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser()
      if (data.user) await startApproval()
    })()
  }, [supabase, startApproval])

  // While waiting, ask every 2 seconds whether the app answered.
  useEffect(() => {
    if (step.kind !== 'approve') return
    polling.current = setInterval(async () => {
      const { data } = await supabase.rpc('admin_login_status', { p_request: step.requestId })
      if (data === 'approved') {
        clearInterval(polling.current!)
        window.location.href = '/'
      } else if (data === 'denied' || data === 'expired') {
        clearInterval(polling.current!)
        setStep({ kind: 'ended', reason: data })
      }
    }, 2000)
    return () => clearInterval(polling.current!)
  }, [step, supabase])

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault()
    const id = normalizeLoginID(loginId)
    if (!id) {
      setError('ログインIDは半角英数字で入力してください。')
      return
    }
    setBusy(true)
    setError(undefined)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: syntheticEmail(id), password })
    if (signInError) {
      setBusy(false)
      setError('ログインIDまたはパスワードが正しくありません。')
      return
    }
    await startApproval()
    setBusy(false)
  }

  async function restart() {
    await supabase.auth.signOut()
    setStep({ kind: 'password' })
    setPassword('')
  }

  if (step.kind === 'password') {
    return (
      <form className="brand-card" onSubmit={submitPassword}>
        <h1>① ログイン</h1>
        <p>管理者のアカウントでログインします。</p>
        <label className="field">
          ログインID
          <input className="input" value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="username" autoCapitalize="none" required />
        </label>
        <label className="field">
          パスワード
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="slant" type="submit" disabled={busy}>{busy ? '確認中…' : '次へ'}</button>
      </form>
    )
  }

  if (step.kind === 'ended') {
    return (
      <div className="brand-card">
        <h1>② ログインできませんでした</h1>
        <p>{step.reason === 'denied' ? 'KYOEI アプリで拒否されたか、違う数字が選ばれました。' : '承認の期限（3分）が切れました。'}心当たりがない場合は、パスワードを変更してください。</p>
        <button className="slant" type="button" onClick={restart}>最初からやり直す</button>
      </div>
    )
  }

  return (
    <div className="brand-card" style={{ alignItems: 'center', textAlign: 'center' }}>
      <h1>② KYOEI アプリで承認</h1>
      {step.hasDevice ? (
        <>
          <p>iPhone で KYOEI アプリを開き、「管理画面へのログイン」で<b style={{ color: '#f5f7f2' }}>下と同じ数字</b>を選んで、Face ID で承認してください。</p>
          <div aria-live="polite" style={{ fontSize: 88, fontWeight: 900, fontStyle: 'italic', color: '#42e642', lineHeight: 1, margin: '8px 0' }}>{step.number}</div>
          <p>承認を待っています…（3分以内）</p>
        </>
      ) : (
        <p>
          このアカウントの iPhone が、まだ承認用に登録されていません。別の管理者に「再設定コード」を発行してもらい、iPhone の KYOEI アプリで設定し直してください（設定すると、その iPhone が承認用に登録されます）。
        </p>
      )}
      <button type="button" className="btn btn-small" style={{ background: 'transparent', color: '#a6aba3', borderColor: 'rgba(255,255,255,0.2)' }} onClick={restart}>
        やめる
      </button>
    </div>
  )
}
