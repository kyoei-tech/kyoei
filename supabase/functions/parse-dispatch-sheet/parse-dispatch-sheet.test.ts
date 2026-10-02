// Runs under Node (`node --test supabase/functions/parse-dispatch-sheet/`)
// and Deno (`deno test`). Uses synthetic text items laid out at the real
// form's coordinates — the real sample sheet contains personal data and is
// never committed.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractAlerts, normalizeChassis, parseExtractedPages, PARSER_VERSION, type TextItem } from './parser.ts'
import { handle, ownsPath, type Deps, type SheetRow } from './service.ts'

const HEADER_X: Record<string, number> = {
  回戦: 32.5, 請求先: 64.5, 積地: 121.8, 降地: 175.7, ｵｰｸｼｮﾝ: 220.4, 品名: 273.4, 車体番号: 314.7,
  積日: 365.6, 詳細: 395.3, 条件: 420.8, 卸日: 447.8, 摘要１: 594.6, 出荷地: 703.7, 納入地: 750.5, 緊締: 789.8,
}
// Where each column's values are printed (left of some headers — see parser.ts).
const VALUE_X = {
  round: 39.5, billTo: 54.6, pickup: 105.6, dropoff: 159.5, nameArea: 213.3, chassis: 309.7,
  pickupDate: 360.7, pickupCond: 420.3, dropoffDate: 447.8, dropoffCond: 502.5, notes: 525.1,
  shipFrom: 695.2, deliverTo: 743.4, lashing: 789.8,
}
const HEADER_Y = 394.6

const item = (str: string, x: number, y: number, w = str.length * 4.5): TextItem => ({ str, x, y, w, h: 9 })

function headerItems(y = HEADER_Y): TextItem[] {
  return [
    ...Object.entries(HEADER_X).map(([label, x]) => item(label, x, y)),
    item('配車日', 30, 540), item('09月01日', 70, 540),
    item('号車', 580, 548.5), item('9999', 610.8, 548.5),
  ]
}

type RowSpec = {
  top: number
  round?: string
  billTo?: string
  pickup?: string[]
  dropoff?: string[]
  name?: string
  chassis?: string[]
  pickupDate?: string
  pickupCond?: string
  dropoffDate?: string
  dropoffCond?: string
  notes?: string
  shipFrom?: string[]
  deliverTo?: string[]
}

// Mirrors the real layout: most cells on the row's first line, 回戦 vertically
// centered ~5pt lower, wrapped cells continuing in 13.5pt steps.
function rowItems(r: RowSpec): TextItem[] {
  const lines = (values: string[] | undefined, x: number, top: number) =>
    (values ?? []).map((value, i) => item(value, x, top - i * 13.5))
  return [
    ...(r.round ? [item(r.round, VALUE_X.round, r.top - 4.8)] : []),
    ...(r.billTo ? [item(r.billTo, VALUE_X.billTo, r.top)] : []),
    ...lines(r.pickup, VALUE_X.pickup, r.top + 1.1),
    ...lines(r.dropoff, VALUE_X.dropoff, r.top + 3.7),
    ...(r.name ? [item(r.name, VALUE_X.nameArea, r.top)] : []),
    ...lines(r.chassis, VALUE_X.chassis, r.top + 1.1),
    ...(r.pickupDate ? [item(r.pickupDate, VALUE_X.pickupDate, r.top)] : []),
    item(r.pickupCond ?? '以降', VALUE_X.pickupCond, r.top),
    ...(r.dropoffDate ? [item(r.dropoffDate, VALUE_X.dropoffDate, r.top)] : []),
    item(r.dropoffCond ?? '迄', VALUE_X.dropoffCond, r.top),
    ...(r.notes ? [item(r.notes, VALUE_X.notes, r.top)] : []),
    ...lines(r.shipFrom, VALUE_X.shipFrom, r.top),
    ...lines(r.deliverTo, VALUE_X.deliverTo, r.top),
  ]
}

