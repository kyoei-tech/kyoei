// Rule-based (no AI) parser for the 共栄車輌サービス 運行指示書兼運転日報
// (dispatch sheet) PDF template. It reads each text item's exact position
// on the page — via pdfjs-dist's text layer, never rendering to an image —
// locates the printed column headers (回戦/品名/車体番号/積地/降地/摘要１
// etc.) on that page, and buckets every other text item into a column by
// its x position relative to those headers. Rows are then formed by
// clustering items by y position.
//
// This only works because the input is always this one paper form: column
// x-positions are stable per page, and the offsets below (e.g. "-25") are
// tuned from the real layout, not guessed. It intentionally never counts
// or hardcodes a number of vehicles/rounds — those are always derived from
// whatever rows and 回戦 values are actually present in the PDF.

export type DispatchSheetVehicle = {
  round: string
  vehicleName: string
  // The printed ｵｰｸｼｮﾝ column's own content (the auction lot number, e.g.
  // "28034"), when the sheet actually prints one. Empty for vehicles with
  // no auction lot (direct/private transfers) — see the nameArea split in
  // parseVehicleRows for why this is never confused with vehicleName
  // itself.
  auctionInfo: string
  chassisNumber: string
  // 請求先 — the billing/consignee name printed just left of 積地.
  billTo: string
  pickup: string
  dropoff: string
  // 積日 (pickup date, e.g. "08/19") plus its 条件 sub-column (e.g. "以降"),
  // joined into one string like "08/19 以降". The sheet also prints a
  // "詳細" sub-column between them, but it's consistently blank on every
  // real sheet seen so far.
  pickupDateDetail: string
  // 卸日 (dropoff date) plus its 条件 sub-column, same shape as
  // pickupDateDetail (e.g. "09/04 迄").
  dropoffDateDetail: string
  notes: string
  phone: string | null
}

export type DispatchSheetRound = {
  round: string
  vehicles: DispatchSheetVehicle[]
}

export type ParsedDispatchSheet = {
  dispatchDate: string | null
  vehicleNumber: string | null
  driverName: string | null
  dispatchNumber: string | null
  rounds: DispatchSheetRound[]
  vehicleCount: number
}

export type TextItem = { str: string; x: number; y: number; w: number; h: number }

const HEADER_LABELS = [
  '回戦',
  '請求先',
  '積地',
  '降地',
  'ｵｰｸｼｮﾝ',
  '品名',
  '車体番号',
  '積日',
  '卸日',
  '摘要１',
  '出荷地',
  '納入地',
] as const

const HEADER_FIELD_LABELS = ['配車日', '号車', '乗務員', '配車番号'] as const
type HeaderFieldLabel = (typeof HEADER_FIELD_LABELS)[number]

const PHONE_PATTERN = /0\d{1,4}-\d{1,4}-\d{3,4}/
const ROW_CLUSTER_GAP = 7
const LINE_CLUSTER_GAP = 3
const WORD_GAP_THRESHOLD = 3
// The merged ｵｰｸｼｮﾝ/品名 print area (see splitNameArea) starts with one of
// two possible prefixes before the actual vehicle name: a registration
// plate ("練馬3266", kanji region name + digits) or an auction lot number
// ("28034" or even just "0", pure digits of no fixed length — seen from
// 1 to 7 digits across real sheets). Both are matched against the *text
// content*, not by measuring gaps between pdf text items — pdfjs
// sometimes emits the whole "練馬3266 ﾉｰﾄ" run as a single text item with
// the space baked into the string, so there is no item boundary to split
// on there at all.
const NAME_AREA_PREFIX = /^([\u4E00-\u9FFF]{1,4}\d{1,4}|\d{1,8})[\s\u3000]*/

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  return pdfjs
}

async function extractPages(file: File): Promise<TextItem[][]> {
  const pdfjs = await loadPdfJs()
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buffer }).promise

  const pages: TextItem[][] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const items: TextItem[] = []
    for (const raw of content.items) {
      const item = raw as {
        str: string
        transform: number[]
        width: number
        height: number
      }
      if (item.str.trim().length === 0) continue
      items.push({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        w: item.width,
        h: item.height,
      })
    }
    pages.push(items)
  }
  return pages
}

