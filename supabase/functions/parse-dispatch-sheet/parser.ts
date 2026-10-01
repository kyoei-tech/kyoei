// Rule-based (no AI) parser for the 共栄車輌サービス 運行指示書兼運転日報
// (dispatch sheet) PDF template. Port of lib/dispatch-sheet-parser.ts (the
// web app's in-browser parser) with these additions:
//   - the 出荷地 / 納入地 / 緊締 columns are read;
//   - every value is NFKC-normalized (ﾌﾘｰﾄﾞ → フリード, ０９ → 09);
//   - a wrapped value whose break falls between two Latin words keeps the
//     space (JAPAN FORWARDING), while Japanese and chassis numbers still
//     join with nothing;
//   - 積日/卸日 are split into date + 条件, 積地/降地 into place + 管理番号;
//   - 摘要１ yields phone numbers and caution keywords;
//   - each vehicle and the sheet carry validation warnings, so the app can
//     point the driver at the original for anything suspicious.
//
// It reads each text item's exact position on the page (pdf.js text layer,
// never an image), locates the printed column headers, buckets items into
// columns by x relative to those headers, and forms rows by clustering on y.
// The offsets are tuned from the real form, not guessed. It never counts or
// hardcodes vehicles/rounds — those always come from the rows present.
//
// Pure: no pdf.js here (see extract.ts), so it runs under node --test.

export const PARSER_VERSION = 2

export type TextItem = { str: string; x: number; y: number; w: number; h: number }

export type DispatchSheetVehicle = {
  round: string
  vehicleName: string
  /** ｵｰｸｼｮﾝ: auction lot number or registration plate ("練馬3266"); empty when none. */
  auctionInfo: string
  chassisNumber: string
  billTo: string
  pickup: string
  dropoff: string
  /** Kept for the web app (to be retired): "08/25 以降". */
  pickupDateDetail: string
  dropoffDateDetail: string
  notes: string
  /** First phone number in 摘要１ (web app compatibility). */
  phone: string | null
  // ---- parser v2
  /** 管理番号 printed after the place, e.g. "【搬出】(5330)". */
  pickupRef: string
  dropoffRef: string
  /** "MM/DD" or null. */
  pickupDate: string | null
  pickupCondition: string
  dropoffDate: string | null
  dropoffCondition: string
  phones: string[]
  /** Caution keywords found in 摘要１ ("早急", "ナンバーカット", …). */
  alerts: string[]
  shipFrom: string
  deliverTo: string
  lashing: string
  warnings: string[]
}

export type DispatchSheetRound = { round: string; vehicles: DispatchSheetVehicle[] }

export type ParsedDispatchSheet = {
  parserVersion: number
  dispatchDate: string | null
  vehicleNumber: string | null
  driverName: string | null
  dispatchNumber: string | null
  rounds: DispatchSheetRound[]
  vehicleCount: number
  warnings: string[]
}

// Header labels are matched on the raw (un-normalized) PDF text.
const HEADER_LABELS = [
  '回戦', '請求先', '積地', '降地', 'ｵｰｸｼｮﾝ', '品名', '車体番号', '積日', '卸日', '摘要１', '出荷地', '納入地', '緊締',
] as const

const HEADER_FIELD_LABELS = ['配車日', '号車', '乗務員', '配車番号'] as const
type HeaderFieldLabel = (typeof HEADER_FIELD_LABELS)[number]

const PHONE_PATTERN = /0\d{1,4}-\d{1,4}-\d{3,4}/g
const ROW_CLUSTER_GAP = 7
const LINE_CLUSTER_GAP = 3
const WORD_GAP_THRESHOLD = 3
// Rows are ~26pt apart; a cell holds at most 3 lines (~27pt from its top).
const ROW_TOP_TOLERANCE = 5
const ROW_MAX_HEIGHT = 40
// See splitNameArea. Applied after NFKC, so digits are ASCII.
const NAME_AREA_PREFIX = /^([一-鿿]{1,4}\d{1,4}|\d{1,8})[\s　]*/
// "JU神奈川 【搬出】(5330)" / "JU神奈川(92575)" → place + ref.
const PLACE_REF = /^(.*?)[\s　]*((?:【[^】]*】)?[\s　]*(?:\(\d+\))?)$/
const DATE_DETAIL = /^(\d{1,2}\/\d{1,2})?[\s　]*(.*)$/
// Japanese chassis numbers (GP3-1022135, VZNY12-103585) or a 17-character VIN.
const CHASSIS_FORMAT = /^(?:[A-Z0-9]{2,8}-\d{3,8}|[A-HJ-NPR-Z0-9]{17})$/

