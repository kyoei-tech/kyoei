// Edge Function: parses a driver's own 配車表 PDF (already uploaded to the
// private dispatch-sheets bucket) and stores the result on its
// dispatch_sheets row. Called by the iOS app with the signed-in user's JWT
// (deploy with JWT verification on — the default).
//
//   { "sheetId": "<uuid>" }          parse one sheet (right after upload, or "再解析")
//   { "reparseOutdated": true }      re-read the caller's sheets parsed by an
//                                    older parser version (or never parsed)

import { createClient } from 'jsr:@supabase/supabase-js@2'
import * as pdfjs from 'npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs'
import * as pdfjsWorker from 'npm:pdfjs-dist@4.10.38/legacy/build/pdf.worker.mjs'
import { extractPages } from './extract.ts'
import { PARSER_VERSION, parseExtractedPages } from './parser.ts'
import { handle, type Request as ParseRequest, type SheetRow } from './service.ts'

// Run pdf.js's worker on this thread (Edge Functions have no Web Workers).
;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing secret ${name}`)
  return value
}

// Injected by the platform.
const url = requireEnv('SUPABASE_URL')
const anonKey = requireEnv('SUPABASE_ANON_KEY')
// The service role is used only after ownership of the sheet has been
// checked against the caller's own user id (service.ts ownsPath).
const admin = createClient(url, requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

const SHEET_COLUMNS = 'id, blob_url, parser_version'

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const authorization = request.headers.get('Authorization') ?? ''
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: auth } = await caller.auth.getUser(authorization.replace(/^Bearer\s+/i, ''))

  let body: ParseRequest
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Bad request' }, { status: 400 })
  }

  const outcome = await handle(body, {
    userId: auth.user?.id ?? null,
    loadSheet: async (id) => {
      const { data, error } = await admin.from('dispatch_sheets').select(SHEET_COLUMNS).eq('id', id).maybeSingle()
      if (error) throw error
      return data as SheetRow | null
    },
    loadOutdated: async (userId, version) => {
      const { data, error } = await admin
        .from('dispatch_sheets')
        .select(SHEET_COLUMNS)
        .like('blob_url', `${userId}/%`)
        .or(`parser_version.is.null,parser_version.lt.${version}`)
        .order('uploaded_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as SheetRow[]
    },
    // Read with the caller's own session, so Storage RLS applies as well.
    download: async (path) => {
      const { data, error } = await caller.storage.from('dispatch-sheets').download(path)
      if (error) throw error
      return new Uint8Array(await data.arrayBuffer())
    },
    extract: (data) => extractPages(pdfjs, data),
    parse: parseExtractedPages,
    saveResult: async (id, result) => {
      const { error } = await admin
        .from('dispatch_sheets')
        .update({
          extracted_data: result,
          dispatch_date: result.dispatchDate,
          parser_version: result.parserVersion,
          parse_error: null,
          parsed_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    saveError: async (id, message) => {
      // Recording the version keeps reparseOutdated from retrying a sheet this
      // parser cannot read on every call; the app's 再解析 button still can.
      await admin
        .from('dispatch_sheets')
        .update({ parse_error: message, parser_version: PARSER_VERSION, parsed_at: new Date().toISOString() })
        .eq('id', id)
    },
  })

  console.log(JSON.stringify({ status: outcome.status, results: 'results' in outcome.body ? outcome.body.results.length : 0 }))
  return Response.json(outcome.body, { status: outcome.status })
})
