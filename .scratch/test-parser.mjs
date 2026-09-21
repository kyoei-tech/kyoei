import { readFile } from 'node:fs/promises'
import { parseExtractedPages } from '../lib/dispatch-sheet-parser.ts'

const fixture = JSON.parse(
  await readFile(new URL('./fixture.json', import.meta.url), 'utf-8'),
)

const result = parseExtractedPages(fixture)
console.log(JSON.stringify(result, null, 2))