/** Caution keywords, matched on normalized 摘要１ text; label is what the app shows. */
const ALERT_KEYWORDS: { label: string; pattern: RegExp }[] = [
  { label: '早急', pattern: /早急|至急|急ぎ/ },
  { label: '期限内搬出', pattern: /期限内/ },
  { label: 'ナンバーカット', pattern: /ナンバー(?:あれば)?カット/ },
  { label: '時間指定', pattern: /AM着|PM着|午前着|午後着|時着|時まで|時迄/ },
  { label: '予約', pattern: /予約/ },
]

export function normalizeText(s: string): string {
  return s.normalize('NFKC').replace(/[\s　]+/g, ' ').trim()
}

/** Uppercase, ASCII, unified hyphen, no spaces: the form chassis numbers are compared in. */
export function normalizeChassis(s: string): string {
  return s
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[‐‑‒–—―−ーｰ－]/g, '-')
    .replace(/[\s　]/g, '')
}

function clusterByCoordinate(items: TextItem[], coordinate: (item: TextItem) => number, maxGap: number): TextItem[][] {
  const sorted = [...items].sort((a, b) => coordinate(b) - coordinate(a))
  const clusters: TextItem[][] = []
  let current: TextItem[] = []
  let previous: number | null = null
  for (const item of sorted) {
    const coord = coordinate(item)
    if (previous !== null && previous - coord > maxGap) {
      clusters.push(current)
      current = []
    }
    current.push(item)
    previous = coord
  }
  if (current.length > 0) clusters.push(current)
  return clusters
}

// Header labels on one visual row can differ by sub-point y values, so they
// are grouped with the same tolerance as data rows, not by exact y.
function findHeaderRow(items: TextItem[]): Map<string, TextItem> {
  const candidates = items.filter((item) => (HEADER_LABELS as readonly string[]).includes(item.str))
  let best: TextItem[] | null = null
  for (const cluster of clusterByCoordinate(candidates, (item) => item.y, ROW_CLUSTER_GAP)) {
    if (!best || cluster.length > best.length) best = cluster
  }
  const result = new Map<string, TextItem>()
  for (const item of best ?? []) if (!result.has(item.str)) result.set(item.str, item)
  return result
}

const LATIN_END = /[A-Za-z]$/
const LATIN_START = /^[A-Za-z]/

// Same-line items are joined with a space only at a real word gap. Wrapped
// lines join with nothing (so "GS4-" + "1007369" and "殿場" + "サテライト"
// stay one token), except between two Latin words ("JAPAN" + "FORWARDING").
function joinLines(items: TextItem[]): string[] {
  return clusterByCoordinate(items, (item) => item.y, LINE_CLUSTER_GAP).map((line) => {
    const sorted = [...line].sort((a, b) => a.x - b.x)
    let text = ''
    let previous: TextItem | null = null
    for (const item of sorted) {
      if (previous && item.x - (previous.x + previous.w) > WORD_GAP_THRESHOLD) text += ' '
      text += item.str
      previous = item
    }
    return normalizeText(text)
  })
}

function joinColumnItems(items: TextItem[], options: { latinSpace?: boolean } = {}): string {
  let result = ''
  for (const line of joinLines(items)) {
    if (!line) continue
    const space = options.latinSpace && LATIN_END.test(result) && LATIN_START.test(line)
    result += (space ? ' ' : '') + line
  }
  return result.trim()
}

