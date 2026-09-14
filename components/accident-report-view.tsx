'use client'

// Accident-report notes. Unlike every other data-bearing screen in this app,
// this one is intentionally device-local only (localStorage) — it can hold
// another party's name, address, a license-plate photo, and insurance
// details, none of which should sync to every driver's device the way the
// shared Supabase tables do.

import { useEffect, useRef, useState } from 'react'
import { Camera, Pencil, RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { usePasswordGate } from './password-prompt'
import { BackHeader } from './back-header'
import { CallButton } from './call-button'
import { StyledNotificationText } from './styled-notification-text'
import { ConfirmActionModal } from './confirm-action-modal'
import {
  getConfirmActionCancelLabel,
  getConfirmActionConfirmLabel,
  getConfirmActionMessage,
  useConfirmActionMessages,
} from '@/lib/notifications/confirm-messages'

const STORAGE_KEY = 'kyoei-accident-report'
const DOUBLE_TAP_MS = 350

// Shared across every browser via the `accident_report_memo` table (single row).
type MemoRow = { id: string; content: string; updated_at: string }

async function fetchAccidentReportMemo(): Promise<MemoRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('accident_report_memo')
    .select('id, content, updated_at')
    .eq('id', 'current')
  if (error) throw error
  return (data as MemoRow[]) ?? []
}

type ReportForm = {
  name: string
  address: string
  licensePhoto: string | null
  phone: string
  insuranceCompany: string
  policyNumber: string
  plateNumber: string
  isCompanyCar: '' | 'company' | 'private'
}

function emptyForm(): ReportForm {
  return {
    name: '',
    address: '',
    licensePhoto: null,
    phone: '',
    insuranceCompany: '',
    policyNumber: '',
    plateNumber: '',
    isCompanyCar: '',
  }
}

function loadForm(): { form: ReportForm; saved: boolean } {
  if (typeof window === 'undefined') return { form: emptyForm(), saved: false }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { form: emptyForm(), saved: false }
    const parsed = JSON.parse(raw) as ReportForm
    return { form: { ...emptyForm(), ...parsed }, saved: true }
  } catch {
    return { form: emptyForm(), saved: false }
  }
}

