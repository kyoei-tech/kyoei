'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { ChevronLeft, FileText, Loader2, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'

// Each driver uploads and views only their own dispatch sheets — scoped
// by `uploaded_by_staff_id` (their linked staff_members.id, resolved by
// the caller via use-authenticated-staff.ts). RLS on this table is still
// open (app-wide "共有端末" convention), so the per-driver scoping below
// is enforced client-side, same trust model as the rest of this app.
// `pathname` (not a direct blob URL) is stored for every file — the
// connected Blob store is private, so images are served through
// /api/dispatch-sheet/file (see fileUrl below).
type PageImage = { page: number; index: number; pathname: string }
type DispatchSheetRow = {
  id: string
  blob_url: string
  original_filename: string
  uploaded_at: string
  page_images: PageImage[] | null
}

function fileUrl(pathname: string): string {
  return `/api/dispatch-sheet/file?pathname=${encodeURIComponent(pathname)}`
}

async function fetchOwnDispatchSheets(
  staffId: string,
): Promise<DispatchSheetRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('dispatch_sheets')
    .select('id, blob_url, original_filename, uploaded_at, page_images')
    .eq('uploaded_by_staff_id', staffId)
    .order('uploaded_at', { ascending: false })
  if (error) throw error
  return (data as DispatchSheetRow[]) ?? []
}

// Sends the file as the raw request body (filename via header) rather
// than multipart/form-data — see the upload route for why.
async function uploadFile(file: File | Blob, filename: string): Promise<string> {
  const res = await fetch('/api/dispatch-sheet/upload', {
    method: 'POST',
    headers: { 'x-filename': encodeURIComponent(filename) },
    body: file,
  })
  if (!res.ok) throw new Error('upload failed')
  const { pathname } = (await res.json()) as { pathname: string }
  return pathname
}

// A dispatch sheet page is a wide landscape table. Splitting it into 2-3
// vertical bands (rather than showing the whole page shrunk to fit) keeps
// each band's text legible on a phone without pinch-zooming.
function chooseSliceCount(width: number, height: number): number {
  const aspect = width / height
  if (aspect > 2.5) return 3
  return 2
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

// Renders every page of a PDF to canvas via pdfjs-dist, splits each into
// vertical slices, and uploads each slice as a PNG. Runs entirely
// client-side; pdfjs-dist is dynamically imported so it never ends up in
// the server bundle.
async function convertPdfToPageImages(
  file: File,
  onProgress: (done: number, total: number) => void,
): Promise<PageImage[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise

  const images: PageImage[] = []
  onProgress(0, pdf.numPages)

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    // Target a render width comfortably above phone screen width so text
    // stays sharp after the vertical split.
    const targetWidth = 1400
    const baseViewport = page.getViewport({ scale: 1 })
    const scale = targetWidth / baseViewport.width
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas context unavailable')
    await page.render({ canvasContext: context, viewport }).promise

    const sliceCount = chooseSliceCount(canvas.width, canvas.height)
    const sliceHeight = Math.ceil(canvas.height / sliceCount)

    for (let index = 0; index < sliceCount; index++) {
      const y = index * sliceHeight
      const height = Math.min(sliceHeight, canvas.height - y)
      if (height <= 0) continue

      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width = canvas.width
      sliceCanvas.height = height
      const sliceContext = sliceCanvas.getContext('2d')
      if (!sliceContext) throw new Error('canvas context unavailable')
      sliceContext.drawImage(
        canvas,
        0,
        y,
        canvas.width,
        height,
        0,
        0,
        canvas.width,
        height,
      )

      const blob = await new Promise<Blob | null>((resolve) =>
        sliceCanvas.toBlob(resolve, 'image/png'),
      )
      if (!blob) throw new Error('failed to encode slice')

      const pathname = await uploadFile(
        blob,
        `page-${pageNumber}-slice-${index}.png`,
      )
      images.push({ page: pageNumber, index, pathname })
    }

    onProgress(pageNumber, pdf.numPages)
  }

  return images
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
    | { state: 'converting'; done: number; total: number }
    | { state: 'error'; message: string }
  >({ state: 'idle' })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selectedSheet = useMemo(
    () => sheets.find((s) => s.id === selectedId) ?? null,
    [sheets, selectedId],
  )
  const sortedPageImages = useMemo(() => {
    if (!selectedSheet?.page_images) return []
    return [...selectedSheet.page_images].sort(
      (a, b) => a.page - b.page || a.index - b.index,
    )
  }, [selectedSheet])

  const handleFileSelected = useCallback(
    async (file: File) => {
      setStatus({ state: 'converting', done: 0, total: 1 })
      try {
        const pdfPathname = await uploadFile(file, file.name)
        const pageImages = await convertPdfToPageImages(file, (done, total) =>
          setStatus({ state: 'converting', done, total }),
        )

        const supabase = createClient()
        // `blob_url` stores a Blob pathname (not a direct URL) since the
        // connected store is private — see fileUrl() above.
        const { error } = await supabase.from('dispatch_sheets').insert({
          blob_url: pdfPathname,
          original_filename: file.name,
          page_images: pageImages,
          uploaded_by_staff_id: staffId,
        })
        if (error) throw error

        setStatus({ state: 'idle' })
        await refetchSheets()
      } catch (error) {
        console.error('[v0] dispatch sheet conversion failed:', error)
        setStatus({
          state: 'error',
          message: '変換に失敗しました。もう一度お試しください。',
        })
      }
    },
    [refetchSheets, staffId],
  )

  if (selectedSheet) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="flex w-fit items-center gap-1.5 self-start rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-95"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          一覧に戻る
        </button>
        <div>
          <h2 className="truncate text-lg font-bold text-foreground">
            {selectedSheet.original_filename}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            アップロード：{formatUploadedAt(selectedSheet.uploaded_at)}
          </p>
        </div>
        {sortedPageImages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            画像がありません。
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {sortedPageImages.map((img) => (
              <img
                key={`${img.page}-${img.index}`}
                src={fileUrl(img.pathname) || '/placeholder.svg'}
                alt={`配車表 ${img.page}ページ目 ${img.index + 1}/${
                  sortedPageImages.filter((p) => p.page === img.page).length
                }`}
                className="w-full rounded-xl border border-border"
                crossOrigin="anonymous"
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">配車表</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {staffName}さんの配車表です。PDFをアップロードすると、スマホで見やすい縦画面で確認できます。
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
        disabled={status.state === 'converting'}
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-4 py-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-[0.99] disabled:opacity-60"
      >
        {status.state === 'converting' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            変換中… ({status.done}/{status.total}ページ)
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
                  {sheet.original_filename}
                </p>
                <p className="text-xs text-muted-foreground">
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