// ｵｰｸｼｮﾝ + 品名 are read as one area: 品名 is right-aligned, so a long name
// with no auction lot starts under the ｵｰｸｼｮﾝ header. Only the first line can
// hold a prefix (plate or lot number); wrapped lines are name continuation.
function splitNameArea(items: TextItem[]): { auctionInfo: string; vehicleName: string } {
  const lines = clusterByCoordinate(items, (item) => item.y, LINE_CLUSTER_GAP)
  if (lines.length === 0) return { auctionInfo: '', vehicleName: '' }
  const [firstLine, ...wrapped] = lines
  const first = joinColumnItems(firstLine)
  const match = first.match(NAME_AREA_PREFIX)
  const name = (match ? first.slice(match[0].length) : first) + joinColumnItems(wrapped.flat(), { latinSpace: true })
  return { auctionInfo: match ? match[1] : '', vehicleName: name.trim() }
}

type Column =
  | 'round' | 'billTo' | 'pickup' | 'dropoff' | 'nameArea' | 'chassisNumber'
  | 'pickupDateDetail' | 'dropoffDateDetail' | 'notes' | 'shipFrom' | 'deliverTo' | 'lashing'
type ColumnRanges = Record<Column, [number, number]>
const COLUMNS: Column[] = [
  'round', 'billTo', 'pickup', 'dropoff', 'nameArea', 'chassisNumber',
  'pickupDateDetail', 'dropoffDateDetail', 'notes', 'shipFrom', 'deliverTo', 'lashing',
]

function buildColumnRanges(header: Map<string, TextItem>): ColumnRanges | null {
  const h = (label: (typeof HEADER_LABELS)[number]) => header.get(label)
  const [round, billTo, pickup, dropoff, auction, name, chassis, pickupDate, dropoffDate, notes, shipFrom, deliverTo, lashing] =
    HEADER_LABELS.map(h)
  if (!round || !billTo || !pickup || !dropoff || !auction || !name || !chassis || !pickupDate || !dropoffDate || !notes || !shipFrom) {
    return null
  }
  // Older sheets without 納入地/緊締 headers: everything right of 出荷地 is 出荷地.
  const deliverX = deliverTo?.x ?? Infinity
  const lashingX = lashing?.x ?? Infinity
  return {
    round: [round.x - 15, round.x + 20],
    // 請求先 / 積地 / 降地 data sits left of its own header, so each range is
    // anchored off the next column's header (see the web parser's notes).
    billTo: [round.x + 20, pickup.x - 25],
    pickup: [pickup.x - 25, dropoff.x - 20],
    dropoff: [dropoff.x - 20, auction.x - 15],
    nameArea: [auction.x - 15, chassis.x - 8],
    chassisNumber: [chassis.x - 8, pickupDate.x - 5],
    // Each date column also covers its printed 詳細/条件 sub-columns.
    pickupDateDetail: [pickupDate.x - 5, dropoffDate.x - 15],
    dropoffDateDetail: [dropoffDate.x - 15, 510],
    notes: [510, shipFrom.x - 10],
    // 出荷地/納入地 values start ~8pt left of their headers; 緊締 is a narrow
    // column at the right edge.
    shipFrom: [shipFrom.x - 10, deliverX - 8],
    deliverTo: [deliverX - 8, lashingX - 4],
    lashing: [lashingX - 4, Infinity],
  }
}

function splitPlace(value: string): { place: string; ref: string } {
  const match = value.match(PLACE_REF)
  if (!match || !match[2].trim()) return { place: value, ref: '' }
  return { place: match[1].trim(), ref: match[2].replace(/[\s　]+/g, '') }
}

function splitDate(value: string): { date: string | null; condition: string } {
  const match = value.match(DATE_DETAIL)!
  const date = match[1] ? match[1].split('/').map((part) => part.padStart(2, '0')).join('/') : null
  return { date, condition: match[2].trim() }
}

function isValidMonthDay(date: string): boolean {
  const [month, day] = date.split('/').map(Number)
  return month >= 1 && month <= 12 && day >= 1 && day <= 31
}

export function extractAlerts(notes: string): string[] {
  return ALERT_KEYWORDS.filter(({ pattern }) => pattern.test(notes)).map(({ label }) => label)
}

