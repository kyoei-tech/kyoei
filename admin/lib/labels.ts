// Japanese labels for audit log entries.

export const CATEGORY_LABELS: Record<string, string> = {
  accounts: 'アカウント',
  customers: 'POS番号一覧',
  customer_search: '顧客検索',
  vehicles: '車両',
  inspection: '点検簿',
  red_plates: '赤枠管理',
  content: 'アプリ内編集',
}

const ACTION_LABELS: Record<string, string> = {
  create: '作成',
  invite: '招待コードを発行',
  reset_code: '再設定コードを発行',
  update: '権限・名前を変更',
  disable: '停止',
  enable: '再開',
  import: 'CSV で取り込み',
  export: 'CSV で書き出し',
  delete_number: '会員番号を削除',
  delete_customer: '会員を削除',
  search: 'アプリで検索',
  create_vehicle: '車両を登録',
  update_vehicle: '車両を変更',
  delete_vehicle: '車両を削除',
  create_inspection_item: '点検項目を追加',
  update_inspection_item: '点検項目を変更',
  delete_inspection_item: '点検項目を削除',
  return_red_plate: '赤枠を返却処理',
  create_red_plate: '赤枠を追加',
  update_red_plate: '赤枠を変更',
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action
}

const ROLE = { is_driver: 'ドライバー', can_search_customers: '顧客検索', is_admin: '管理者' } as const

/** One-line Japanese summary of an entry's detail. */
export function detailSummary(action: string, detail: Record<string, unknown>): string {
  if (action === 'import') return `追加：会員 ${detail.newCustomers ?? 0} ・ 会員番号 ${detail.newNumbers ?? 0}（エラー ${detail.errors ?? 0}）`
  if (action === 'export') return `${detail.rows ?? 0} 行`
  if (action === 'invite' || action === 'reset_code') return detail.expiresAt ? `期限 ${new Date(String(detail.expiresAt)).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })}` : ''
  if (action === 'update') {
    const before = (detail.before ?? {}) as Record<string, boolean>
    const after = (detail.after ?? {}) as Record<string, unknown>
    const changes = (Object.keys(ROLE) as (keyof typeof ROLE)[])
      .filter((k) => before[k] !== after[k])
      .map((k) => `${ROLE[k]}：${before[k] ? 'あり' : 'なし'} → ${after[k] ? 'あり' : 'なし'}`)
    if (after.staffName !== undefined) changes.push(`名前：${after.staffName ?? '（なし）'}`)
    return changes.join(' ・ ')
  }
  if (action === 'create') {
    const roles = (Object.keys(ROLE) as (keyof typeof ROLE)[]).filter((k) => detail[k]).map((k) => ROLE[k])
    return [roles.join('・'), detail.staffName ? `名前：${detail.staffName}` : ''].filter(Boolean).join(' ・ ')
  }
  if (action === 'search') return `「${detail.query ?? ''}」（${detail.results ?? 0}件）`
  return ''
}
