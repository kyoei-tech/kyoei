import { requireAdmin } from '@/lib/auth'
import { photoFileName } from '@/lib/pickup'
import { createClient } from '@/lib/supabase/server'

/**
 * One 引取不可 photo, served from this console's own URL so it can be dragged
 * to the desktop under a readable name (the last path segment). Read with
 * the admin's own session: storage policies allow only people permitted to
 * see 引取不可. ?download=1 makes the browser save it instead of showing it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; index: string }> }) {
  await requireAdmin()
  const { id, index } = await params
  const supabase = await createClient()
  const { data: r } = await supabase.from('pickup_failures').select('photo_paths, created_at, vehicle_name, chassis_number').eq('id', id).maybeSingle()
  const n = Number(index)
  const path = Number.isInteger(n) ? (r?.photo_paths as string[] | undefined)?.[n] : undefined
  if (!r || !path) return new Response('Not found', { status: 404 })
  const { data: blob, error } = await supabase.storage.from('pickup-photos').download(path)
  if (error || !blob) return new Response('Not found', { status: 404 })
  const fileName = photoFileName(r.created_at, r.vehicle_name, r.chassis_number, n)
  const download = new URL(request.url).searchParams.has('download')
  return new Response(blob, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="pickup-${n + 1}.jpg"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'private, max-age=600',
    },
  })
}