const SAMPLE_ROWS: RowSpec[] = [
  {
    top: 378.5, round: '1', billTo: 'ﾃｽﾄ商会', pickup: ['共栄 本郷ﾔｰﾄﾞ'], dropoff: ['ﾃｽﾄAA', '3月出品分'],
    name: '練馬1234 ﾉｰﾄ', chassis: ['E13-111111'], pickupDate: '08/19', notes: '050-0000-0000瀬戸1-1',
    shipFrom: ['NR金沢八', '景駅前 金'], deliverTo: ['ﾃｽﾄAA', '担当様'],
  },
  {
    top: 352.6, round: '1', billTo: 'ﾃｽﾄ商会', pickup: ['共栄 本郷ﾔｰﾄﾞ'], dropoff: ['ﾃｽﾄAA'],
    name: '28034 ﾌﾘｰﾄﾞｽﾊﾟｲｸ', chassis: ['GP3-', '1022135'], pickupDate: '08/25',
    notes: 'ﾅﾝﾊﾞｰあればｶｯﾄ※AM着で早急に発送', shipFrom: ['ﾎﾝﾀﾞAA御', '殿場ｻﾃﾗｲﾄ'], deliverTo: ['木更津JFA', 'JAPAN'],
  },
  {
    top: 326.7, round: '2', billTo: '東西海運', pickup: ['JU神奈川 【搬出】(5330)'], dropoff: ['木更津JFA JAPAN', 'FORWARDING'],
    name: '6200 ｱﾙﾄ', chassis: ['HA36S-522329'], pickupDate: '08/28', dropoffDate: '9/4', notes: 'ｶｰﾒﾝ|期限内搬出',
    shipFrom: ['JU神奈川'], deliverTo: ['ECL木更津'],
  },
  // A scheduling note between blocks: no name/chassis, so not a vehicle.
  { top: 300.8, billTo: '○○海運 9/14予約OK', pickupCond: '' },
]

test('reads every column of the real layout, including wrapped second lines', () => {
  const sheet = parseExtractedPages([[...headerItems(), ...SAMPLE_ROWS.flatMap(rowItems)]])
  assert.equal(sheet.parserVersion, PARSER_VERSION)
  assert.equal(sheet.dispatchDate, '09月01日')
  assert.equal(sheet.vehicleNumber, '9999')
  assert.equal(sheet.vehicleCount, 3)
  assert.deepEqual(sheet.rounds.map((r) => [r.round, r.vehicles.length]), [['1', 2], ['2', 1]])
  assert.deepEqual(sheet.warnings, [])

  const [first, second, third] = sheet.rounds.flatMap((r) => r.vehicles)
  // 出荷地/納入地 second lines sit ~9pt below the centered 回戦 digit.
  assert.equal(first.shipFrom, 'NR金沢八景駅前 金')
  assert.equal(first.deliverTo, 'テストAA担当様')
  assert.equal(first.vehicleName, 'ノート')
  assert.equal(first.auctionInfo, '練馬1234')
  assert.equal(first.dropoff, 'テストAA3月出品分')
  assert.deepEqual(first.phones, ['050-0000-0000'])
  assert.equal(first.phone, '050-0000-0000')
  assert.equal(first.pickupDate, '08/19')
  assert.equal(first.pickupCondition, '以降')
  assert.equal(first.dropoffDate, null)
  assert.equal(first.dropoffCondition, '迄')
  assert.equal(first.pickupDateDetail, '08/19 以降')

  assert.equal(second.chassisNumber, 'GP3-1022135')
  assert.equal(second.vehicleName, 'フリードスパイク')
  assert.equal(second.auctionInfo, '28034')
  assert.equal(second.shipFrom, 'ホンダAA御殿場サテライト')
  assert.equal(second.deliverTo, '木更津JFA JAPAN')
  assert.deepEqual(second.alerts, ['早急', 'ナンバーカット', '時間指定'])

  assert.equal(third.pickup, 'JU神奈川')
  assert.equal(third.pickupRef, '【搬出】(5330)')
  assert.equal(third.dropoff, '木更津JFA JAPAN FORWARDING')
  assert.equal(third.dropoffDate, '09/04')
  assert.deepEqual(third.alerts, ['期限内搬出'])
  assert.deepEqual(third.warnings, [])
})

test('a round printed once carries over to following rows and onto the next page', () => {
  const page1 = [...headerItems(), ...rowItems({ ...SAMPLE_ROWS[0] }), ...rowItems({ ...SAMPLE_ROWS[1], round: undefined })]
  const page2 = [...headerItems(510.6), ...rowItems({ ...SAMPLE_ROWS[2], top: 494.6, round: undefined })]
  const sheet = parseExtractedPages([page1, page2])
  assert.deepEqual(sheet.rounds.map((r) => [r.round, r.vehicles.length]), [['1', 3]])
})

test('suspicious values are flagged per vehicle and summarized for the sheet', () => {
  const rows = [{ ...SAMPLE_ROWS[0], chassis: ['E13 1111'], pickupDate: '13/40' }, SAMPLE_ROWS[1]]
  const sheet = parseExtractedPages([[...headerItems(), ...rows.flatMap(rowItems)]])
  const [bad, good] = sheet.rounds[0].vehicles
  assert.deepEqual(bad.warnings, ['車体番号の形式がいつもと違います', '積日の日付が正しくありません'])
  assert.deepEqual(good.warnings, [])
  assert.deepEqual(sheet.warnings, ['1台に確認が必要な項目があります'])
})

