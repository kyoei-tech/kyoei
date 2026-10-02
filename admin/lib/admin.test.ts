// npm test  (node --test, TypeScript stripped by Node 24)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decodeCSV, parseCSV, toCSV, toCustomerRows } from './csv.ts'
import { groupByVenue, matchesQuery, type CustomerRecord } from './customers.ts'
import { appSetupURL, formatToken, generateToken, normalizeLoginID, normalizeToken, webSetupURL } from './tokens.ts'

test('CSV: quotes, commas, CRLF, blank lines', () => {
  const text = '会員名,よみ,会場名,会員番号\r\n"山田, 太郎",やまだ,USS東京,1001\r\n\r\n"佐藤 ""花子""",さとう,JU神奈川,77\n'
  assert.deepEqual(parseCSV(text), [
    ['会員名', 'よみ', '会場名', '会員番号'],
    ['山田, 太郎', 'やまだ', 'USS東京', '1001'],
    ['佐藤 "花子"', 'さとう', 'JU神奈川', '77'],
  ])
})

test('CSV: header detection, NFKC, missing columns', () => {
  const parsed = toCustomerRows([['会員名', 'よみ', '会場名', '会員番号'], ['山田　太郎', 'ﾔﾏﾀﾞ', 'ＵＳＳ東京', '１００１']])
  assert.equal(parsed.headerSkipped, true)
  assert.deepEqual(parsed.rows, [{ name: '山田 太郎', kana: 'ヤマダ', venue: 'USS東京', number: '1001' }])
  assert.equal(toCustomerRows([['山田', 'やまだ', 'USS東京', '1']]).headerSkipped, false)
  assert.ok(toCustomerRows([['山田', 'やまだ']]).problem)
})

test('CSV: UTF-8 with BOM and Shift_JIS both decode', () => {
  const utf8 = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('会員名')])
  assert.equal(decodeCSV(utf8), '会員名')
  const sjis = new Uint8Array([0x89, 0xef, 0x88, 0xf5, 0x96, 0xbc]) // 会員名 in Shift_JIS
  assert.equal(decodeCSV(sjis), '会員名')
})

test('CSV export round-trips through the parser', () => {
  const rows = [['会員名', 'よみ', '会場名', '会員番号'], ['山田, 太郎', 'やまだ', 'USS東京', '1001']]
  assert.deepEqual(parseCSV(toCSV(rows).replace(/^﻿/, '')), rows)
})

const member: CustomerRecord = {
  id: 'c1', name: '山田 太郎', kana: 'やまだ たろう', updated_at: '',
  customer_numbers: [
    { id: 'n3', venue: 'USS東京', member_number: '1002' },
    { id: 'n1', venue: 'JU神奈川', member_number: '77' },
    { id: 'n2', venue: 'USS東京', member_number: '1001' },
  ],
}

test('numbers are grouped by venue, numbers in natural order', () => {
  assert.deepEqual(groupByVenue(member.customer_numbers).map((v) => [v.venue, v.numbers.map((n) => n.number)]), [
    ['JU神奈川', ['77']],
    ['USS東京', ['1001', '1002']],
  ])
})

test('search matches name, よみ, venue or number', () => {
  assert.ok(matchesQuery(member, 'やまだ'))
  assert.ok(matchesQuery(member, '１００２'))
  assert.ok(matchesQuery(member, 'uss 1001'))
  assert.ok(!matchesQuery(member, '佐藤'))
})

test('setup codes and login IDs mirror the app', () => {
  const token = generateToken()
  assert.equal(normalizeToken(formatToken(token)), token)
  assert.equal(appSetupURL('ABCDEFGHJKMNPQRS'), 'kyoei://setup?t=ABCDEFGHJKMNPQRS')
  assert.equal(webSetupURL('https://admin.example.com/', 'ABCD'), 'https://admin.example.com/setup?t=ABCD')
  assert.equal(normalizeLoginID('KYOEI0026'), 'kyoei0026')
  assert.equal(normalizeLoginID('a'), null)
})

import { isTrailerClass, vehicleClassLabel, vehicleProblem } from './profile.ts'

test('vehicle class rules', () => {
  assert.equal(vehicleClassLabel('cab_trailer_hanging'), 'トレーラー（キャブ搭・宙吊り）')
  assert.ok(isTrailerClass('trailer_lifter') && !isTrailerClass('five_car'))
  assert.equal(vehicleProblem('five_car', 'truck', null), null)
  assert.equal(vehicleProblem('trailer_lifter', 'head', 'chassis'), null)
  assert.ok(vehicleProblem('trailer_lifter', 'truck', null))
  assert.ok(vehicleProblem('five_car', 'head', null))
  assert.ok(vehicleProblem('five_car', 'truck', 'chassis'))
  assert.equal(vehicleProblem(null, null, null), null) // 新人: 未定
})

test('inspection items: form validation and 車格 selection', async () => {
  const { itemFromForm, classesFrom } = await import('./inspection.ts')
  const form = (values: Record<string, string>) => (key: string) => values[key] ?? null
  const ok = itemFromForm(form({ section: ' タイヤ ', label: '空気圧', frequency: 'weekly', scope: 'each_unit', sort_order: '60', active: 'on' }), [])
  assert.deepEqual(ok, { section: 'タイヤ', label: '空気圧', frequency: 'weekly', scope: 'each_unit', classes: null, sort_order: 60, active: true })
  assert.ok('error' in itemFromForm(form({ section: 'x', label: 'y', frequency: 'daily', scope: 'once' }), []))
  assert.ok('error' in itemFromForm(form({ section: 'x', label: '', frequency: 'every', scope: 'once' }), []))
  assert.deepEqual(classesFrom(['trailer_hanging', 'bogus', 'cab_trailer_hanging']), ['trailer_hanging', 'cab_trailer_hanging'])
})

