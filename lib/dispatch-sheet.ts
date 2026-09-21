import { createClient } from './supabase/client'
import type { ExtractedDispatchSheet } from './dispatch-sheet-schema'

// Each driver uploads and sees only their own dispatch sheets — scoped by
// `uploaded_by_staff_id` (their linked staff_members.id, resolved by
// mypage-view.tsx before this feature is ever reachable). RLS on this
// table is still open (app-wide "共有端末" convention), so the per-driver
// scoping is enforced client-side, same trust model as the rest of the
// app. `blob_url` stores a Blob pathname (not a direct URL) since the
// connected store is private — see dispatchSheetFileUrl below.
export type DispatchSheetRow = {
  id: string
  blob_url: string
  original_filename: string
  uploaded_at: string
  dispatch_date: string | null
  extracted_data: ExtractedDispatchSheet
}

export function dispatchSheetFileUrl(pathname: string): string {
  return `/api/dispatch-sheet/file?pathname=${encodeURIComponent(pathname)}`
}

export async function fetchOwnDispatchSheets(
  staffId: string,
): Promise<DispatchSheetRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('dispatch_sheets')
    .select(
      'id, blob_url, original_filename, uploaded_at, dispatch_date, extracted_data',
    )
    .eq('uploaded_by_staff_id', staffId)
    .order('dispatch_date', { ascending: false, nullsFirst: false })
    .order('uploaded_at', { ascending: false })
  if (error) throw error
  return (data as DispatchSheetRow[]) ?? []
}

// The PDF itself only ever prints month/day (e.g. "09月19日"), never a
// year, so this fills one in relative to today — the year the sheet was
// uploaded, unless the parsed month is far enough ahead of the current
// one that it must actually belong to last year (e.g. a 12月 sheet
// uploaded in early 1月).
export function parseDispatchDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const match = raw.match(/(\d{1,2})\s*[月/](\d{1,2})/)
  if (!match) return null
  const month = Number(match[1])
  const day = Number(match[2])
  if (!month || !day || month > 12 || day > 31) return null

  const now = new Date()
  let year = now.getFullYear()
  if (month - (now.getMonth() + 1) > 6) year -= 1

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function formatDispatchDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日（${weekday}）`
}

export async function uploadAndExtractDispatchSheet(
  file: File,
): Promise<{ pathname: string; data: ExtractedDispatchSheet }> {
  const res = await fetch('/api/dispatch-sheet/process', {
    method: 'POST',
    headers: { 'x-filename': encodeURIComponent(file.name) },
    body: file,
  })
  if (!res.ok) throw new Error('processing failed')
  return res.json()
}

export async function saveDispatchSheet(params: {
  staffId: string
  filename: string
  pathname: string
  data: ExtractedDispatchSheet
}): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('dispatch_sheets').insert({
    blob_url: params.pathname,
    original_filename: params.filename,
    uploaded_by_staff_id: params.staffId,
    dispatch_date: parseDispatchDate(params.data.dispatchDate),
    extracted_data: params.data,
  })
  if (error) throw error
}
