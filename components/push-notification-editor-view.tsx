'use client'

import { useState } from 'react'
import { ArrowLeft, Play, Plus, Trash2, X } from 'lucide-react'
import type { NotificationTimerType } from '@/lib/notifications/driving-notifications'
import {
  createPushNotificationRule,
  deletePushNotificationRule,
  updatePushNotificationRule,
  usePushNotificationRules,
} from '@/lib/notifications/push-rules'
import { NOTIFICATION_MARKUP_HELP } from '@/lib/notifications/notification-style'
import { deliverNotification } from '@/lib/notifications/push-notifications'
import { StyledNotificationText } from './notification-toast'

const BREAK_FIXED_MS = 30 * 60 * 1000

const TIMER_SECTIONS: {
  id: NotificationTimerType
  label: string
  description: string
  hasThreshold: boolean
}[] = [
  {
    id: 'continuous',
    label: '連続走行時間',
    description: '連続走行時間がこの時間を超えたら送信します。',
    hasThreshold: true,
  },
  {
    id: 'break',
    label: '累計休息時間',
    description:
      '累計休息時間が30分に達し自動リセットされた時に送信します（時間は変更できません）。',
    hasThreshold: false,
  },
  {
    id: 'driving',
    label: '運行時間',
    description: '運行時間がこの時間を超えたら送信します。',
    hasThreshold: true,
  },
]

function msToHm(ms: number): { hours: number; minutes: number } {
  const totalMinutes = Math.round(ms / 60000)
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 }
}

function hmToMs(hours: number, minutes: number): number {
  return (hours * 60 + minutes) * 60 * 1000
}

function formatThreshold(ms: number): string {
  const { hours, minutes } = msToHm(ms)
  if (hours === 0) return `${minutes}分`
  if (minutes === 0) return `${hours}時間`
  return `${hours}時間${minutes}分`
}

type RuleForm = {
  hours: number
  minutes: number
  title: string
  message: string
}

const EMPTY_FORM: RuleForm = { hours: 0, minutes: 0, title: '', message: '' }

