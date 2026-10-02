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
      { href: '/soon/news', label: 'おしらせ' }, { href: '/soon/staff', label: '出勤簿（社員）' }, { href: '/soon/yard', label: 'ヤード配置' },
      { href: '/soon/lol', label: 'LoL・LoL MAP' }, { href: '/soon/aa', label: 'オークション情報' }, { href: '/soon/cars', label: '高額車' },
      { href: '/soon/emergency', label: '緊急連絡先' }, { href: '/soon/notes', label: '初心者ノート' }, { href: '/soon/terms', label: 'ドライバー語録' },
      { href: '/soon/qa', label: 'Q&A' }, { href: '/soon/goal', label: '今月の目標' },
    ],
  },
  {
    title: 'マイページの申請・記録',
    items: [
      { href: '/inspections', label: '点検簿', ready: true }, { href: '/packing', label: '荷姿履歴', ready: true }, { href: '/soon/self-review', label: '自己評価シート' }, { href: '/award', label: '社長賞', ready: true },
      { href: '/soon/leave', label: '休暇申請' }, { href: '/soon/repair', label: '修理申請' },
    ],
  },
  { title: '設定', items: [{ href: '/soon/messages', label: '確認メッセージ' }, { href: '/soon/notifications', label: '通知のルール' }] },
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
