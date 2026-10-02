'use client'
import { useState } from 'react'
import type { IssuedCode } from '@/app/(console)/accounts/actions'

/** Shows a just-issued setup / reset code once: QR, typed code, LINE link. */
export function CodeDialog({ issued, onClose }: { issued: IssuedCode; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const expires = new Date(issued.expiresAt).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-label={issued.purpose === 'setup' ? '招待コード' : 'パスワード再設定コード'}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div className="qr" dangerouslySetInnerHTML={{ __html: issued.qrSVG }} />
          <span style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>iPhone のカメラで読み取ると、アプリが開きます</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>{issued.purpose === 'setup' ? '招待コードを発行しました' : 'パスワード再設定コードを発行しました'}</h2>
          <div style={{ fontSize: 14 }}>
            ログインID <b>{issued.loginId}</b>{issued.staffName ? ` ・ ${issued.staffName}` : ''}
          </div>
          <div className="code-box">
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>コード（アプリの「コードで設定する」で入力）</div>
            <div className="code mono">{issued.code}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--orange)', fontWeight: 700 }}>有効期限：{expires}（1回限り）</div>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--muted)' }}>
            LINE などで送る場合は「リンクをコピー」。タップすると KYOEI アプリが開き、パスワードを決めて使い始められます。この画面を閉じると、コードは二度と表示されません。
          </div>
          <div className="row" style={{ marginTop: 'auto' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                await navigator.clipboard.writeText(issued.webURL)
                setCopied(true)
              }}
            >
              {copied ? 'コピーしました' : 'リンクをコピー'}
            </button>
            <button type="button" className="btn" onClick={() => window.print()}>印刷する</button>
            <button type="button" className="btn" onClick={onClose}>閉じる</button>
          </div>
        </div>
      </div>
    </div>
  )
}