function vehicleWarnings(v: Omit<DispatchSheetVehicle, 'warnings'>): string[] {
  const warnings: string[] = []
  // A blank 車体番号 is normal (the driver records it from the real car in
  // the app), so only a printed-but-odd one is flagged.
  if (v.chassisNumber && !CHASSIS_FORMAT.test(v.chassisNumber)) warnings.push('車体番号の形式がいつもと違います')
  if (!v.vehicleName) warnings.push('品名が読み取れませんでした')
  if (v.round === '不明') warnings.push('回戦が読み取れませんでした')
  if (!v.pickup) warnings.push('積地が読み取れませんでした')
  if (!v.dropoff) warnings.push('降地が読み取れませんでした')
  for (const [label, date] of [['積日', v.pickupDate], ['卸日', v.dropoffDate]] as const) {
    if (date && !isValidMonthDay(date)) warnings.push(`${label}の日付が正しくありません`)
  }
  return warnings
}

function columnOf(item: TextItem, ranges: ColumnRanges): Column | undefined {
  return COLUMNS.find((c) => item.x >= ranges[c][0] && item.x < ranges[c][1])
}

// Splits the data area into one item group per printed row. Rows are
// anchored on the 積日/卸日 columns, which never wrap and are printed on
// each row's first line (卸日's 条件 "迄" even when the date is blank); every
// other item belongs to the nearest row starting at or just above it. Plain
// y-gap clustering is not enough: a 2-line cell's second line can sit ~9pt
// below the vertically-centered 回戦 digit, which would cut it off into a
// row of its own (losing e.g. 出荷地's second line).
function splitRows(items: TextItem[], ranges: ColumnRanges): TextItem[][] {
  const anchors = items.filter((item) => {
    const column = columnOf(item, ranges)
    return column === 'pickupDateDetail' || column === 'dropoffDateDetail'
  })
  if (anchors.length === 0) return clusterByCoordinate(items, (item) => item.y, ROW_CLUSTER_GAP)

  // Row tops, highest first. Text a few points above a row's top (a cell
  // printed in a slightly larger leading) still belongs to that row.
  const tops = clusterByCoordinate(anchors, (item) => item.y, ROW_CLUSTER_GAP).map((c) => Math.max(...c.map((i) => i.y)))
  const rows: TextItem[][] = tops.map(() => [])
  for (const item of items) {
    let index = -1
    for (let i = 0; i < tops.length && tops[i] >= item.y - ROW_TOP_TOLERANCE; i++) index = i
    if (index >= 0 && tops[index] - item.y <= ROW_MAX_HEIGHT) rows[index].push(item)
  }
  return rows
}

function parseVehicleRows(items: TextItem[], headerY: number, ranges: ColumnRanges, carriedRound: string | null): DispatchSheetVehicle[] {
  const vehicles: DispatchSheetVehicle[] = []
  let lastRound = carriedRound
  for (const row of splitRows(items.filter((item) => item.y < headerY), ranges)) {
    const byColumn = Object.fromEntries(COLUMNS.map((c) => [c, [] as TextItem[]])) as Record<Column, TextItem[]>
    for (const item of row) {
      const column = columnOf(item, ranges)
      if (column) byColumn[column].push(item)
    }

    const { auctionInfo, vehicleName } = splitNameArea(byColumn.nameArea)
    const chassisNumber = normalizeChassis(joinColumnItems(byColumn.chassisNumber))
    // Rows with neither name nor chassis number are scheduling notes printed
    // between vehicle blocks ("○○海運 9/14予約OK"), not vehicles.
    if (!vehicleName && !chassisNumber) continue

    // A round number is printed once per block on some sheets; later rows
    // (including those continuing on the next page) inherit it.
    const printedRound = joinColumnItems(byColumn.round)
    const round = printedRound || lastRound || '不明'
    lastRound = round

    const pickupRaw = joinColumnItems(byColumn.pickup, { latinSpace: true })
    const dropoffRaw = joinColumnItems(byColumn.dropoff, { latinSpace: true })
    const pickupDateDetail = joinColumnItems(byColumn.pickupDateDetail)
    const dropoffDateDetail = joinColumnItems(byColumn.dropoffDateDetail)
    const notes = joinColumnItems(byColumn.notes)
    const phones = [...notes.matchAll(PHONE_PATTERN)].map((m) => m[0])
    const pickup = splitPlace(pickupRaw)
    const dropoff = splitPlace(dropoffRaw)
    const pickupDate = splitDate(pickupDateDetail)
    const dropoffDate = splitDate(dropoffDateDetail)

    const vehicle = {
      round,
      vehicleName,
      auctionInfo,
      chassisNumber,
      billTo: joinColumnItems(byColumn.billTo),
      pickup: pickup.place,
      dropoff: dropoff.place,
      pickupDateDetail,
      dropoffDateDetail,
      notes,
      phone: phones[0] ?? null,
      pickupRef: pickup.ref,
      dropoffRef: dropoff.ref,
      pickupDate: pickupDate.date,
      pickupCondition: pickupDate.condition,
      dropoffDate: dropoffDate.date,
      dropoffCondition: dropoffDate.condition,
      phones,
      alerts: extractAlerts(notes),
      shipFrom: joinColumnItems(byColumn.shipFrom, { latinSpace: true }),
      deliverTo: joinColumnItems(byColumn.deliverTo, { latinSpace: true }),
      lashing: joinColumnItems(byColumn.lashing),
    }
    vehicles.push({ ...vehicle, warnings: vehicleWarnings(vehicle) })
  }
  return vehicles
}

