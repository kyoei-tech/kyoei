// pdf.js text-layer extraction: every non-blank text item with its position.
// The pdf.js module is passed in so this runs both on Deno (npm: specifier,
// see index.ts) and under node --test with a locally installed pdfjs-dist.

import type { TextItem } from './parser.ts'

type PdfJs = {
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean; useSystemFonts?: boolean }): {
    promise: Promise<{
      numPages: number
      getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>
      destroy(): Promise<void>
    }>
  }
}

type RawItem = { str?: string; transform?: number[]; width?: number; height?: number }

export const MAX_PAGES = 10

export async function extractPages(pdfjs: PdfJs, data: Uint8Array): Promise<TextItem[][]> {
  const pdf = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false }).promise
  try {
    const pages: TextItem[][] = []
    for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES); n++) {
      const content = await (await pdf.getPage(n)).getTextContent()
      const items: TextItem[] = []
      for (const raw of content.items as RawItem[]) {
        if (!raw.str?.trim() || !raw.transform) continue
        items.push({ str: raw.str, x: raw.transform[4], y: raw.transform[5], w: raw.width ?? 0, h: raw.height ?? 0 })
      }
      pages.push(items)
    }
    return pages
  } finally {
    await pdf.destroy()
  }
}
