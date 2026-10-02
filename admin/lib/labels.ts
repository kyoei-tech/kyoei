// Japanese labels for audit log entries.

export const CATEGORY_LABELS: Record<string, string> = {
  accounts: 'アカウント',
  customers: 'POS番号一覧',
  customer_search: '顧客検索',
  vehicles: '車両',
  inspection: '点検簿',
  red_plates: '赤枠管理',
  award: '社長賞',
  self_review: '自己評価シート',
  repairs: '修理申請',
  leave: '休暇申請',
  health: '健康診断',
  employees: '社員管理',
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
  request_disclosure: '投票者の開示を申請',
  approve_disclosure: '投票者の開示を承認',
  reject_disclosure: '投票者の開示を却下',
  view_disclosure: '開示済みの投票者を閲覧',
  president_score: '社長採点を保存',
  excuse_inspection: '未点検でも計算対象に戻す',
  unexcuse_inspection: '計算対象から外す',
  update_review_template: 'シートの項目・手当表を変更',
  president_decide_repair: '修理の予定を決定（社長印）',
  maintenance_complete_repair: '修理を記録（担当印）',
  create_content: '追加',
  create_vehicle_schedule: '点検・車検の予約を追加',
  update_vehicle_schedule: '点検・車検の予約を変更',
  delete_vehicle_schedule: '点検・車検の予約を削除',
  complete_vehicle_schedule: '点検・車検を完了',
  reopen_vehicle_schedule: '点検・車検の完了を取り消し',
  create_health_check: '健康診断の予約を追加',
  update_health_check: '健康診断の予約を変更',
  delete_health_check: '健康診断の予約を削除',
  complete_health_check: '健康診断を受診済みに',
  reopen_health_check: '健康診断の受診済みを取り消し',
  set_health_per_year: '健康診断の回数を変更',
  delete_trip: '運行履歴を削除',
  delete_all_trips: '運行履歴をすべて削除',
  update_content: '変更',
  delete_content: '削除',
  update_leave_settings: '休暇の締切・上限を変更',
  set_leave_day_limit: '休暇の日付別上限を設定',
  delete_leave_day_limit: '休暇の日付別上限を解除',
  add_paid_grant: '有給を付与（手入力）',
  add_paid_use: '有給の取得を記録（アプリ外）',
  delete_paid_grant: '有給の付与を削除',
  delete_paid_use: '有給の取得記録を削除',
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action
}

const ROLE = { is_driver: 'ドライバー', can_search_customers: '顧客検索', is_admin: '管理者', can_check_leave: '休暇の担当者' } as const

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
