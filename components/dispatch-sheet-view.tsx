'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  FileText,
  LayoutGrid,
  List,
  Loader2,
  Pencil,
  Upload,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import {
  parseDispatchSheetPdf,
  type ParsedDispatchSheet,
} from '@/lib/dispatch-sheet-parser'
import { ConfirmDeleteInline, DeleteIconButton } from './confirm-delete'

// Each driver uploads and views only their own dispatch sheets — scoped
// by `uploaded_by_staff_id` (their linked staff_members.id, resolved by
// the caller via use-authenticated-staff.ts). RLS on this table is still
// open (app-wide "共有端末" convention), so the per-driver scoping below
// is enforced client-side, same trust model as the rest of this app.
// The original PDF is kept in the connected (private) Blob store purely
// for reference/download — all display data comes from `extracted_data`,
// produced by a rule-based text-position parser (no AI, no page images).
type DispatchSheetRow = {
  id: string
  blob_url: string
  original_filename: string
  uploaded_at: string
  dispatch_date: string | null
  extracted_data: ParsedDispatchSheet | null
}

type ViewMode = 'detail' | 'compact'

async function fetchOwnDispatchSheets(
  staffId: string,
): Promise<DispatchSheetRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('dispatch_sheets')
    .select(
      'id, blob_url, original_filename, uploaded_at, dispatch_date, extracted_data',
    )
    .eq('uploaded_by_staff_id', staffId)
    .order('uploaded_at', { ascending: false })
  if (error) throw error
  return (data as DispatchSheetRow[]) ?? []
}

// Sends the file as the raw request body (filename via header) rather
// than multipart/form-data so the request body can stay the raw PDF
// bytes, avoiding a multipart parse step for a single-file upload.
async function uploadFile(file: File, filename: string): Promise<string> {
  const res = await fetch('/api/dispatch-sheet/upload', {
    method: 'POST',
    headers: { 'x-filename': encodeURIComponent(filename) },
    body: file,
  })
  if (!res.ok) throw new Error('upload failed')
  const { pathname } = (await res.json()) as { pathname: string }
  return pathname
}

async function deleteFile(pathname: string): Promise<void> {
  const res = await fetch(
    `/api/dispatch-sheet/file?pathname=${encodeURIComponent(pathname)}`,
    { method: 'DELETE' },
  )
  if (!res.ok) throw new Error('delete failed')
}

function formatUploadedAt(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Field order and font-size hierarchy both follow the printed sheet's own
// priority: 品名 (largest) > 車体番号 > 摘要１ > 積地/降地 (equal) >
// 積日(詳細)/降日(詳細)/オークション (equal) > 請求先 (smallest).
function DetailCard({ vehicle }: { vehicle: ParsedDispatchSheet['rounds'][number]['vehicles'][number] }) {
  const dateDetail = vehicle.pickupDateDetail || vehicle.dropoffDateDetail

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      {vehicle.billTo && (
        <p className="truncate text-[11px] font-medium text-muted-foreground">
          {vehicle.billTo}
        </p>
      )}

      {vehicle.auctionInfo && (
        <p className="truncate text-xs font-medium text-muted-foreground">
          {vehicle.auctionInfo}
        </p>
      )}

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-balance text-2xl font-bold text-foreground">
          {vehicle.vehicleName || '車種名不明'}
        </h3>
        <p className="truncate font-mono text-lg font-semibold text-foreground/80">
          {vehicle.chassisNumber || '車台番号不明'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-blue-100 px-3 py-1 font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
          {vehicle.pickup || '積地不明'}
        </span>
        <span className="text-muted-foreground" aria-hidden="true">
          ➔
        </span>
        <span className="rounded-full bg-green-100 px-3 py-1 font-semibold text-green-800 dark:bg-green-950 dark:text-green-300">
          {vehicle.dropoff || '降地不明'}
        </span>
      </div>

      {dateDetail && (
        <p className="text-xs text-muted-foreground">
          {vehicle.pickupDateDetail || '—'}
          <span aria-hidden="true"> ➔ </span>
          {vehicle.dropoffDateDetail || '—'}
        </p>
      )}

      {vehicle.notes && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 dark:border-yellow-800 dark:bg-yellow-950">
          <p className="text-pretty text-base font-medium text-yellow-900 dark:text-yellow-200">
            {vehicle.notes}
          </p>
        </div>
      )}
    </div>
  )
}