function findHeaderFieldValue(items: TextItem[], label: HeaderFieldLabel): string | null {
  const labelItem = items.find((item) => item.str === label)
  if (!labelItem) return null
  let best: TextItem | null = null
  let bestGap = Infinity
  for (const item of items) {
    if (item === labelItem || Math.abs(item.y - labelItem.y) > 5) continue
    const gap = item.x - (labelItem.x + labelItem.w)
    if (gap <= 0 || gap > 60) continue
    if (gap < bestGap) {
      bestGap = gap
      best = item
    }
  }
  return best ? normalizeText(best.str) || null : null
}

export function parseExtractedPages(pages: TextItem[][]): ParsedDispatchSheet {
  let dispatchDate: string | null = null
  let vehicleNumber: string | null = null
  let driverName: string | null = null
  let dispatchNumber: string | null = null
  const all: DispatchSheetVehicle[] = []
  const warnings: string[] = []
  let headerMissing = 0

  for (const items of pages) {
    const header = findHeaderRow(items)
    const ranges = header.size > 0 ? buildColumnRanges(header) : null
    if (ranges) {
      const headerY = Math.min(...[...header.values()].map((item) => item.y))
      all.push(...parseVehicleRows(items, headerY, ranges, all.at(-1)?.round ?? null))
    } else {
      headerMissing++
    }
    dispatchDate ??= findHeaderFieldValue(items, '配車日')
    vehicleNumber ??= findHeaderFieldValue(items, '号車')
    driverName ??= findHeaderFieldValue(items, '乗務員')
    dispatchNumber ??= findHeaderFieldValue(items, '配車番号')
  }

  if (pages.length > 0 && headerMissing === pages.length) warnings.push('配車表の様式を認識できませんでした')
  else if (all.length === 0) warnings.push('車両が1台も見つかりませんでした')
  if (!dispatchDate) warnings.push('配車日が読み取れませんでした')
  const flagged = all.filter((v) => v.warnings.length > 0).length
  if (flagged > 0) warnings.push(`${flagged}台に確認が必要な項目があります`)

  const order: string[] = []
  const byRound = new Map<string, DispatchSheetVehicle[]>()
  for (const vehicle of all) {
    if (!byRound.has(vehicle.round)) {
      byRound.set(vehicle.round, [])
      order.push(vehicle.round)
    }
    byRound.get(vehicle.round)!.push(vehicle)
  }

  return {
    parserVersion: PARSER_VERSION,
    dispatchDate,
    vehicleNumber,
    driverName,
    dispatchNumber,
    rounds: order.map((round) => ({ round, vehicles: byRound.get(round)! })),
    vehicleCount: all.length,
    warnings,
  }
}
