'use client'

// Accident-report notes. Unlike every other data-bearing screen in this app,
// this one is intentionally device-local only (localStorage) — it can hold
// another party's name, address, a license-plate photo, and insurance
// details, none of which should sync to every driver's device the way the
// shared Supabase tables do.

import { useEffect, useRef, useState } from 'react'
import {
  Camera,
  CheckCircle2,
  ImageDown,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
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
  id: string
  name: string
  address: string
  licensePhoto: string | null
  licensePhotoBack: string | null
  phone: string
  insuranceCompany: string
  policyNumber: string
  plateNumber: string
  vehicleType: string
  isCompanyCar: '' | 'company' | 'private'
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `party-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function emptyForm(id: string = createId()): ReportForm {
  return {
    id,
    name: '',
    address: '',
    licensePhoto: null,
    licensePhotoBack: null,
    phone: '',
    insuranceCompany: '',
    policyNumber: '',
    plateNumber: '',
    vehicleType: '',
    isCompanyCar: '',
  }
}

type ReportData = {
  parties: ReportForm[]
  reportCompleted: boolean
  reportCompletedAt: string | null
}

function emptyReportData(): ReportData {
  return { parties: [emptyForm()], reportCompleted: false, reportCompletedAt: null }
}

function loadReport(): { data: ReportData; saved: boolean } {
  if (typeof window === 'undefined') return { data: emptyReportData(), saved: false }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { data: emptyReportData(), saved: false }
    const parsed = JSON.parse(raw) as Partial<ReportData> & Partial<ReportForm>
    // Migrate the legacy single-party shape (no `parties` array) into the
    // current multi-party shape.
    if (!Array.isArray(parsed.parties)) {
      return {
        data: {
          parties: [{ ...emptyForm(), ...parsed, id: createId() }],
          reportCompleted: false,
          reportCompletedAt: null,
        },
        saved: true,
      }
    }
    const parties = parsed.parties.length
      ? parsed.parties.map((p) => ({ ...emptyForm(), ...p, id: p.id ?? createId() }))
      : [emptyForm()]
    return {
      data: {
        parties,
        reportCompleted: Boolean(parsed.reportCompleted),
        reportCompletedAt: parsed.reportCompletedAt ?? null,
      },
      saved: true,
    }
  } catch {
    return { data: emptyReportData(), saved: false }
  }
}

function isFormEmpty(form: ReportForm): boolean {
  return (
    !form.name.trim() &&
    !form.address.trim() &&
    !form.licensePhoto &&
    !form.licensePhotoBack &&
    !form.phone.trim() &&
    !form.insuranceCompany.trim() &&
    !form.policyNumber.trim() &&
    !form.plateNumber.trim() &&
    !form.vehicleType.trim() &&
    !form.isCompanyCar
  )
}

// A real camera photo can be several MB, and this record is persisted as
// JSON in localStorage (quota is ~5MB per origin) alongside every other
// party's photos. Storing raw files would blow that quota, so every
// captured photo is downscaled and re-encoded as JPEG before it's ever
// turned into a data URL.
const MAX_PHOTO_DIMENSION = 1600
const PHOTO_QUALITY = 0.8

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('failed to read file'))
    reader.readAsDataURL(file)
  })
}

function readFileAsCompressedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    readFileAsDataUrl(file).then((rawDataUrl) => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(
          1,
          MAX_PHOTO_DIMENSION / Math.max(img.width, img.height),
        )
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('canvas unsupported'))
          return
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        try {
          resolve(canvas.toDataURL('image/jpeg', PHOTO_QUALITY))
        } catch {
          // toDataURL can throw on a tainted canvas; fall back to the
          // original (uncompressed) photo rather than losing it entirely.
          resolve(rawDataUrl)
        }
      }
      // Some browsers fail to decode a data URL through the Image element
      // (e.g. very large HEIC-derived JPEGs). Fall back to the original,
      // uncompressed photo instead of blocking the report.
      img.onerror = () => resolve(rawDataUrl)
      img.src = rawDataUrl
    }, reject)
  })
}

function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, base64] = dataUrl.split(',')
  const mime = /data:(.*);base64/.exec(header)?.[1] ?? 'image/jpeg'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], filename, { type: mime })
}

const CARD_WIDTH = 960
const CARD_PADDING_X = 48

/** Renders one party's typed-in details (name/address/etc.) as a JPEG,
 * since — unlike the license photos — that data only exists as text. */
function createInfoImageFile(form: ReportForm, index: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const maybeMeasureCtx = document.createElement('canvas').getContext('2d')
    if (!maybeMeasureCtx) {
      reject(new Error('canvas unsupported'))
      return
    }
    const measureCtx = maybeMeasureCtx
    const maxTextWidth = CARD_WIDTH - CARD_PADDING_X * 2
    const valueFont = '26px sans-serif'

    function wrapLines(text: string): string[] {
      measureCtx.font = valueFont
      const lines: string[] = []
      let current = ''
      for (const ch of text) {
        const candidate = current + ch
        if (current && measureCtx.measureText(candidate).width > maxTextWidth) {
          lines.push(current)
          current = ch
        } else {
          current = candidate
        }
      }
      lines.push(current)
      return lines
    }

    const rows: [string, string][] = [
      ['氏名', form.name.trim() || '（未入力）'],
      ['住所', form.address.trim() || '（未入力）'],
      ['電話番号', form.phone.trim() || '（未入力）'],
      ['保険会社名', form.insuranceCompany.trim() || '（未入力）'],
      ['証券番号または契約番号', form.policyNumber.trim() || '（未入力）'],
      ['車種', form.vehicleType.trim() || '（未入力）'],
      ['車のナンバー', form.plateNumber.trim() || '（未入力）'],
      [
        '社用車か否か',
        form.isCompanyCar === 'company'
          ? '社用車'
          : form.isCompanyCar === 'private'
            ? '自家用車'
            : '（未選択）',
      ],
    ]
    const lineHeight = 34
    const blockGap = 18
    const headerHeight = 96
    const blocks = rows.map(([label, value]) => ({ label, lines: wrapLines(value) }))
    const contentHeight =
      headerHeight +
      blocks.reduce((sum, b) => sum + lineHeight + b.lines.length * lineHeight + blockGap, 0) +
      48

    const canvas = document.createElement('canvas')
    canvas.width = CARD_WIDTH
    canvas.height = Math.max(420, Math.round(contentHeight))
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('canvas unsupported'))
      return
    }

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#111111'
    ctx.font = 'bold 32px sans-serif'
    ctx.fillText(`事故相手情報（相手${index + 1}）`, CARD_PADDING_X, 56)
    ctx.strokeStyle = '#dddddd'
    ctx.beginPath()
    ctx.moveTo(CARD_PADDING_X, 76)
    ctx.lineTo(canvas.width - CARD_PADDING_X, 76)
    ctx.stroke()

    let y = headerHeight
    for (const block of blocks) {
      ctx.font = 'bold 22px sans-serif'
      ctx.fillStyle = '#666666'
      ctx.fillText(block.label, CARD_PADDING_X, y)
      y += lineHeight
      ctx.font = valueFont
      ctx.fillStyle = '#111111'
      for (const line of block.lines) {
        ctx.fillText(line, CARD_PADDING_X, y)
        y += lineHeight
      }
      y += blockGap
    }

    ctx.font = '16px sans-serif'
    ctx.fillStyle = '#999999'
    ctx.fillText(
      `作成日時: ${new Date().toLocaleString('ja-JP')}`,
      CARD_PADDING_X,
      canvas.height - 20,
    )

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('toBlob failed'))
          return
        }
        resolve(new File([blob], `相手${index + 1}_情報.jpg`, { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.92,
    )
  })
}

/** Fallback when the Web Share API (or its files support) isn't available:
 * trigger a normal browser download for every image, staggered slightly so
 * the browser doesn't drop any of them. */
function downloadFiles(files: File[]) {
  files.forEach((file, i) => {
    window.setTimeout(() => {
      const url = URL.createObjectURL(file)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 2000)
    }, i * 350)
  })
}

export function AccidentReportView({ onBack }: { onBack: () => void }) {
  const [hydrated, setHydrated] = useState(false)
  const [parties, setParties] = useState<ReportForm[]>(() => [emptyForm()])
  const [reportCompleted, setReportCompleted] = useState(false)
  const [reportCompletedAt, setReportCompletedAt] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [editingForm, setEditingForm] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [imageSaveBusy, setImageSaveBusy] = useState(false)
  const [imageSaveError, setImageSaveError] = useState<string | null>(null)
  const [zoomPhoto, setZoomPhoto] = useState<{
    src: string
    alt: string
  } | null>(null)

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
    const { data, saved: wasSaved } = loadReport()
    setParties(data.parties)
    setReportCompleted(data.reportCompleted)
    setReportCompletedAt(data.reportCompletedAt)
    setSaved(wasSaved)
    setEditingForm(!wasSaved)
    setHydrated(true)
  }, [])

  function persist(next: ReportData) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  function saveForm() {
    setSaveError(null)
    try {
      persist({ parties, reportCompleted, reportCompletedAt })
    } catch {
      setSaveError(
        '保存に失敗しました。写真のサイズが大きすぎる可能性があります。撮り直してもう一度お試しください。',
      )
      return
    }
    setSaved(true)
    setEditingForm(false)
  }

  function resetForm() {
    window.localStorage.removeItem(STORAGE_KEY)
    setParties([emptyForm()])
    setReportCompleted(false)
    setReportCompletedAt(null)
    setSaved(false)
    setEditingForm(true)
    setConfirmReset(false)
  }

  function completeReport() {
    const at = new Date().toISOString()
    try {
      persist({ parties, reportCompleted: true, reportCompletedAt: at })
      setSaved(true)
      setEditingForm(false)
    } catch {
      setSaveError(
        '保存に失敗しました。写真のサイズが大きすぎる可能性があります。撮り直してもう一度お試しください。',
      )
      setConfirmComplete(false)
      return
    }
    setReportCompleted(true)
    setReportCompletedAt(at)
    setConfirmComplete(false)
  }

  function addParty() {
    setParties((prev) => [...prev, emptyForm()])
  }

  function removeParty(id: string) {
    setParties((prev) => (prev.length <= 1 ? prev : prev.filter((p) => p.id !== id)))
  }

  function updateParty(id: string, patch: Partial<ReportForm>) {
    setParties((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
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

  async function handlePhotoChange(
    e: React.ChangeEvent<HTMLInputElement>,
    partyId: string,
    side: 'licensePhoto' | 'licensePhotoBack',
  ) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoError(null)
    try {
      const dataUrl = await readFileAsCompressedDataUrl(file)
      updateParty(partyId, { [side]: dataUrl })
    } catch {
      setPhotoError('写真の読み込みに失敗しました。もう一度撮影してください。')
    }
  }

  async function saveAsImages() {
    setImageSaveError(null)
    setImageSaveBusy(true)
    try {
      const files: File[] = []
      for (let i = 0; i < parties.length; i++) {
        const party = parties[i]
        if (isFormEmpty(party)) continue
        files.push(await createInfoImageFile(party, i))
        if (party.licensePhoto) {
          files.push(dataUrlToFile(party.licensePhoto, `相手${i + 1}_免許証表.jpg`))
        }
        if (party.licensePhotoBack) {
          files.push(dataUrlToFile(party.licensePhotoBack, `相手${i + 1}_免許証裏.jpg`))
        }
      }
      if (files.length === 0) {
        setImageSaveError('保存する内容がありません。')
        return
      }
      const nav = navigator as Navigator & {
        canShare?: (data: { files: File[] }) => boolean
        share?: (data: { files: File[]; title?: string; text?: string }) => Promise<void>
      }
      if (nav.share && nav.canShare?.({ files })) {
        await nav.share({ files, title: '事故報告', text: '事故報告の記録' })
      } else {
        downloadFiles(files)
      }
    } catch (err) {
      // AbortError just means the driver cancelled the share sheet.
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setImageSaveError('画像の保存に失敗しました。もう一度お試しください。')
      }
    } finally {
      setImageSaveBusy(false)
    }
  }

  if (!hydrated) return null

  const readOnly = saved && !editingForm
  const reportIsEmpty = parties.every(isFormEmpty)

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

      {reportCompleted && reportCompletedAt && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-bold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          報告完了済み（
          {new Date(reportCompletedAt).toLocaleString('ja-JP', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
          ）
        </div>
      )}

      {parties.map((party, index) => (
        <section
          key={party.id}
          className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">
              相手{parties.length > 1 ? index + 1 : ''}
            </h3>
            {!readOnly && parties.length > 1 && (
              <button
                type="button"
                onClick={() => removeParty(party.id)}
                aria-label={`相手${index + 1}の情報を削除`}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-destructive/80 transition-colors hover:text-destructive active:scale-95"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                削除
              </button>
            )}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              氏名
            </span>
            <input
              type="text"
              value={party.name}
              disabled={readOnly}
              onChange={(e) => updateParty(party.id, { name: e.target.value })}
              placeholder="相手の氏名"
              className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 disabled:opacity-70"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              住所
            </span>
            <textarea
              value={party.address}
              disabled={readOnly}
              onChange={(e) => updateParty(party.id, { address: e.target.value })}
              rows={2}
              placeholder="相手の住所"
              className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 disabled:opacity-70"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              免許証
            </span>
            <p className="text-xs text-muted-foreground">
              撮影の許可を貰い、免許証を撮影でも可。免許証は
              <span className="font-bold">「表面」と「裏面」の2枚</span>
              を撮影すること
            </p>
            {photoError && (
              <p className="text-xs font-semibold text-destructive">
                {photoError}
              </p>
            )}
            <div className="mt-1 flex flex-col gap-3 sm:flex-row">
              <div className="flex flex-1 flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  表面
                </span>
                {!readOnly && (
                  <label className="flex w-fit items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent active:scale-95">
                    <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                    表面を撮影する
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => handlePhotoChange(e, party.id, 'licensePhoto')}
                      className="hidden"
                    />
                  </label>
                )}
                {party.licensePhoto && (
                  <button
                    type="button"
                    onClick={() =>
                      setZoomPhoto({
                        src: party.licensePhoto as string,
                        alt: '免許証の表面の撮影画像',
                      })
                    }
                    className="block w-full active:scale-[0.98]"
                    aria-label="免許証の表面の写真を拡大表示"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- a
                    locally captured data URL, never a remote src, so
                    next/image adds no value. */}
                    <img
                      src={party.licensePhoto}
                      alt="免許証の表面の撮影画像"
                      className="max-h-48 w-full rounded-xl border border-border object-contain"
                    />
                  </button>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  裏面
                </span>
                {!readOnly && (
                  <label className="flex w-fit items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent active:scale-95">
                    <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                    裏面を撮影する
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) =>
                        handlePhotoChange(e, party.id, 'licensePhotoBack')
                      }
                      className="hidden"
                    />
                  </label>
                )}
                {party.licensePhotoBack && (
                  <button
                    type="button"
                    onClick={() =>
                      setZoomPhoto({
                        src: party.licensePhotoBack as string,
                        alt: '免許証の裏面の撮影画像',
                      })
                    }
                    className="block w-full active:scale-[0.98]"
                    aria-label="免許証の裏面の写真を拡大表示"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- a
                    locally captured data URL, never a remote src, so
                    next/image adds no value. */}
                    <img
                      src={party.licensePhotoBack}
                      alt="免許証の裏面の撮影画像"
                      className="max-h-48 w-full rounded-xl border border-border object-contain"
                    />
                  </button>
                )}
              </div>
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              電話番号
            </span>
            <div className="flex items-center gap-2">
              <input
                type="tel"
                value={party.phone}
                disabled={readOnly}
                onChange={(e) => updateParty(party.id, { phone: e.target.value })}
                placeholder="例：090-0000-0000"
                className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 disabled:opacity-70"
              />
              <CallButton phone={party.phone} />
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
              value={party.insuranceCompany}
              disabled={readOnly}
              onChange={(e) =>
                updateParty(party.id, { insuranceCompany: e.target.value })
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
              value={party.policyNumber}
              disabled={readOnly}
              onChange={(e) =>
                updateParty(party.id, { policyNumber: e.target.value })
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
              車種
            </span>
            <input
              type="text"
              value={party.vehicleType}
              disabled={readOnly}
              onChange={(e) =>
                updateParty(party.id, { vehicleType: e.target.value })
              }
              placeholder="例：トヨタ プリウス"
              className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 disabled:opacity-70"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              車のナンバー
            </span>
            <input
              type="text"
              value={party.plateNumber}
              disabled={readOnly}
              onChange={(e) =>
                updateParty(party.id, { plateNumber: e.target.value })
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
              value={party.isCompanyCar}
              disabled={readOnly}
              onChange={(e) =>
                updateParty(party.id, {
                  isCompanyCar: e.target.value as ReportForm['isCompanyCar'],
                })
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
        </section>
      ))}

      {!readOnly && (
        <button
          type="button"
          onClick={addParty}
          className="flex items-center justify-center gap-1.5 rounded-full border border-dashed border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground active:scale-95"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          もう1人追加
        </button>
      )}

      <div className="flex flex-col gap-2">
        {readOnly ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditingForm(true)}
              className="flex items-center justify-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-95"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              編集
            </button>
            {!reportCompleted && (
              <button
                type="button"
                onClick={() => setConfirmComplete(true)}
                className="flex items-center justify-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/20 active:scale-95 dark:text-emerald-400"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                報告完了
              </button>
            )}
          </div>
        ) : (
          <>
            {saveError && (
              <p className="text-xs font-semibold text-destructive">
                {saveError}
              </p>
            )}
            <button
              type="button"
              onClick={saveForm}
              disabled={reportIsEmpty}
              className="rounded-full bg-primary px-4 py-3 text-base font-bold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
            >
              保存
            </button>
          </>
        )}

        {imageSaveError && (
          <p className="text-xs font-semibold text-destructive">
            {imageSaveError}
          </p>
        )}
        <button
          type="button"
          onClick={saveAsImages}
          disabled={reportIsEmpty || imageSaveBusy}
          className="flex items-center justify-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-95 disabled:opacity-40"
        >
          <ImageDown className="h-4 w-4" aria-hidden="true" />
          {imageSaveBusy ? '画像を作成中…' : '画像として保存'}
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

      {confirmComplete && (
        <ConfirmActionModal
          message={getConfirmActionMessage(
            confirmMessages,
            'accident-report-complete',
            '報告完了にしますか？',
          )}
          confirmLabel={getConfirmActionConfirmLabel(
            confirmMessages,
            'accident-report-complete',
            '報告完了にする',
          )}
          cancelLabel={getConfirmActionCancelLabel(
            confirmMessages,
            'accident-report-complete',
            'キャンセル',
          )}
          onConfirm={completeReport}
          onCancel={() => setConfirmComplete(false)}
        />
      )}

      {zoomPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={zoomPhoto.alt}
          onClick={() => setZoomPhoto(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
        >
          <button
            type="button"
            onClick={() => setZoomPhoto(null)}
            aria-label="拡大表示を閉じる"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 active:scale-95"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- a
          locally captured data URL, never a remote src, so next/image adds
          no value. Long-press-to-save is handled natively by the browser. */}
          <img
            src={zoomPhoto.src}
            alt={zoomPhoto.alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        </div>
      )}
    </div>
  )
}
