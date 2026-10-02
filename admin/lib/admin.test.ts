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
