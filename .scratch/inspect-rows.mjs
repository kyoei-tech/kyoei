import fs from 'node:fs'
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
const data = new Uint8Array(fs.readFileSync('/vercel/share/v0-project/.scratch/sample3.pdf'))
const pdf = await pdfjs.getDocument({ data }).promise

for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p)
  const content = await page.getTextContent()
  const items = content.items
    .map((raw) => ({ str: raw.str, x: raw.transform[4], y: raw.transform[5], w: raw.width, h: raw.height }))
    .filter((i) => i.str.trim().length > 0)

  console.log(`=== PAGE ${p} ===`)
  // find header row items
  const HEADER_LABELS = ['回戦','請求先','積地','降地','ｵｰｸｼｮﾝ','品名','車体番号','積日','摘要１','出荷地','納入地']
  const headerItems = items.filter((i) => HEADER_LABELS.includes(i.str))
  console.log('HEADER ITEMS:')
  for (const h of headerItems.sort((a,b)=>a.x-b.x)) console.log(`  ${h.str} x=${h.x.toFixed(2)} y=${h.y.toFixed(2)}`)

  // group all items into rows by y (gap 7)
  const sorted = [...items].sort((a,b)=>b.y-a.y)
  const rows = []
  let cur = []
  let prevY = null
  for (const it of sorted) {
    if (prevY !== null && prevY - it.y > 7) { rows.push(cur); cur = [] }
    cur.push(it)
    prevY = it.y
  }
  if (cur.length) rows.push(cur)

  console.log(`TOTAL ROWS: ${rows.length}`)
  for (const [idx, row] of rows.entries()) {
    const sortedRow = [...row].sort((a,b)=>a.x-b.x)
    const line = sortedRow.map(i => `[${i.str}@${i.x.toFixed(0)}]`).join(' ')
    console.log(`ROW ${idx} y=${row[0].y.toFixed(1)}: ${line}`)
  }
}
