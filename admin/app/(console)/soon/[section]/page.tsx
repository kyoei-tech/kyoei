import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'

const LABELS: Record<string, string> = {
  news: 'おしらせ', staff: '出勤簿（社員）', yard: 'ヤード配置', lol: 'LoL・LoL MAP', aa: 'オークション情報', cars: '高額車',
  emergency: '緊急連絡先', notes: '初心者ノート', terms: 'ドライバー語録', qa: 'Q&A', goal: '今月の目標',
  inspection: '点検簿', 'self-review': '自己評価シート', award: '社長賞', leave: '休暇申請', repair: '修理申請',
  messages: '確認メッセージ', notifications: '通知のルール',
}

export default async function SoonPage({ params }: { params: Promise<{ section: string }> }) {
  await requireAdmin()
  const { section } = await params
  const label = LABELS[section] ?? 'この項目'
  return (
    <>
      <div className="page-header"><div><h1>{label}</h1><p>この項目の編集画面は準備中です。</p></div></div>
      <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>
        準備中です。それまでは、アプリの隠し管理メニューから編集できるものは、そちらをお使いください。<br />
        <Link href="/" style={{ display: 'inline-block', marginTop: 16 }}>ホームへ戻る</Link>
      </div>
    </>
  )
}