// Groups items whose positions differ by no more than `maxGap` into
// clusters, using 1D agglomerative clustering along the y axis (rows) or
// x axis (words on a line).
function clusterByCoordinate(
  items: TextItem[],
  coordinate: (item: TextItem) => number,
  maxGap: number,
): TextItem[][] {
  const sorted = [...items].sort((a, b) => coordinate(b) - coordinate(a))
  const clusters: TextItem[][] = []
  let current: TextItem[] = []
  let previousCoordinate: number | null = null

  for (const item of sorted) {
    const coord = coordinate(item)
    if (previousCoordinate !== null && previousCoordinate - coord > maxGap) {
      clusters.push(current)
      current = []
    }
    current.push(item)
    previousCoordinate = coord
  }
  if (current.length > 0) clusters.push(current)
  return clusters
}

// Finds the printed column-header row and returns a label -> item map for
// it. Header labels that visually sit on the same row can still land on
// slightly different y values from pdfjs (sub-pixel baseline differences
// between glyph runs, often under 1pt), so header candidates are grouped
// with the same y-tolerance clustering used for data rows rather than by
// exact y equality — exact equality silently splits one header row into
// several tiny buckets and starves buildColumnRanges of the labels it needs.
function findHeaderRow(items: TextItem[]): Map<string, TextItem> {
  const candidates = items.filter((item) =>
    (HEADER_LABELS as readonly string[]).includes(item.str),
  )
  const clusters = clusterByCoordinate(
    candidates,
    (item) => item.y,
    ROW_CLUSTER_GAP,
  )

  let best: TextItem[] | null = null
  for (const cluster of clusters) {
    if (!best || cluster.length > best.length) best = cluster
  }

  const result = new Map<string, TextItem>()
  if (!best) return result
  for (const item of best) {
    if (!result.has(item.str)) result.set(item.str, item)
  }
  return result
}

// Joins items that make up a single field value. Items on the same visual
// line are joined with a space only where the gap between them looks like
// a real word boundary; separate lines (the field wrapped because the
// printed column was too narrow) are always joined with nothing, so a
// chassis number or vehicle name that wrapped mid-token comes back as one
// unbroken string.
function joinColumnItems(items: TextItem[]): string {
  const lines = clusterByCoordinate(items, (item) => item.y, LINE_CLUSTER_GAP)
  const lineStrings = lines.map((lineItems) => {
    const sorted = [...lineItems].sort((a, b) => a.x - b.x)
    let text = ''
    let previous: TextItem | null = null
    for (const item of sorted) {
      if (previous) {
        const gap = item.x - (previous.x + previous.w)
        if (gap > WORD_GAP_THRESHOLD) text += ' '
      }
      text += item.str
      previous = item
    }
    return text
  })
  return lineStrings.join('').trim()
}

// Splits the merged ｵｰｸｼｮﾝ (auction lot) + 品名 (vehicle name) print area
// into its two fields. The two columns are handled together, rather than
// by their printed header x-positions, because 品名 is right-aligned to
// end just before 車体番号: when there's no auction lot (a direct/private
// transfer), the vehicle name text alone is long enough to start under
// where the ｵｰｸｼｮﾝ header sits, and a fixed per-column x boundary would
// wrongly read it as "品名 empty, ｵｰｸｼｮﾝ = registration + model name".
// Only the first line can ever hold a prefix — any further line below it
// (a long vehicle name wrapping) is pure name continuation, never auction
// content — so only that line is checked against NAME_AREA_PREFIX;
// whatever remains after stripping a matched prefix, plus any wrapped
// lines, is the vehicle name.
function splitNameArea(items: TextItem[]): {
  auctionInfo: string
  vehicleName: string
} {
  const lines = clusterByCoordinate(items, (item) => item.y, LINE_CLUSTER_GAP)
  if (lines.length === 0) return { auctionInfo: '', vehicleName: '' }

  const [firstLine, ...wrappedLines] = lines
  const firstLineText = joinColumnItems(firstLine)
  const wrappedText = joinColumnItems(wrappedLines.flat())

  const match = firstLineText.match(NAME_AREA_PREFIX)
  const auctionInfo = match ? match[1] : ''
  const nameFirstLine = match ? firstLineText.slice(match[0].length) : firstLineText

  return { auctionInfo, vehicleName: (nameFirstLine + wrappedText).trim() }
}