test('a blank 車体番号 is kept empty and not flagged (recorded from the real car in the app)', () => {
  const sheet = parseExtractedPages([[...headerItems(), ...rowItems({ ...SAMPLE_ROWS[0], chassis: [] })]])
  const [vehicle] = sheet.rounds[0].vehicles
  assert.equal(vehicle.vehicleName, 'ノート')
  assert.equal(vehicle.chassisNumber, '')
  assert.deepEqual(vehicle.warnings, [])
  assert.deepEqual(sheet.warnings, [])
})

test('a PDF that is not this form is reported, not silently empty', () => {
  const sheet = parseExtractedPages([[item('請求書', 30, 500), item('合計 12,000円', 30, 480)]])
  assert.equal(sheet.vehicleCount, 0)
  assert.deepEqual(sheet.warnings, ['配車表の様式を認識できませんでした', '配車日が読み取れませんでした'])
})

test('chassis numbers normalize to the comparison form', () => {
  assert.equal(normalizeChassis('ｇｐ３－１０２２１３５'), 'GP3-1022135')
  assert.equal(normalizeChassis(' GP3ー1022135 '), 'GP3-1022135')
  assert.equal(normalizeChassis('GP3 - 1022135'), 'GP3-1022135')
})

test('alert keywords', () => {
  assert.deepEqual(extractAlerts('ナンバーカット'), ['ナンバーカット'])
  assert.deepEqual(extractAlerts('至急 9/14予約OK'), ['早急', '予約'])
  assert.deepEqual(extractAlerts('富士'), [])
})

// ---------------------------------------------------------------- service

const USER = '0b6c3c1e-1111-4222-8333-444455556666'
const OTHER = '9f000000-1111-4222-8333-444455556666'

function deps(rows: SheetRow[], overrides: Partial<Deps> = {}) {
  const saved: string[] = []
  const errors: string[] = []
  const d: Deps = {
    userId: USER,
    loadSheet: async (id) => rows.find((r) => r.id === id) ?? null,
    loadOutdated: async () => rows,
    download: async () => new Uint8Array([1]),
    extract: async () => [[...headerItems(), ...SAMPLE_ROWS.flatMap(rowItems)]],
    parse: parseExtractedPages,
    saveResult: async (id) => void saved.push(id),
    saveError: async (id) => void errors.push(id),
    ...overrides,
  }
  return { d, saved, errors }
}

test('ownsPath only accepts the caller\'s own folder', () => {
  assert.equal(ownsPath(USER, `${USER}/a.pdf`), true)
  assert.equal(ownsPath(USER.toUpperCase(), `${USER}/a.pdf`), true)
  assert.equal(ownsPath(USER, `${OTHER}/a.pdf`), false)
  assert.equal(ownsPath(USER, USER), false)
  assert.equal(ownsPath(USER, `${USER}/../${OTHER}/a.pdf`), false)
})

test('parses one own sheet and saves the result', async () => {
  const { d, saved } = deps([{ id: 's1', blob_url: `${USER}/a.pdf`, parser_version: null }])
  const outcome = await handle({ sheetId: 's1' }, d)
  assert.equal(outcome.status, 200)
  assert.deepEqual(outcome.body, { results: [{ id: 's1', ok: true, vehicleCount: 3, warnings: [] }] })
  assert.deepEqual(saved, ['s1'])
})

test('refuses anonymous callers and other people\'s sheets', async () => {
  const rows = [{ id: 's2', blob_url: `${OTHER}/b.pdf`, parser_version: null }]
  assert.equal((await handle({ sheetId: 's2' }, deps(rows, { userId: null }).d)).status, 401)
  const { d, saved } = deps(rows)
  assert.equal((await handle({ sheetId: 's2' }, d)).status, 403)
  assert.equal((await handle({ sheetId: 'missing' }, d)).status, 404)
  assert.equal((await handle({}, d)).status, 400)
  assert.deepEqual(saved, [])
})

test('reparseOutdated re-reads only own sheets and records failures', async () => {
  const rows = [
    { id: 'mine-ok', blob_url: `${USER}/a.pdf`, parser_version: 1 },
    { id: 'theirs', blob_url: `${OTHER}/b.pdf`, parser_version: null },
    { id: 'mine-broken', blob_url: `${USER}/c.pdf`, parser_version: null },
  ]
  const { d, saved, errors } = deps(rows, {
    download: async (path) => {
      if (path.endsWith('c.pdf')) throw new Error('not a pdf')
      return new Uint8Array([1])
    },
  })
  const outcome = await handle({ reparseOutdated: true }, d)
  assert.equal(outcome.status, 200)
  assert.deepEqual(saved, ['mine-ok'])
  assert.deepEqual(errors, ['mine-broken'])
  assert.deepEqual(
    'results' in outcome.body && outcome.body.results.map((r) => [r.id, r.ok]),
    [['mine-ok', true], ['mine-broken', false]],
  )
})
