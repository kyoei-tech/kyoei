// CSV import for POS番号一覧: 会員名, よみ, 会場名, 会員番号 — one member number per
// row. Accepts Excel's "CSV UTF-8" (with or without BOM) and plain Shift_JIS
// CSV (Excel's default on Japanese Windows).

export type CustomerRow = { name: string; kana: string; venue: string; number: string }

export const CSV_HEADER = ['会員名', 'よみ', '会場名', '会員番号'] as const

/** Bytes → text: UTF-8 when valid, otherwise Shift_JIS. */
export function decodeCSV(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('shift_jis').decode(bytes)
  }
}

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF/LF, commas inside quotes. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

export type ParsedImport = { rows: CustomerRow[]; headerSkipped: boolean; problem?: string }

/** Rows for import_customers(). A first row that looks like the header is skipped. */
export function toCustomerRows(table: string[][]): ParsedImport {
  if (table.length === 0) return { rows: [], headerSkipped: false, problem: 'ファイルに行がありません' }
  const first = table[0].map((c) => c.trim())
  const headerSkipped = first[0] === CSV_HEADER[0] || first.includes('会員番号')
  const body = headerSkipped ? table.slice(1) : table
  if (body.some((r) => r.length < 4)) {
    return { rows: [], headerSkipped, problem: '列が足りない行があります。「会員名,よみ,会場名,会員番号」の4列にしてください' }
  }
  return {
    headerSkipped,
    rows: body.map(([name, kana, venue, number]) => ({
      name: name.normalize('NFKC').trim(),
      kana: kana.normalize('NFKC').trim(),
      venue: venue.normalize('NFKC').trim(),
      number: number.normalize('NFKC').trim(),
    })),
  }
}

/** For CSV export: quotes fields that need it. */
export function toCSV(rows: string[][]): string {
  const esc = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v)
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n'
}