type ColumnRanges = {
  round: [number, number]
  billTo: [number, number]
  pickup: [number, number]
  dropoff: [number, number]
  // The merged ｵｰｸｼｮﾝ + 品名 print area — see splitNameArea for why these
  // two printed columns have to be read together rather than as separate
  // fixed x-ranges.
  nameArea: [number, number]
  chassisNumber: [number, number]
  pickupDateDetail: [number, number]
  dropoffDateDetail: [number, number]
  notes: [number, number]
}

function buildColumnRanges(header: Map<string, TextItem>): ColumnRanges | null {
  const round = header.get('回戦')
  const billTo = header.get('請求先')
  const pickup = header.get('積地')
  const dropoff = header.get('降地')
  const auction = header.get('ｵｰｸｼｮﾝ')
  const vehicleName = header.get('品名')
  const chassisNumber = header.get('車体番号')
  const pickupDate = header.get('積日')
  const dropoffDate = header.get('卸日')
  const notes = header.get('摘要１')
  const shipOrigin = header.get('出荷地')
  if (
    !round ||
    !billTo ||
    !pickup ||
    !dropoff ||
    !auction ||
    !vehicleName ||
    !chassisNumber ||
    !pickupDate ||
    !dropoffDate ||
    !notes ||
    !shipOrigin
  ) {
    return null
  }

  return {
    round: [round.x - 15, round.x + 20],
    // 請求先's data sits left of where its own header is printed (same
    // layout quirk as pickup/dropoff below), so its range is anchored off
    // the *next* column's header (積地) rather than its own.
    billTo: [round.x + 20, pickup.x - 25],
    // Pickup/dropoff text almost touches at the print scale used here (a
    // couple points of gap at most), so the boundary between them has to
    // sit close to the dropoff header itself rather than partway back
    // toward the pickup header, or dropoff's first word gets misread as
    // part of pickup.
    pickup: [pickup.x - 25, dropoff.x - 20],
    dropoff: [dropoff.x - 20, auction.x - 15],
    nameArea: [auction.x - 15, chassisNumber.x - 8],
    chassisNumber: [chassisNumber.x - 8, pickupDate.x - 5],
    // Each date column also covers its own printed 詳細/条件 sub-columns
    // (see the DispatchSheetVehicle comments) — 卸日's sub-columns extend
    // up to just before 摘要１'s fixed left bound below.
    pickupDateDetail: [pickupDate.x - 5, dropoffDate.x - 15],
    dropoffDateDetail: [dropoffDate.x - 15, 510],
    notes: [510, shipOrigin.x - 10],
  }
}

function inRange(x: number, [min, max]: [number, number]): boolean {
  return x >= min && x < max
}

function parseVehicleRows(
  items: TextItem[],
  headerY: number,
  ranges: ColumnRanges,
): DispatchSheetVehicle[] {
  const dataItems = items.filter((item) => item.y < headerY)
  const rowClusters = clusterByCoordinate(
    dataItems,
    (item) => item.y,
    ROW_CLUSTER_GAP,
  )

  const vehicles: DispatchSheetVehicle[] = []
  for (const rowItems of rowClusters) {
    const byColumn = {
      round: [] as TextItem[],
      billTo: [] as TextItem[],
      pickup: [] as TextItem[],
      dropoff: [] as TextItem[],
      nameArea: [] as TextItem[],
      chassisNumber: [] as TextItem[],
      pickupDateDetail: [] as TextItem[],
      dropoffDateDetail: [] as TextItem[],
      notes: [] as TextItem[],
    }
    for (const item of rowItems) {
      if (inRange(item.x, ranges.round)) byColumn.round.push(item)
      else if (inRange(item.x, ranges.billTo)) byColumn.billTo.push(item)
      else if (inRange(item.x, ranges.pickup)) byColumn.pickup.push(item)
      else if (inRange(item.x, ranges.dropoff)) byColumn.dropoff.push(item)
      else if (inRange(item.x, ranges.nameArea)) byColumn.nameArea.push(item)
      else if (inRange(item.x, ranges.chassisNumber))
        byColumn.chassisNumber.push(item)
      else if (inRange(item.x, ranges.pickupDateDetail))
        byColumn.pickupDateDetail.push(item)
      else if (inRange(item.x, ranges.dropoffDateDetail))
        byColumn.dropoffDateDetail.push(item)
      else if (inRange(item.x, ranges.notes)) byColumn.notes.push(item)
    }

    const round = joinColumnItems(byColumn.round)
    const { auctionInfo, vehicleName } = splitNameArea(byColumn.nameArea)
    const chassisNumber = joinColumnItems(byColumn.chassisNumber)
    // A row identifies an actual vehicle only if it has a name or a chassis
    // number. Some sheets print a standalone scheduling note between two
    // vehicle blocks (e.g. "○○海運 9/14予約OK") that still lands inside a
    // round's row band and gets a round number, but it isn't a vehicle.
    if (!vehicleName && !chassisNumber) continue

    const notes = joinColumnItems(byColumn.notes)
    const phoneMatch = notes.match(PHONE_PATTERN)

    vehicles.push({
      round: round || '不明',
      vehicleName,
      auctionInfo,
      chassisNumber,
      billTo: joinColumnItems(byColumn.billTo),
      pickup: joinColumnItems(byColumn.pickup),
      dropoff: joinColumnItems(byColumn.dropoff),
      pickupDateDetail: joinColumnItems(byColumn.pickupDateDetail),
      dropoffDateDetail: joinColumnItems(byColumn.dropoffDateDetail),
      notes,
      phone: phoneMatch ? phoneMatch[0] : null,
    })
  }
  return vehicles
}

