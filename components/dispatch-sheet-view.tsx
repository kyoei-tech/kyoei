'use client'

import { useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ExternalLink,
  FileText,
  Loader2,
  Upload,
} from 'lucide-react'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import {
  dispatchSheetFileUrl,
  fetchOwnDispatchSheets,
  formatDispatchDate,
  saveDispatchSheet,
  uploadAndExtractDispatchSheet,
  type DispatchSheetRow,
} from '@/lib/dispatch-sheet'
import type { DispatchVehicle } from '@/lib/dispatch-sheet-schema'

function formatUploadedAt(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Groups vehicles by 回戦, preserving each group's first-seen order. */
function groupByRound(vehicles: DispatchVehicle[]): {
  round: number
  depot: string | null
  vehicles: DispatchVehicle[]
}[] {
  const groups = new Map<number, DispatchVehicle[]>()
  for (const v of vehicles) {
    const list = groups.get(v.round) ?? []
    list.push(v)
    groups.set(v.round, list)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round, list]) => ({
      round,
      depot: list.find((v) => v.roundDepot)?.roundDepot ?? null,
      vehicles: list.sort((a, b) => a.order - b.order),
    }))
}

function VehicleCard({ vehicle }: { vehicle: DispatchVehicle }) {
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
          {vehicle.order}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-base font-bold leading-snug text-foreground">
            {vehicle.carModel}
          </span>
          {vehicle.vin && (
            <span className="font-mono text-xs text-muted-foreground">
              {vehicle.vin}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-xl bg-background px-3 py-2.5 text-sm">
        <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
          {vehicle.pickupLocation}
        </span>
        <ArrowRight
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-right font-semibold text-foreground">
          {vehicle.dropoffLocation}
        </span>
      </div>

      <dl className="flex flex-col gap-1.5 text-xs">
        {vehicle.billingDestination && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">請求先</dt>
            <dd className="font-semibold text-foreground">
              {vehicle.billingDestination}
            </dd>
          </div>
        )}
        {(vehicle.loadDate || vehicle.unloadCondition) && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">日程</dt>
            <dd className="font-semibold text-foreground">
              {[vehicle.loadDate && `${vehicle.loadDate}積`, vehicle.unloadCondition]
                .filter(Boolean)
                .join(' → ')}
            </dd>
          </div>
        )}
        {vehicle.venue && (
          <div className="flex items-center justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">会場</dt>
            <dd className="truncate font-semibold text-foreground">
              {vehicle.venue}
            </dd>
          </div>
        )}
        {vehicle.auctionNumber && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">オークションNo</dt>
            <dd className="font-semibold text-foreground">
              {vehicle.auctionNumber}
            </dd>
          </div>
        )}
      </dl>

      {vehicle.notes && (
        <p className="flex items-start gap-1.5 rounded-lg bg-accent/60 px-3 py-2 text-xs text-muted-foreground">
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          <span>{vehicle.notes}</span>
        </p>
      )}
    </li>
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
  const rounds = useMemo(() => groupByRound(data.vehicles ?? []), [data])

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

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-foreground">
            {formatDispatchDate(sheet.dispatch_date) ?? data.dispatchDate ?? '配車日不明'}
          </h2>
          <a
            href={dispatchSheetFileUrl(sheet.blob_url)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs font-medium text-primary"
          >
            元のPDF
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          {data.driverName && (
            <div>
              <dt className="text-muted-foreground">乗務員</dt>
              <dd className="font-semibold text-foreground">{data.driverName}</dd>
            </div>
          )}
          {data.vehicleNumber && (
            <div>
              <dt className="text-muted-foreground">号車</dt>
              <dd className="font-semibold text-foreground">{data.vehicleNumber}</dd>
            </div>
          )}
          {data.dispatchNumber && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">配車番号</dt>
              <dd className="font-semibold text-foreground">{data.dispatchNumber}</dd>
            </div>
          )}
        </dl>
      </div>

      {rounds.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          車両データを読み取れませんでした。
        </p>
      ) : (
        rounds.map(({ round, depot, vehicles }) => (
          <div key={round} className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2 px-1">
              <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary">
                第{round}回戦
              </span>
              <span className="text-xs text-muted-foreground">
                {vehicles.length}台{depot ? `・${depot} 搬送` : ''}
              </span>
            </div>
            <ul className="flex flex-col gap-2.5">
              {vehicles.map((v) => (
                <VehicleCard key={`${round}-${v.order}`} vehicle={v} />
              ))}
            </ul>
          </div>
        ))
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

  const selectedSheet = sheets.find((s) => s.id === selectedId) ?? null

  async function handleFileSelected(file: File) {
    setStatus({ state: 'processing' })
    try {
      const { pathname, data } = await uploadAndExtractDispatchSheet(file)
      await saveDispatchSheet({
        staffId,
        filename: file.name,
        pathname,
        data,
      })
      setStatus({ state: 'idle' })
      await refetchSheets()
    } catch (error) {
      console.error('[v0] dispatch sheet processing failed:', error)
      setStatus({
        state: 'error',
        message: 'PDFの読み取りに失敗しました。もう一度お試しください。',
      })
    }
  }

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
      <div>
        <h2 className="text-xl font-bold text-foreground">配車表</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {staffName}さんの配車表です。PDFをアップロードすると、AIが内容を読み取ってスマホで見やすい形に整理します。
        </p>
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
            AIが読み取り中…
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
          sheets.map((sheet) => (
            <button
              key={sheet.id}
              type="button"
              onClick={() => setSelectedId(sheet.id)}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent active:scale-[0.99]"
            >
              <FileText
                className="h-5 w-5 shrink-0 text-primary"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {formatDispatchDate(sheet.dispatch_date) ??
                    sheet.original_filename}
                </p>
                <p className="text-xs text-muted-foreground">
                  {sheet.extracted_data.vehicles?.length ?? 0}台・アップロード{' '}
                  {formatUploadedAt(sheet.uploaded_at)}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
