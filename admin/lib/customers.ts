// Display shape for POS番号一覧: a member with their member numbers grouped by venue.

export type CustomerRecord = {
  id: string
  name: string
  kana: string
  updated_at: string
  customer_numbers: { id: string; venue: string; member_number: string }[]
}

export type VenueNumbers = { venue: string; numbers: { id: string; number: string }[] }

export function groupByVenue(numbers: CustomerRecord['customer_numbers']): VenueNumbers[] {
  const order: string[] = []
  const map = new Map<string, { id: string; number: string }[]>()
  for (const n of [...numbers].sort((a, b) => a.venue.localeCompare(b.venue, 'ja') || a.member_number.localeCompare(b.member_number, 'ja', { numeric: true }))) {
    if (!map.has(n.venue)) {
      map.set(n.venue, [])
      order.push(n.venue)
    }
    map.get(n.venue)!.push({ id: n.id, number: n.member_number })
  }
  return order.map((venue) => ({ venue, numbers: map.get(venue)! }))
}

/** Case/width-insensitive match on 会員名・よみ・会場名・会員番号. */
export function matchesQuery(c: CustomerRecord, query: string): boolean {
  const q = query.normalize('NFKC').trim().toLowerCase()
  if (!q) return true
  const hay = [c.name, c.kana, ...c.customer_numbers.flatMap((n) => [n.venue, n.member_number])]
    .join(' ')
    .normalize('NFKC')
    .toLowerCase()
  return q.split(/\s+/).every((part) => hay.includes(part))
}
