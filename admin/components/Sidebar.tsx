'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Item = { href: string; label: string; ready?: boolean }
const NAV: { title?: string; items: Item[] }[] = [
  { items: [{ href: '/', label: 'ホーム', ready: true }, { href: '/accounts', label: 'アカウント', ready: true }, { href: '/customers', label: 'POS番号一覧', ready: true }, { href: '/vehicles', label: '車両', ready: true }, { href: '/red-plates', label: '赤枠管理', ready: true }] },
  {
    title: 'アプリ内編集',
    items: [
      { href: '/content/news', label: 'おしらせ', ready: true }, { href: '/content/staff', label: '出勤簿（社員）', ready: true }, { href: '/content/yard', label: 'ヤード配置', ready: true },
      { href: '/content/lol', label: 'LoL・LoL MAP', ready: true }, { href: '/content/aa', label: 'オークション情報', ready: true }, { href: '/content/cars', label: '高額車', ready: true },
      { href: '/content/emergency', label: '緊急連絡先', ready: true }, { href: '/content/notes', label: '初心者ノート', ready: true }, { href: '/content/terms', label: 'ドライバー語録', ready: true },
      { href: '/content/qa', label: 'Q&A', ready: true }, { href: '/content/goal', label: '今月の目標', ready: true },
    ],
  },
  {
    title: 'マイページの申請・記録',
    items: [
      { href: '/inspections', label: '点検簿', ready: true }, { href: '/packing', label: '荷姿履歴', ready: true }, { href: '/self-review', label: '自己評価シート', ready: true }, { href: '/award', label: '社長賞', ready: true },
      { href: '/leave', label: '休暇申請', ready: true }, { href: '/repairs', label: '修理申請', ready: true },
    ],
  },
  { title: '設定', items: [{ href: '/content/messages', label: '確認メッセージ', ready: true }, { href: '/content/notifications', label: '通知のルール', ready: true }] },
  { items: [{ href: '/history', label: '変更履歴', ready: true }] },
]

export function Sidebar({ label, loginId }: { label: string; loginId: string }) {
  const path = usePathname()
  const active = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`))
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/kyoei-logo.png" alt="KYOEI" />
        <span className="badge-admin">管理</span>
      </div>
      <nav className="nav" aria-label="管理メニュー">
        {NAV.map((group, i) => (
          <div key={i}>
            {group.title ? <div className="nav-group">{group.title}</div> : <div style={{ height: 10 }} />}
            {group.items.map((item) => (
              <Link key={item.href} href={item.href} className="nav-link" aria-current={active(item.href) ? 'page' : undefined}>
                {item.label}
                {!item.ready && <span className="soon">準備中</span>}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-user">
        <div>
          <strong>{label.replace(/（.*）$/, '')}</strong>
          <span>{loginId} ・ 管理者</span>
        </div>
        <button
          type="button"
          className="btn btn-small"
          onClick={async () => {
            await createClient().auth.signOut()
            window.location.href = '/login'
          }}
        >
          ログアウト
        </button>
      </div>
    </aside>
  )
}
