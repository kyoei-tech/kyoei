import { appSetupURL, formatToken, normalizeToken } from '@/lib/tokens'

/**
 * Public landing page for setup links sent over LINE etc. (custom URL
 * schemes aren't tappable there). Opens the KYOEI app with the code, and
 * shows the code for typing in by hand. The code itself is only checked when
 * the app redeems it.
 */
export default async function SetupLanding({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const raw = (await searchParams).t
  const token = typeof raw === 'string' ? normalizeToken(raw) : null
  return (
    <div className="brand-page">
      <div className="logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/kyoei-logo.png" alt="KYOEI" />
      </div>
      <div className="brand-card">
        <h1>KYOEI アプリの設定</h1>
        {token ? (
          <>
            <p>KYOEI アプリを入れた iPhone で、下のボタンを押してください。アプリが開き、パスワードを決めるとすぐに使い始められます。</p>
            <a className="slant" href={appSetupURL(token)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
              KYOEI アプリで開く
            </a>
            <p>開かない場合は、アプリのログイン画面で「管理者から受け取ったコードで設定する」を押し、このコードを入力してください。</p>
            <div className="mono" style={{ textAlign: 'center', fontSize: 26, fontWeight: 800, letterSpacing: '0.06em', color: '#f5f7f2' }}>{formatToken(token)}</div>
            <p>コードは1回だけ使えます。期限が切れた場合は、管理者に新しいコードを発行してもらってください。</p>
          </>
        ) : (
          <p>このリンクは正しくありません。管理者に、もう一度リンクを送ってもらってください。</p>
        )}
      </div>
    </div>
  )
}
