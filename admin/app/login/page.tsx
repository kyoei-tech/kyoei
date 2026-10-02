import { LoginForm } from './LoginForm'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const params = await searchParams
  const notice = params.idle ? '15分間操作がなかったため、ログアウトしました。' : params.denied ? 'このアカウントでは管理画面を使えません。' : undefined
  return (
    <div className="brand-page">
      <div className="logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/kyoei-logo.png" alt="KYOEI" />
        <span className="badge-admin" style={{ fontSize: 18, padding: '4px 12px' }}>管理画面</span>
      </div>
      <LoginForm notice={notice} />
      <p style={{ margin: 0, fontSize: 12, color: "#8e948b" }}>ログインには、KYOEI アプリ（iPhone）での承認が必要です。15分操作がないと自動でログアウトします。</p>
    </div>
  )
}