function isFormEmpty(form: ReportForm): boolean {
  return (
    !form.name.trim() &&
    !form.address.trim() &&
    !form.licensePhoto &&
    !form.phone.trim() &&
    !form.insuranceCompany.trim() &&
    !form.policyNumber.trim() &&
    !form.plateNumber.trim() &&
    !form.isCompanyCar
  )
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function AccidentReportView({ onBack }: { onBack: () => void }) {
  const [hydrated, setHydrated] = useState(false)
  const [form, setForm] = useState<ReportForm>(emptyForm)
  const [saved, setSaved] = useState(false)
  const [editingForm, setEditingForm] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const { data: memoRows, mutate: refetchMemo } = useRealtimeTable<MemoRow>(
    'accident_report_memo',
    fetchAccidentReportMemo,
  )
  const memo = memoRows[0]?.content ?? ''
  const [memoEditing, setMemoEditing] = useState(false)
  const [memoDraft, setMemoDraft] = useState('')
  const [savingMemo, setSavingMemo] = useState(false)
  const lastTapRef = useRef(0)
  const { guard, prompt } = usePasswordGate('2486')
  const { data: confirmMessages } = useConfirmActionMessages()

  useEffect(() => {
    const { form: loaded, saved: wasSaved } = loadForm()
    setForm(loaded)
    setSaved(wasSaved)
    setEditingForm(!wasSaved)
    setHydrated(true)
  }, [])

  function persist(next: ReportForm) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  function saveForm() {
    setForm((current) => {
      persist(current)
      return current
    })
    setSaved(true)
    setEditingForm(false)
  }

  function resetForm() {
    window.localStorage.removeItem(STORAGE_KEY)
    setForm(emptyForm())
    setSaved(false)
    setEditingForm(true)
    setConfirmReset(false)
  }

  function startMemoEditing() {
    setMemoDraft(memo)
    setMemoEditing(true)
  }

  function handleMemoTap() {
    if (memoEditing) return
    const now = Date.now()
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0
      guard(startMemoEditing)
    } else {
      lastTapRef.current = now
    }
  }

  async function saveMemo() {
    setSavingMemo(true)
    try {
      const supabase = createClient()
      await supabase
        .from('accident_report_memo')
        .update({ content: memoDraft, updated_at: new Date().toISOString() })
        .eq('id', 'current')
      await refetchMemo()
      setMemoEditing(false)
    } finally {
      setSavingMemo(false)
    }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const dataUrl = await readFileAsDataUrl(file)
    setForm((prev) => ({ ...prev, licensePhoto: dataUrl }))
  }

  if (!hydrated) return null

  const readOnly = saved && !editingForm

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <BackHeader onBack={onBack} label="緊急連絡先" />

      <div>
        <h2 className="text-xl font-bold text-foreground">
          事故を起こしてしまった/事故にあってしまったら
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          この記録はこの端末のみに保存されます（他の端末とは共有されません）。
        </p>
      </div>

      <div
        onClick={handleMemoTap}
        className="min-h-[3rem] rounded-2xl border border-border px-4 py-3"
      >
        {memoEditing ? (
          <div
            className="flex flex-col gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <textarea
              value={memoDraft}
              onChange={(e) => setMemoDraft(e.target.value)}
              rows={4}
              autoFocus
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMemoEditing(false)}
                className="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground active:scale-95"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={saveMemo}
                disabled={savingMemo}
                className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
              >
                {savingMemo ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        ) : memo ? (
          <StyledNotificationText
            text={memo}
            className="block whitespace-pre-wrap text-sm font-bold text-orange-500"
          />
        ) : null}
      </div>
      {prompt}

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            氏名
          </span>
          <input
            type="text"
            value={form.name}
            disabled={readOnly}
            onChange={(e) =>
              setForm((p) => ({ ...p, name: e.target.value }))
            }
            placeholder="相手の氏名"
            className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 disabled:opacity-70"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            住所
          </span>
          <textarea
            value={form.address}
            disabled={readOnly}
            onChange={(e) =>
              setForm((p) => ({ ...p, address: e.target.value }))
            }
            rows={2}
            placeholder="相手の住所"
            className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 disabled:opacity-70"
          />
          <p className="text-xs text-muted-foreground">
            撮影の許可を貰い、免許証を撮影でも可。免許証を撮影する場合は
            <span className="font-bold">「裏面」</span>
            も忘れずに
          </p>
          {!readOnly && (
            <label className="mt-1 flex w-fit items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent active:scale-95">
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
              免許証を撮影する
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoChange}
                className="hidden"
              />
            </label>
          )}
          {form.licensePhoto && (
            // eslint-disable-next-line @next/next/no-img-element -- a locally
            // captured data URL, never a remote src, so next/image adds no value.
            <img
              src={form.licensePhoto}
              alt="免許証の撮影画像"
              className="mt-1 max-h-48 w-full rounded-xl border border-border object-contain"
            />
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            電話番号
          </span>
          <div className="flex items-center gap-2">
            <input
              type="tel"
              value={form.phone}
              disabled={readOnly}
              onChange={(e) =>
                setForm((p) => ({ ...p, phone: e.target.value }))
              }
              placeholder="例：090-0000-0000"
              className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 disabled:opacity-70"
            />
            <CallButton phone={form.phone} />
          </div>
          <p className="text-xs text-muted-foreground">
            ※メモした後にその場で一度電話をかけ、相手のスマホが鳴るか確認する
          </p>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            保険会社名
          </span>
          <input
            type="text"
            value={form.insuranceCompany}
            disabled={readOnly}
            onChange={(e) =>
              setForm((p) => ({ ...p, insuranceCompany: e.target.value }))
            }
            placeholder="保険会社名"
            className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 disabled:opacity-70"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            証券番号または契約番号
          </span>
          <input
            type="text"
            value={form.policyNumber}
            disabled={readOnly}
            onChange={(e) =>
              setForm((p) => ({ ...p, policyNumber: e.target.value }))
            }
            placeholder="証券番号または契約番号"
            className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 disabled:opacity-70"
          />
          <p className="text-xs text-muted-foreground">
            すぐに分からなければ省略可
          </p>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            車のナンバー
          </span>
          <input
            type="text"
            value={form.plateNumber}
            disabled={readOnly}
            onChange={(e) =>
              setForm((p) => ({ ...p, plateNumber: e.target.value }))
            }
            placeholder="例：品川300 あ12-34"
            className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 disabled:opacity-70"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            社用車か否か
          </span>
          <select
            value={form.isCompanyCar}
            disabled={readOnly}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                isCompanyCar: e.target.value as ReportForm['isCompanyCar'],
              }))
            }
            className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/60 disabled:opacity-70"
          >
            <option value="">選択してください</option>
            <option value="company">社用車</option>
            <option value="private">自家用車</option>
          </select>
          <p className="text-xs text-muted-foreground">
            ※社用車なら名刺をもらう
          </p>
        </label>

        {readOnly ? (
          <button
            type="button"
            onClick={() => setEditingForm(true)}
            className="flex items-center justify-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-95"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            編集
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={saveForm}
              disabled={isFormEmpty(form)}
              className="rounded-full bg-primary px-4 py-3 text-base font-bold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
            >
              保存
            </button>
            {saved && (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-destructive/80 transition-colors hover:text-destructive"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                リセット
              </button>
            )}
          </div>
        )}
      </section>

      {confirmReset && (
        <ConfirmActionModal
          message={getConfirmActionMessage(
            confirmMessages,
            'accident-report-reset',
            '入力内容をリセットしますか？\nこの操作は取り消せません。',
          )}
          confirmLabel={getConfirmActionConfirmLabel(
            confirmMessages,
            'accident-report-reset',
            'リセットする',
          )}
          cancelLabel={getConfirmActionCancelLabel(
            confirmMessages,
            'accident-report-reset',
            'キャンセル',
          )}
          onConfirm={resetForm}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  )
}