function findHeaderFieldValue(
  items: TextItem[],
  label: HeaderFieldLabel,
): string | null {
  const labelItem = items.find((item) => item.str === label)
  if (!labelItem) return null

  let best: TextItem | null = null
  let bestGap = Infinity
  for (const item of items) {
    if (item === labelItem) continue
    if (Math.abs(item.y - labelItem.y) > 5) continue
    const gap = item.x - (labelItem.x + labelItem.w)
    if (gap <= 0 || gap > 60) continue
    if (gap < bestGap) {
      bestGap = gap
      best = item
    }
  }
  return best?.str.trim() || null
}

// Pure — takes already-extracted per-page text items and turns them into
// a parsed dispatch sheet. Split out from parseDispatchSheetPdf so the
// column/row logic above can be exercised in tests without pdfjs-dist or
// a real PDF file.
export function parseExtractedPages(pages: TextItem[][]): ParsedDispatchSheet {
  let dispatchDate: string | null = null
  let vehicleNumber: string | null = null
  let driverName: string | null = null
  let dispatchNumber: string | null = null
  const allVehicles: DispatchSheetVehicle[] = []

  for (const items of pages) {
    const header = findHeaderRow(items)
    const headerValues = [...header.values()]
    if (headerValues.length > 0) {
      const ranges = buildColumnRanges(header)
      if (ranges) {
        // Use the lowest y among the matched header items, not just one of
        // them, so every header item (which can span a fraction of a point
        // in y — see findHeaderRow) is excluded from the data rows below it.
        const headerY = Math.min(...headerValues.map((item) => item.y))
        allVehicles.push(...parseVehicleRows(items, headerY, ranges))
      }
    }

    dispatchDate ??= findHeaderFieldValue(items, '配車日')
    vehicleNumber ??= findHeaderFieldValue(items, '号車')
    driverName ??= findHeaderFieldValue(items, '乗務員')
    dispatchNumber ??= findHeaderFieldValue(items, '配車番号')
  }

  const roundOrder: string[] = []
  const byRound = new Map<string, DispatchSheetVehicle[]>()
  for (const vehicle of allVehicles) {
    if (!byRound.has(vehicle.round)) {
      byRound.set(vehicle.round, [])
      roundOrder.push(vehicle.round)
    }
    byRound.get(vehicle.round)!.push(vehicle)
  }

  return {
    dispatchDate,
    vehicleNumber,
    driverName,
    dispatchNumber,
    rounds: roundOrder.map((round) => ({ round, vehicles: byRound.get(round)! })),
    vehicleCount: allVehicles.length,
  }
}

export async function parseDispatchSheetPdf(
  file: File,
): Promise<ParsedDispatchSheet> {
  const pages = await extractPages(file)
  return parseExtractedPages(pages)
}
