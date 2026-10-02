// 修理申請 helpers (mirrors repair_requests / the iOS Repair.swift).

export const VENDORS = ['東名自動車', '日野自動車'] as const

export type RepairRow = {
  withdrawn_at: string | null
  president_stamped_at: string | null
  completed_on: string | null
  method: string | null
  vendor: string | null
}

export type RepairStatus = 'submitted' | 'scheduled' | 'done' | 'withdrawn'

export function repairStatus(r: RepairRow): RepairStatus {
  if (r.withdrawn_at) return 'withdrawn'
  if (r.completed_on) return 'done'
  if (r.president_stamped_at) return 'scheduled'
  return 'submitted'
}

export const STATUS_LABEL: Record<RepairStatus, string> = {
  submitted: '社長の確認待ち',
  scheduled: '予定決定・修理待ち',
  done: '修理完了',
  withdrawn: '取り下げ',
}

export function destinationLabel(r: Pick<RepairRow, 'method' | 'vendor'>): string {
  if (r.method === 'in_house') return '自社整備'
  if (r.method === 'outsource') return r.vendor ? `外注（${r.vendor}）` : '外注'
  return ''
}

/** The 社長's decision form → RPC params, or a Japanese error. */
export function decisionFromForm(get: (key: string) => string | null):
  | { method: 'in_house' | 'outsource'; vendor: string | null; requestedOn: string | null; entryOn: string; note: string }
  | { error: string } {
  const method = get('method')
  if (method !== 'in_house' && method !== 'outsource') return { error: '自社整備か外注かを選んでください。' }
  const choice = (get('vendor') ?? '').trim()
  const other = (get('vendor_other') ?? '').trim()
  const vendor = method === 'outsource' ? (choice === 'other' ? other : choice) : null
  if (method === 'outsource' && !vendor) return { error: '依頼先を選ぶか入力してください。' }
  const entryOn = (get('entry_on') ?? '').trim()
  if (!entryOn) return { error: '入庫予定日を入力してください。' }
  return { method, vendor, requestedOn: (get('requested_on') ?? '').trim() || null, entryOn, note: (get('note') ?? '').trim() }
}