test('inspection records: month range in JST', async () => {
  const { monthRange, shiftMonth } = await import('./inspection.ts')
  assert.deepEqual(monthRange('2026-12'), { month: '2026-12', from: '2026-12-01', to: '2027-01-01' })
  // 2026-10-31 20:00 UTC is already November in Japan.
  assert.equal(monthRange('bad', new Date('2026-10-31T20:00:00Z')).month, '2026-11')
  assert.equal(shiftMonth('2026-01', -1), '2025-12')
  assert.equal(shiftMonth('2026-12', 1), '2027-01')
})

test('packing floors and card plates mirror the app', async () => {
  const { loadingFloors, packingPlates } = await import('./profile.ts')
  assert.deepEqual(loadingFloors('loader'), [])
  assert.deepEqual(loadingFloors('heavy'), ['上段', '下段前', '下段後'])
  assert.deepEqual(loadingFloors('trailer_hanging'), ['1番', '2番', '3番', '4番', '5番', '宙吊り', '6番'])
  assert.deepEqual(loadingFloors('cab_trailer_lifter'), ['0番', '1番', '2番', '3番', '4番', '5番', '6番'])
  assert.deepEqual(loadingFloors('cab_trailer_hanging'), ['0番', '1番', '2番', '3番', '4番', '5番', '宙吊り', '6番'])
  assert.deepEqual(packingPlates('three_car', 'T', null), ['T'])
  assert.deepEqual(packingPlates('trailer_lifter', 'H', 'C'), ['C'])
  assert.deepEqual(packingPlates('cab_trailer_hanging', 'H', 'C'), ['H', 'C'])
})

test('self review template form and allowance table', async () => {
  const { templateFromForm, allowanceProblem, markOf, sum } = await import('./review.ts')
  const base: Record<string, string> = { purpose_question: '何のために', deadline_day: '15' }
  for (let i = 0; i < 10; i++) base[`item_${i}`] = `項目${i + 1}`
  for (let i = 0; i < 4; i++) { base[`goal_${i}`] = `目標${i}`; base[`reflection_${i}`] = `反省${i}` }
  const rows = [[90, 90, '50,000'], [58, 89, '15000'], [0, 57, '12500']]
  rows.forEach(([min, max, amount], i) => { base[`a_min_${i}`] = String(min); base[`a_max_${i}`] = String(max); base[`a_amount_${i}`] = String(amount) })
  const ok = templateFromForm((k) => base[k] ?? null)
  assert.ok(!('error' in ok))
  if (!('error' in ok)) assert.deepEqual(ok.allowance[0], { min: 90, max: 90, amount: 50000 })
  assert.match(String((templateFromForm((k) => ({ ...base, a_min_1: '60' })[k] ?? null) as { error: string }).error), /58点/)
  assert.ok('error' in templateFromForm((k) => ({ ...base, item_3: ' ' })[k] ?? null))
  assert.ok('error' in templateFromForm((k) => ({ ...base, deadline_day: '31' })[k] ?? null))
  assert.match(String(allowanceProblem([{ min: 0, max: 90, amount: 1 }, { min: 90, max: 90, amount: 2 }])), /複数/)
  assert.equal(markOf(3), '◎')
  assert.equal(markOf(null), '－')
  assert.equal(sum([3, 2, null]), 5)
})

test('repair requests: status and 社長 decision form', async () => {
  const { repairStatus, decisionFromForm, destinationLabel } = await import('./repair.ts')
  const base = { withdrawn_at: null, president_stamped_at: null, completed_on: null, method: null, vendor: null }
  assert.equal(repairStatus(base), 'submitted')
  assert.equal(repairStatus({ ...base, president_stamped_at: 'x' }), 'scheduled')
  assert.equal(repairStatus({ ...base, president_stamped_at: 'x', completed_on: '2026-10-06' }), 'done')
  assert.equal(repairStatus({ ...base, withdrawn_at: 'x' }), 'withdrawn')
  assert.equal(destinationLabel({ method: 'outsource', vendor: '日野自動車' }), '外注（日野自動車）')
  const f = (v: Record<string, string>) => (k: string) => v[k] ?? null
  assert.deepEqual(decisionFromForm(f({ method: 'outsource', vendor: 'other', vendor_other: ' 佐藤自動車 ', entry_on: '2026-10-06' })),
    { method: 'outsource', vendor: '佐藤自動車', requestedOn: null, entryOn: '2026-10-06', note: '' })
  assert.ok('error' in decisionFromForm(f({ method: 'outsource', vendor: 'other', entry_on: '2026-10-06' })))
  assert.ok('error' in decisionFromForm(f({ method: 'in_house' })))
  assert.equal((decisionFromForm(f({ method: 'in_house', vendor: '日野自動車', entry_on: '2026-10-06' })) as { vendor: null }).vendor, null)
})

test('leave helpers', async () => {
  const { period, categoryLabel, limitFrom, daysBetween } = await import('./leave.ts')
  assert.equal(period({ start_on: '2026-10-13', end_on: '2026-10-14' }), '10/13〜10/14')
  assert.equal(period({ start_on: '2026-10-13', end_on: '2026-10-13' }), '10/13')
  assert.equal(categoryLabel({ category: 'hospital', detail: '歯医者' }), '通院（歯医者）')
  assert.equal(limitFrom(''), null)
  assert.equal(limitFrom('3'), 3)
  assert.ok(typeof limitFrom('-1') === 'object')
  assert.deepEqual(daysBetween('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
})
