// Request handling for parse-dispatch-sheet, with storage/DB/pdf.js access
// injected so it can be tested without a Supabase project.

import { PARSER_VERSION, type ParsedDispatchSheet, type TextItem } from './parser.ts'

export type SheetRow = { id: string; blob_url: string; parser_version: number | null }

export type Deps = {
  /** The caller's auth user id (from their JWT), or null when not signed in. */
  userId: string | null
  loadSheet(id: string): Promise<SheetRow | null>
  /** The caller's own sheets that were never parsed or used an older parser. */
  loadOutdated(userId: string, version: number): Promise<SheetRow[]>
  download(path: string): Promise<Uint8Array>
  extract(data: Uint8Array): Promise<TextItem[][]>
  parse(pages: TextItem[][]): ParsedDispatchSheet
  saveResult(id: string, result: ParsedDispatchSheet): Promise<void>
  saveError(id: string, message: string): Promise<void>
}

export type Request = { sheetId?: unknown; reparseOutdated?: unknown }

export type Outcome =
  | { status: 200; body: { results: SheetResult[] } }
  | { status: 400 | 401 | 403 | 404; body: { error: string } }

export type SheetResult =
  | { id: string; ok: true; vehicleCount: number; warnings: string[] }
  | { id: string; ok: false; error: string }

/** Originals live at "<auth uid>/<file>" — the same rule the Storage RLS enforces. */
export function ownsPath(userId: string, path: string): boolean {
  const [folder, ...rest] = path.split('/')
  return folder.toLowerCase() === userId.toLowerCase() && rest.length > 0 && !rest.includes('..')
}

const MAX_REPARSE = 20

export async function handle(request: Request, deps: Deps): Promise<Outcome> {
  const userId = deps.userId
  if (!userId) return { status: 401, body: { error: 'ログインしてください' } }

  let sheets: SheetRow[]
  if (typeof request.sheetId === 'string' && request.sheetId) {
    const sheet = await deps.loadSheet(request.sheetId)
    if (!sheet) return { status: 404, body: { error: '配車表が見つかりません' } }
    if (!ownsPath(userId, sheet.blob_url)) return { status: 403, body: { error: '自分の配車表ではありません' } }
    sheets = [sheet]
  } else if (request.reparseOutdated === true) {
    sheets = (await deps.loadOutdated(userId, PARSER_VERSION)).filter((s) => ownsPath(userId, s.blob_url)).slice(0, MAX_REPARSE)
  } else {
    return { status: 400, body: { error: 'sheetId か reparseOutdated を指定してください' } }
  }

  const results: SheetResult[] = []
  for (const sheet of sheets) {
    try {
      const result = deps.parse(await deps.extract(await deps.download(sheet.blob_url)))
      await deps.saveResult(sheet.id, result)
      results.push({ id: sheet.id, ok: true, vehicleCount: result.vehicleCount, warnings: result.warnings })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await deps.saveError(sheet.id, message.slice(0, 500))
      results.push({ id: sheet.id, ok: false, error: '配車表を読み取れませんでした' })
    }
  }
  return { status: 200, body: { results } }
}
