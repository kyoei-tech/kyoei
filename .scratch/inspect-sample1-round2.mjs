import fs from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const data = new Uint8Array(fs.readFileSync('.scratch/sample1.pdf'))
const pdf = await getDocument({ data }).promise
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p)
  const content = await page.getTextContent()
  const items = content.items
    .map((raw) => ({ str: raw.str, x: raw.transform[4], y: raw.transform[5], w: raw.width }))
    .filter((i) => i.str.trim().length > 0)
  const target = items.filter((i) => i.str.includes('ｽﾍﾟｰｼｱ') || i.str.includes('ｼﾞﾑﾆｰ') || i.str.includes('ﾉｱ') || /^\d+$/.test(i.str.trim()))
  for (const t of target) console.log('page', p, JSON.stringify(t))
}
