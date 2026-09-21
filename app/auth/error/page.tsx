import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

// Landing spot when the email confirmation link's code exchange fails (see
// app/auth/callback/route.ts). Not part of the SPA's tab flow — reached
// only via a link clicked outside the app.
export default function AuthErrorPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6">
      <div className="w-full max-w-xs rounded-3xl border border-border bg-card p-6 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle
            className="h-5 w-5 text-destructive"
            aria-hidden="true"
          />
        </div>
        <h1 className="text-base font-bold text-foreground">
          確認できませんでした
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          リンクの有効期限が切れている、または既に使用されている可能性があります。もう一度アプリから登録をお試しください。
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
        >
          アプリに戻る
        </Link>
      </div>
    </main>
  )
}