export function PushNotificationEditorView({
  onBack,
}: {
  onBack: () => void
}) {
  const { data: rules, isLoading, mutate } = usePushNotificationRules()
  const [addingType, setAddingType] = useState<NotificationTimerType | null>(
    null,
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  function startAdd(type: NotificationTimerType) {
    setEditingId(null)
    setSaveError(null)
    setForm(type === 'break' ? { ...EMPTY_FORM, minutes: 30 } : EMPTY_FORM)
    setAddingType(type)
  }

  function startEdit(rule: {
    id: string
    thresholdMs: number
    title: string
    message: string
  }) {
    setAddingType(null)
    setSaveError(null)
    const { hours, minutes } = msToHm(rule.thresholdMs)
    setForm({ hours, minutes, title: rule.title, message: rule.message })
    setEditingId(rule.id)
  }

  function cancelForm() {
    setAddingType(null)
    setEditingId(null)
    setSaveError(null)
  }

  async function submitAdd(type: NotificationTimerType) {
    if (!form.title.trim() || !form.message.trim()) {
      setSaveError('タイトルと本文を入力してください。')
      return
    }
    const thresholdMs =
      type === 'break' ? BREAK_FIXED_MS : hmToMs(form.hours, form.minutes)
    if (type !== 'break' && thresholdMs <= 0) {
      setSaveError('時間を1分以上に設定してください。')
      return
    }
    const { error } = await createPushNotificationRule({
      timerType: type,
      thresholdMs,
      title: form.title.trim(),
      message: form.message.trim(),
    })
    if (error) {
      setSaveError(error)
      return
    }
    await mutate()
    cancelForm()
  }

  async function submitEdit(id: string, type: NotificationTimerType) {
    if (!form.title.trim() || !form.message.trim()) {
      setSaveError('タイトルと本文を入力してください。')
      return
    }
    const thresholdMs =
      type === 'break' ? BREAK_FIXED_MS : hmToMs(form.hours, form.minutes)
    if (type !== 'break' && thresholdMs <= 0) {
      setSaveError('時間を1分以上に設定してください。')
      return
    }
    const { error } = await updatePushNotificationRule(id, {
      thresholdMs,
      title: form.title.trim(),
      message: form.message.trim(),
    })
    if (error) {
      setSaveError(error)
      return
    }
    await mutate()
    cancelForm()
  }

  async function confirmDelete(id: string) {
    await deletePushNotificationRule(id)
    setPendingDeleteId(null)
    await mutate()
  }

  function renderForm(type: NotificationTimerType, onSubmit: () => void) {
    const section = TIMER_SECTIONS.find((s) => s.id === type)!
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-primary/50 bg-background px-3 py-3">
        {section.hasThreshold && (
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[0.65rem] font-semibold text-muted-foreground">
                時間
              </span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={form.hours}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    hours: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[0.65rem] font-semibold text-muted-foreground">
                分
              </span>
              <input
                type="number"
                min={0}
                max={59}
                inputMode="numeric"
                value={form.minutes}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    minutes: Math.min(
                      59,
                      Math.max(0, Number(e.target.value) || 0),
                    ),
                  }))
                }
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
              />
            </label>
          </div>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-[0.65rem] font-semibold text-muted-foreground">
            タイトル
          </span>
          <input
            type="text"
            value={form.title}
            onChange={(e) =>
              setForm((f) => ({ ...f, title: e.target.value }))
            }
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[0.65rem] font-semibold text-muted-foreground">
            本文
          </span>
          <textarea
            value={form.message}
            onChange={(e) =>
              setForm((f) => ({ ...f, message: e.target.value }))
            }
            rows={3}
            className="resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm leading-relaxed text-foreground outline-none focus:border-primary/60"
          />
        </label>
        <p className="text-[0.65rem] leading-relaxed text-muted-foreground">
          {NOTIFICATION_MARKUP_HELP}
        </p>
        {(form.title || form.message) && (
          <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
            <p className="text-[0.65rem] font-semibold text-muted-foreground">
              プレビュー
            </p>
            <StyledNotificationText
              text={form.title}
              className="mt-1 block text-sm font-bold text-foreground"
            />
            <StyledNotificationText
              text={form.message}
              className="mt-0.5 block whitespace-pre-line text-sm leading-relaxed text-foreground"
            />
          </div>
        )}
        {saveError && (
          <p className="text-xs font-semibold text-destructive">
            {saveError}
          </p>
        )}
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={cancelForm}
            className="flex-1 rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-95"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="flex-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
          >
            保存
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-95"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        設定へ戻る
      </button>

      <div>
        <h2 className="text-xl font-bold text-foreground">
          プッシュ通知の管理
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          運行状況の各タイマーで送信する通知の時間・タイトル・本文を編集できます。ここでの変更は全員のプッシュ通知に反映されます。
        </p>
      </div>

      {isLoading && rules.length === 0 && (
        <p className="text-sm text-muted-foreground">読み込み中です…</p>
      )}

      {TIMER_SECTIONS.map((section) => {
        const sectionRules = rules
          .filter((r) => r.timerType === section.id)
          .sort((a, b) => a.thresholdMs - b.thresholdMs)
        return (
          <section
            key={section.id}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-5"
          >
            <div>
              <h3 className="text-base font-bold text-foreground">
                {section.label}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {section.description}
              </p>
            </div>

            <ul className="flex flex-col gap-2">
              {sectionRules.length === 0 && addingType !== section.id && (
                <li className="rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm text-muted-foreground">
                  通知はまだありません。
                </li>
              )}
              {sectionRules.map((rule) => {
                if (editingId === rule.id) {
                  return (
                    <li key={rule.id}>
                      {renderForm(section.id, () =>
                        submitEdit(rule.id, section.id),
                      )}
                    </li>
                  )
                }
                return (
                  <li
                    key={rule.id}
                    className="rounded-xl border border-border/60 bg-background px-3 py-2.5"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="flex-1">
                        {section.hasThreshold && (
                          <span className="text-[0.65rem] font-semibold text-primary">
                            {formatThreshold(rule.thresholdMs)}
                          </span>
                        )}
                        <StyledNotificationText
                          text={rule.title}
                          className="block text-sm font-bold text-foreground"
                        />
                        <StyledNotificationText
                          text={rule.message}
                          className="mt-0.5 block whitespace-pre-line text-xs leading-relaxed text-muted-foreground"
                        />
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            deliverNotification(rule.title, rule.message)
                          }
                          aria-label="テスト通知を送信"
                          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-90"
                        >
                          <Play className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(rule)}
                          aria-label="編集する"
                          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-90"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            className="h-4 w-4"
                            aria-hidden="true"
                          >
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(rule.id)}
                          aria-label="削除する"
                          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive active:scale-90"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
              {addingType === section.id && (
                <li>{renderForm(section.id, () => submitAdd(section.id))}</li>
              )}
            </ul>

            {addingType !== section.id && (
              <button
                type="button"
                onClick={() => startAdd(section.id)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                通知を追加
              </button>
            )}
          </section>
        )
      })}

      {pendingDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-xs rounded-3xl border border-border bg-card p-6">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-foreground">
                この通知を削除しますか？
              </p>
              <button
                type="button"
                onClick={() => setPendingDeleteId(null)}
                aria-label="閉じる"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent active:scale-90"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              削除すると元に戻せません。
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteId(null)}
                className="flex-1 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-95"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => confirmDelete(pendingDeleteId)}
                className="flex-1 rounded-full bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 active:scale-95"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
