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
const HEADER_LABELS = [
    '回戦',
    '請求先',
    '積地',
    '降地',
    'ｵｰｸｼｮﾝ',
    '品名',
    '車体番号',
    '積日',
    '摘要１',
    '出荷地',
    '納入地',
];
const HEADER_FIELD_LABELS = ['配車日', '号車', '乗務員', '配車番号'];
const PHONE_PATTERN = /0\d{1,4}-\d{1,4}-\d{3,4}/;
const ROW_CLUSTER_GAP = 7;
const LINE_CLUSTER_GAP = 3;
const WORD_GAP_THRESHOLD = 3;
async function loadPdfJs() {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    return pdfjs;
}
async function extractPages(file) {
    const pdfjs = await loadPdfJs();
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const items = [];
        for (const raw of content.items) {
            const item = raw;
            if (item.str.trim().length === 0)
                continue;
            items.push({
                str: item.str,
                x: item.transform[4],
                y: item.transform[5],
                w: item.width,
                h: item.height,
            });
        }
        pages.push(items);
    }
    return pages;
}
// Groups items whose positions differ by no more than `maxGap` into
// clusters, using 1D agglomerative clustering along the y axis (rows) or
// x axis (words on a line).
function clusterByCoordinate(items, coordinate, maxGap) {
    const sorted = [...items].sort((a, b) => coordinate(b) - coordinate(a));
    const clusters = [];
    let current = [];
    let previousCoordinate = null;
    for (const item of sorted) {
        const coord = coordinate(item);
        if (previousCoordinate !== null && previousCoordinate - coord > maxGap) {
            clusters.push(current);
            current = [];
        }
        current.push(item);
        previousCoordinate = coord;
    }
    if (current.length > 0)
        clusters.push(current);
    return clusters;
}
// Finds the printed column-header row and returns a label -> item map for
// it. Header labels that visually sit on the same row can still land on
// slightly different y values from pdfjs (sub-pixel baseline differences
// between glyph runs, often under 1pt), so header candidates are grouped
// with the same y-tolerance clustering used for data rows rather than by
// exact y equality — exact equality silently splits one header row into
// several tiny buckets and starves buildColumnRanges of the labels it needs.
function findHeaderRow(items) {
    const candidates = items.filter((item) => HEADER_LABELS.includes(item.str));
    const clusters = clusterByCoordinate(candidates, (item) => item.y, ROW_CLUSTER_GAP);
    let best = null;
    for (const cluster of clusters) {
        if (!best || cluster.length > best.length)
            best = cluster;
    }
    const result = new Map();
    if (!best)
        return result;
    for (const item of best) {
        if (!result.has(item.str))
            result.set(item.str, item);
    }
    return result;
}
// Joins items that make up a single field value. Items on the same visual
// line are joined with a space only where the gap between them looks like
// a real word boundary; separate lines (the field wrapped because the
// printed column was too narrow) are always joined with nothing, so a
// chassis number or vehicle name that wrapped mid-token comes back as one
// unbroken string.
function joinColumnItems(items) {
    const lines = clusterByCoordinate(items, (item) => item.y, LINE_CLUSTER_GAP);
    const lineStrings = lines.map((lineItems) => {
        const sorted = [...lineItems].sort((a, b) => a.x - b.x);
        let text = '';
        let previous = null;
        for (const item of sorted) {
            if (previous) {
                const gap = item.x - (previous.x + previous.w);
                if (gap > WORD_GAP_THRESHOLD)
                    text += ' ';
            }
            text += item.str;
            previous = item;
        }
        return text;
    });
    return lineStrings.join('').trim();
}
function buildColumnRanges(header) {
    const round = header.get('回戦');
    const billTo = header.get('請求先');
    const pickup = header.get('積地');
    const dropoff = header.get('降地');
    const auction = header.get('ｵｰｸｼｮﾝ');
    const vehicleName = header.get('品名');
    const chassisNumber = header.get('車体番号');
    const pickupDate = header.get('積日');
    const notes = header.get('摘要１');
    const shipOrigin = header.get('出荷地');
    if (!round ||
        !billTo ||
        !pickup ||
        !dropoff ||
        !auction ||
        !vehicleName ||
        !chassisNumber ||
        !pickupDate ||
        !notes ||
        !shipOrigin) {
        return null;
    }
    return {
        round: [round.x - 15, round.x + 20],
        // Pickup/dropoff text almost touches at the print scale used here (a
        // couple points of gap at most), so the boundary between them has to
        // sit close to the dropoff header itself rather than partway back
        // toward the pickup header, or dropoff's first word gets misread as
        // part of pickup.
        pickup: [pickup.x - 25, dropoff.x - 20],
        dropoff: [dropoff.x - 20, auction.x - 15],
        auction: [auction.x - 15, vehicleName.x - 25],
        vehicleName: [vehicleName.x - 25, chassisNumber.x - 8],
        chassisNumber: [chassisNumber.x - 8, pickupDate.x - 5],
        notes: [510, shipOrigin.x - 10],
    };
}
function inRange(x, [min, max]) {
    return x >= min && x < max;
}
function parseVehicleRows(items, headerY, ranges) {
    const dataItems = items.filter((item) => item.y < headerY);
    const rowClusters = clusterByCoordinate(dataItems, (item) => item.y, ROW_CLUSTER_GAP);
    const vehicles = [];
    for (const rowItems of rowClusters) {
        const byColumn = {
            round: [],
            pickup: [],
            dropoff: [],
            auction: [],
            vehicleName: [],
            chassisNumber: [],
            notes: [],
        };
        for (const item of rowItems) {
            if (inRange(item.x, ranges.round))
                byColumn.round.push(item);
            else if (inRange(item.x, ranges.pickup))
                byColumn.pickup.push(item);
            else if (inRange(item.x, ranges.dropoff))
                byColumn.dropoff.push(item);
            else if (inRange(item.x, ranges.auction))
                byColumn.auction.push(item);
            else if (inRange(item.x, ranges.vehicleName))
                byColumn.vehicleName.push(item);
            else if (inRange(item.x, ranges.chassisNumber))
                byColumn.chassisNumber.push(item);
            else if (inRange(item.x, ranges.notes))
                byColumn.notes.push(item);
        }
        const round = joinColumnItems(byColumn.round);
        // Normally the auction column holds a lot number that's unused here,
        // and 品名 alone is the vehicle name. But when there's no lot number,
        // the plate+model run described above lands entirely in the auction
        // column and 品名 is empty — fall back to it in that case so the
        // vehicle name isn't lost.
        const vehicleName = joinColumnItems(byColumn.vehicleName) ||
            joinColumnItems(byColumn.auction);
        const chassisNumber = joinColumnItems(byColumn.chassisNumber);
        // A row identifies an actual vehicle only if it has a name or a chassis
        // number. Some sheets print a standalone scheduling note between two
        // vehicle blocks (e.g. "○○海運 9/14予約OK") that still lands inside a
        // round's row band and gets a round number, but it isn't a vehicle.
        if (!vehicleName && !chassisNumber)
            continue;
        const notes = joinColumnItems(byColumn.notes);
        const phoneMatch = notes.match(PHONE_PATTERN);
        vehicles.push({
            round: round || '不明',
            vehicleName,
            chassisNumber,
            pickup: joinColumnItems(byColumn.pickup),
            dropoff: joinColumnItems(byColumn.dropoff),
            notes,
            phone: phoneMatch ? phoneMatch[0] : null,
        });
    }
    return vehicles;
}
function findHeaderFieldValue(items, label) {
    const labelItem = items.find((item) => item.str === label);
    if (!labelItem)
        return null;
    let best = null;
    let bestGap = Infinity;
    for (const item of items) {
        if (item === labelItem)
            continue;
        if (Math.abs(item.y - labelItem.y) > 5)
            continue;
        const gap = item.x - (labelItem.x + labelItem.w);
        if (gap <= 0 || gap > 60)
            continue;
        if (gap < bestGap) {
            bestGap = gap;
            best = item;
        }
    }
    return best?.str.trim() || null;
}
// Pure — takes already-extracted per-page text items and turns them into
// a parsed dispatch sheet. Split out from parseDispatchSheetPdf so the
// column/row logic above can be exercised in tests without pdfjs-dist or
// a real PDF file.
export function parseExtractedPages(pages) {
    let dispatchDate = null;
    let vehicleNumber = null;
    let driverName = null;
    let dispatchNumber = null;
    const allVehicles = [];
    for (const items of pages) {
        const header = findHeaderRow(items);
        const headerValues = [...header.values()];
        if (headerValues.length > 0) {
            const ranges = buildColumnRanges(header);
            if (ranges) {
                // Use the lowest y among the matched header items, not just one of
                // them, so every header item (which can span a fraction of a point
                // in y — see findHeaderRow) is excluded from the data rows below it.
                const headerY = Math.min(...headerValues.map((item) => item.y));
                allVehicles.push(...parseVehicleRows(items, headerY, ranges));
            }
        }
        dispatchDate ?? (dispatchDate = findHeaderFieldValue(items, '配車日'));
        vehicleNumber ?? (vehicleNumber = findHeaderFieldValue(items, '号車'));
        driverName ?? (driverName = findHeaderFieldValue(items, '乗務員'));
        dispatchNumber ?? (dispatchNumber = findHeaderFieldValue(items, '配車番号'));
    }
    const roundOrder = [];
    const byRound = new Map();
    for (const vehicle of allVehicles) {
        if (!byRound.has(vehicle.round)) {
            byRound.set(vehicle.round, []);
            roundOrder.push(vehicle.round);
        }
        byRound.get(vehicle.round).push(vehicle);
    }
    return {
        dispatchDate,
        vehicleNumber,
        driverName,
        dispatchNumber,
        rounds: roundOrder.map((round) => ({ round, vehicles: byRound.get(round) })),
        vehicleCount: allVehicles.length,
    };
}
export async function parseDispatchSheetPdf(file) {
    const pages = await extractPages(file);
    return parseExtractedPages(pages);
}
