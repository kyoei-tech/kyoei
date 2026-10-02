import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { SECTIONS } from '@/lib/content'
import { createServiceClient } from '@/lib/supabase/service'
import { TableEditor } from '../TableEditor'

/** アプリ内編集: every table of one section, editable in place. */
export default async function ContentPage({ params }: { params: Promise<{ section: string }> }) {
  await requireAdmin()
  const { section: slug } = await params
  const section = SECTIONS.find((s) => s.slug === slug)
  if (!section) notFound()
  const service = createServiceClient()
  const data = await Promise.all(section.tables.map(async (def) => {
    let query = service.from(def.table).select('*')
    if (def.ids) query = query.in('id', def.ids)
    for (const [column, ascending] of def.order) query = query.order(column, { ascending })
    const { data: rows } = await query.limit(2000)
    return (rows ?? []) as Record<string, unknown>[]
  }))
  const rowsByTable = Object.fromEntries(section.tables.map((def, i) => [def.table, data[i]]))
  // Private buckets: short-lived URLs for the thumbnails.
  const imageUrls: Record<string, string> = {}
  for (const def of section.tables) {
    for (const field of def.fields.filter((f) => f.type === 'images' && f.bucket)) {
      const paths = rowsByTable[def.table].flatMap((r) => (Array.isArray(r[field.key]) ? (r[field.key] as string[]) : []))
      if (!paths.length) continue
      const { data: signed } = await service.storage.from(field.bucket!).createSignedUrls(paths, 3600)
      for (const s of signed ?? []) if (s.path && s.signedUrl) imageUrls[s.path] = s.signedUrl
    }
  }
  return (
    <>
      <div className="page-header">
        <div>
          <h1>{section.title}</h1>
          <p>{section.description} ここで保存した内容は、すぐにアプリへ反映されます。</p>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 26 }}>
        {section.tables.map((def) => {
          const refOptions = Object.fromEntries(def.fields.filter((f) => f.type === 'ref' && f.ref).map((f) => [
            f.key,
            (rowsByTable[f.ref!.table] ?? []).map((r) => [String(r[f.ref!.value]), String(r[f.ref!.label] ?? '')] as [string, string]),
          ]))
          return <TableEditor key={def.table} slug={section.slug} def={def} rows={rowsByTable[def.table]} refOptions={refOptions} showHeading={section.tables.length > 1} imageUrls={imageUrls} />
        })}
      </div>
    </>
  )
}