function CompactRow({ vehicle }: { vehicle: ParsedDispatchSheet['rounds'][number]['vehicles'][number] }) {
  return (
    <div className="flex items-start gap-2 border-b border-border px-1 py-2.5 last:border-0">
      <span className="mt-1 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
        第{vehicle.round}
      </span>
      <div className="min-w-0 flex-1">
        {vehicle.auctionInfo && (
          <p className="truncate text-[11px] font-medium leading-tight text-muted-foreground">
            {vehicle.auctionInfo}
          </p>
        )}
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <p className="truncate text-lg font-bold leading-tight text-foreground">
            {vehicle.vehicleName || '車種名不明'}
          </p>
          <p className="truncate font-mono text-sm font-semibold leading-tight text-foreground/80">
            {vehicle.chassisNumber || '車台番号不明'}
          </p>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="truncate rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
            {vehicle.pickup || '？'}
          </span>
          <span className="text-[11px] text-muted-foreground" aria-hidden="true">
            ➔
          </span>
          <span className="truncate rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800 dark:bg-green-950 dark:text-green-300">
            {vehicle.dropoff || '？'}
          </span>
        </div>
      </div>
    </div>
  )
}

function DispatchSheetDetail({
  sheet,
  onBack,
}: {
  sheet: DispatchSheetRow
  onBack: () => void
}) {
  const data = sheet.extracted_data
  const [viewMode, setViewMode] = useState<ViewMode>('detail')
  const [activeRound, setActiveRound] = useState<string | null>(
    data?.rounds[0]?.round ?? null,
  )

  const activeVehicles = useMemo(
    () => data?.rounds.find((r) => r.round === activeRound)?.vehicles ?? [],
    [data, activeRound],
  )

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-1.5 self-start rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-95"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        一覧に戻る
      </button>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">配車日</p>
          <p className="font-semibold text-foreground">
            {data?.dispatchDate || '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">号車</p>
          <p className="font-semibold text-foreground">
            {data?.vehicleNumber || '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">乗務員名</p>
          <p className="font-semibold text-foreground">
            {data?.driverName || '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">配車番号</p>
          <p className="font-semibold text-foreground">
            {data?.dispatchNumber || '—'}
          </p>
        </div>
      </div>

      {!data || data.rounds.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          データを読み取れませんでした。
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1 rounded-full border border-border bg-muted p-1">
            <button
              type="button"
              onClick={() => setViewMode('detail')}
              className={`flex items-center justify-center gap-1.5 rounded-full py-2 text-sm font-semibold transition-colors ${
                viewMode === 'detail'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground'
              }`}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              1台詳細
            </button>
            <button
              type="button"
              onClick={() => setViewMode('compact')}
              className={`flex items-center justify-center gap-1.5 rounded-full py-2 text-sm font-semibold transition-colors ${
                viewMode === 'compact'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground'
              }`}
            >
              <List className="h-4 w-4" aria-hidden="true" />
              8台一覧
            </button>
          </div>

          <div
            className="flex gap-2 overflow-x-auto"
            role="tablist"
            aria-label="回戦"
          >
            {data.rounds.map(({ round, vehicles }) => (
              <button
                key={round}
                type="button"
                role="tab"
                aria-selected={activeRound === round}
                onClick={() => setActiveRound(round)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  activeRound === round
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                第{round}回戦（{vehicles.length}台）
              </button>
            ))}
          </div>

          {viewMode === 'detail' ? (
            <div className="flex flex-col gap-3">
              {activeVehicles.map((vehicle, index) => (
                <DetailCard key={index} vehicle={vehicle} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card px-2">
              {activeVehicles.map((vehicle, index) => (
                <CompactRow key={index} vehicle={vehicle} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function DispatchSheetView({
  staffId,
  staffName,
}: {
  staffId: string
  staffName: string
}) {
  const { data: sheets, mutate: refetchSheets } =
    useRealtimeTable<DispatchSheetRow>(
      'dispatch_sheets',
      () => fetchOwnDispatchSheets(staffId),
      { cacheKey: `own:${staffId}` },
    )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<
    | { state: 'idle' }
    | { state: 'processing' }
    | { state: 'error'; message: string }
  >({ state: 'idle' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const selectedSheet = useMemo(
    () => sheets.find((s) => s.id === selectedId) ?? null,
    [sheets, selectedId],
  )

  const handleDelete = useCallback(
    async (sheet: DispatchSheetRow) => {
      setDeletingId(sheet.id)
      try {
        const supabase = createClient()
        const { error } = await supabase
          .from('dispatch_sheets')
          .delete()
          .eq('id', sheet.id)
        if (error) throw error
        // Best-effort: the row is already gone once the DB delete above
        // succeeds, so a failure here (e.g. the blob was already
        // removed) shouldn't block removing it from the list.
        await deleteFile(sheet.blob_url).catch((error) => {
          console.error('[v0] dispatch sheet blob delete failed:', error)
        })
        setConfirmDeleteId(null)
        await refetchSheets()
      } catch (error) {
        console.error('[v0] dispatch sheet delete failed:', error)
      } finally {
        setDeletingId(null)
      }
    },
    [refetchSheets],
  )

  const handleFileSelected = useCallback(
    async (file: File) => {
      setStatus({ state: 'processing' })
      try {
        const [extractedData, pdfPathname] = await Promise.all([
          parseDispatchSheetPdf(file),
          uploadFile(file, file.name),
        ])

        const supabase = createClient()
        // `blob_url` stores a Blob pathname (not a direct URL) since the
        // connected store is private — see fileUrl() in the file route.
        const { error } = await supabase.from('dispatch_sheets').insert({
          blob_url: pdfPathname,
          original_filename: file.name,
          dispatch_date: extractedData.dispatchDate,
          extracted_data: extractedData,
          uploaded_by_staff_id: staffId,
        })
        if (error) throw error

        setStatus({ state: 'idle' })
        await refetchSheets()
      } catch (error) {
        console.error('[v0] dispatch sheet parsing failed:', error)
        setStatus({
          state: 'error',
          message: '読み取りに失敗しました。もう一度お試しください。',
        })
      }
    },
    [refetchSheets, staffId],
  )

  if (selectedSheet) {
    return (
      <DispatchSheetDetail
        sheet={selectedSheet}
        onBack={() => setSelectedId(null)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">配車表</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {staffName}さんの配車表です。PDFをアップロードすると、車両ごとのカードに自動で整理されます。
          </p>
        </div>
        {sheets.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setIsEditing((v) => !v)
              setConfirmDeleteId(null)
            }}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors active:scale-95 ${
              isEditing
                ? 'bg-primary text-primary-foreground'
                : 'border border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            {isEditing ? (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                完了
              </>
            ) : (
              <>
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                編集
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) handleFileSelected(file)
        }}
      />

      <button
        type="button"
        disabled={status.state === 'processing'}
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-4 py-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-[0.99] disabled:opacity-60"
      >
        {status.state === 'processing' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            読み取り中…
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" aria-hidden="true" />
            配車表PDFをアップロード
          </>
        )}
      </button>

      {status.state === 'error' && (
        <p className="text-sm font-semibold text-destructive">
          {status.message}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {sheets.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            まだ配車表をアップロードしていません。
          </p>
        ) : (
          sheets.map((sheet) =>
            confirmDeleteId === sheet.id ? (
              <ConfirmDeleteInline
                key={sheet.id}
                message={`「${sheet.dispatch_date || sheet.original_filename}」を削除しますか？`}
                onConfirm={() => handleDelete(sheet)}
                onCancel={() => setConfirmDeleteId(null)}
              />
            ) : (
              <div
                key={sheet.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent"
              >
                <button
                  type="button"
                  disabled={isEditing}
                  onClick={() => setSelectedId(sheet.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left active:scale-[0.99]"
                >
                  <FileText
                    className="h-5 w-5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {sheet.dispatch_date || sheet.original_filename}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {sheet.extracted_data?.vehicleCount ?? 0}台 ・{' '}
                      {formatUploadedAt(sheet.uploaded_at)}
                    </p>
                  </div>
                </button>
                {isEditing &&
                  (deletingId === sheet.id ? (
                    <Loader2
                      className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
                      aria-hidden="true"
                    />
                  ) : (
                    <DeleteIconButton
                      label={`${sheet.dispatch_date || sheet.original_filename}を削除`}
                      onClick={() => setConfirmDeleteId(sheet.id)}
                      className="shrink-0"
                    />
                  ))}
              </div>
            ),
          )
        )}
      </div>
    </div>
  )
}
