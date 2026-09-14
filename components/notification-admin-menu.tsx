'use client'

import { Bell, ChevronRight, ShieldAlert } from 'lucide-react'
import { BackHeader } from './back-header'

/**
 * The secret menu revealed by 5-tapping the bell icon in Settings (see
 * settings-view.tsx). Lists both editable-content screens so future
 * additions have an obvious place to go:
 *   - プッシュ通知の管理 -> push-notification-editor-view.tsx
 *   - アラートの管理     -> alert-message-editor-view.tsx (誤タップ防止 dialogs)
 */
export function NotificationAdminMenu({
  onBack,
  onOpenPushEditor,
  onOpenAlertEditor,
}: {
  onBack: () => void
  onOpenPushEditor: () => void
  onOpenAlertEditor: () => void
}) {
  const ITEMS = [
    {
      Icon: Bell,
      label: 'プッシュ通知の管理',
      description:
        '運行状況の各タイマーで送信する通知の時間・タイトル・本文を編集します。',
      onClick: onOpenPushEditor,
    },
    {
      Icon: ShieldAlert,
      label: 'アラートの管理',
      description:
        '誤タップ防止の確認画面に表示される文言を編集します。',
      onClick: onOpenAlertEditor,
    },
  ]

  return (
    <div className="flex flex-col gap-4 pb-6">
      <BackHeader onBack={onBack} label="設定へ戻る" variant="subtle" />

      <div>
        <h2 className="text-xl font-bold text-foreground">通知の管理</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          編集した内容は全ての端末にリアルタイムで反映されます。
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        {ITEMS.map(({ Icon, label, description, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-left transition-colors hover:border-primary/60 active:scale-[0.99]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-bold text-foreground">
                {label}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                {description}
              </span>
            </span>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
    </div>
  )
}
