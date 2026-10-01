#!/usr/bin/env node
// Account administration from a terminal, until the admin console exists.
// Uses the service role key: run it only on a trusted machine, never ship it.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/kyoei-accounts.mjs <command> [options]
//
// Commands
//   create  --login-id 1001 [--staff 出勤簿の名前] [--admin] [--customers] [--no-driver]
//           Creates the account and prints its one-time setup code / QR URL.
//   reset   --login-id 1001        New one-time code to set a new password.
//   adopt   --email a@b.c --login-id 1001 [--staff 名前] [--admin] [--customers]
//           Moves an existing email account (made before invitations) to a
//           login ID, keeping its user id and data, and prints a setup code.
//   disable --login-id 1001        Stops the account (sign-in refused).
//   enable  --login-id 1001
//   list
//
// Codes are valid for 72 hours and work once; issuing a new one voids the
// previous one. No mail is sent: hand the code or QR URL to the person.

import { formatToken, generateToken, hashToken, normalizeLoginID, setupURL, syntheticEmail } from '../supabase/functions/account-setup/tokens.ts'

const VALID_FOR = '72 hours'

function args(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) out[key] = true
      else { out[key] = next; i++ }
    } else out._.push(a)
  }
  return out
}

function client() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を指定してください。')
    process.exit(1)
  }
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  async function call(method, path, body, extra = {}) {
    const res = await fetch(`${url}${path}`, { method, headers: { ...headers, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) })
    const text = await res.text()
    const data = text ? JSON.parse(text) : null
    if (!res.ok) throw new Error(`${method} ${path} → HTTP ${res.status}: ${text}`)
    return data
  }
  return { call }
}

function requireLoginID(opts) {
  const id = typeof opts['login-id'] === 'string' ? normalizeLoginID(opts['login-id']) : null
  if (!id) {
    console.error('--login-id は半角英数字（3〜32文字、. _ - 可）で指定してください。')
    process.exit(1)
  }
  return id
}

async function findAccount(api, loginID) {
  const rows = await api.call('GET', `/rest/v1/app_accounts?login_id=eq.${encodeURIComponent(loginID)}&select=*`)
  if (!rows.length) {
    console.error(`ログインID ${loginID} のアカウントはありません。`)
    process.exit(1)
  }
  return rows[0]
}

async function linkStaff(api, userID, staffName) {
  if (!staffName) return
  const staff = await api.call('GET', `/rest/v1/staff_members?name=eq.${encodeURIComponent(staffName)}&select=id,name,auth_user_id`)
  if (staff.length !== 1) {
    console.warn(`出勤簿に「${staffName}」が${staff.length === 0 ? '見つかりません' : '複数あります'}。名前の紐付けはスキップしました。`)
    return
  }
  if (staff[0].auth_user_id && staff[0].auth_user_id !== userID) {
    console.warn(`「${staffName}」は別のアカウントに紐付いています。名前の紐付けはスキップしました。`)
    return
  }
  // Release any other row this user was linked to, then link (service role:
  // the staff link guard trigger lets it through).
  await api.call('PATCH', `/rest/v1/staff_members?auth_user_id=eq.${userID}`, { auth_user_id: null })
  await api.call('PATCH', `/rest/v1/staff_members?id=eq.${staff[0].id}`, { auth_user_id: userID })
  console.log(`出勤簿の「${staffName}」と紐付けました。`)
}

async function issue(api, userID, purpose) {
  const token = generateToken()
  const expires = await api.call('POST', '/rest/v1/rpc/issue_account_setup_token', {
    p_user: userID, p_purpose: purpose, p_token_hash: await hashToken(token), p_valid_for: VALID_FOR,
  })
  console.log('')
  console.log(purpose === 'setup' ? '■ 初回設定コード' : '■ パスワード再設定コード')
  console.log(`  コード : ${formatToken(token)}   （アプリのログイン画面「コードをお持ちの方」で入力）`)
  console.log(`  QR用URL: ${setupURL(token)}   （QRコードにしてiPhoneのカメラで読み取り）`)
  console.log(`  有効期限: ${new Date(expires).toLocaleString('ja-JP')}（1回限り）`)
}

function roles(opts) {
  return {
    is_driver: !opts['no-driver'],
    can_search_customers: Boolean(opts.customers),
    is_admin: Boolean(opts.admin),
  }
}

async function main() {
  const opts = args(process.argv.slice(2))
  const command = opts._[0]
  const api = client()

  switch (command) {
    case 'create': {
      const loginID = requireLoginID(opts)
      const password = generateToken() + generateToken() // never shown; replaced at setup
      const user = await api.call('POST', '/auth/v1/admin/users', {
        email: syntheticEmail(loginID), password, email_confirm: true, user_metadata: { login_id: loginID },
      })
      try {
        await api.call('POST', '/rest/v1/app_accounts', { user_id: user.id, login_id: loginID, ...roles(opts) }, { Prefer: 'return=minimal' })
      } catch (error) {
        await api.call('DELETE', `/auth/v1/admin/users/${user.id}`)
        throw error
      }
      console.log(`アカウント ${loginID} を作成しました。`)
      await linkStaff(api, user.id, opts.staff)
      await issue(api, user.id, 'setup')
      break
    }
    case 'adopt': {
      const loginID = requireLoginID(opts)
      if (typeof opts.email !== 'string') throw new Error('--email を指定してください')
      const list = await api.call('GET', `/auth/v1/admin/users?per_page=1000`)
      const user = (list.users ?? []).find((u) => u.email?.toLowerCase() === opts.email.toLowerCase())
      if (!user) throw new Error(`${opts.email} のアカウントが見つかりません`)
      await api.call('PUT', `/auth/v1/admin/users/${user.id}`, { email: syntheticEmail(loginID), email_confirm: true, user_metadata: { login_id: loginID } })
      await api.call('POST', '/rest/v1/app_accounts?on_conflict=user_id', { user_id: user.id, login_id: loginID, ...roles(opts) }, { Prefer: 'resolution=merge-duplicates,return=minimal' })
      console.log(`${opts.email} をログインID ${loginID} に切り替えました（データはそのままです）。`)
      await linkStaff(api, user.id, opts.staff)
      await issue(api, user.id, 'setup')
      break
    }
    case 'reset': {
      const account = await findAccount(api, requireLoginID(opts))
      await issue(api, account.user_id, 'reset')
      break
    }
    case 'disable':
    case 'enable': {
      const account = await findAccount(api, requireLoginID(opts))
      const disable = command === 'disable'
      await api.call('PUT', `/auth/v1/admin/users/${account.user_id}`, { ban_duration: disable ? '876000h' : 'none' })
      await api.call('PATCH', `/rest/v1/app_accounts?user_id=eq.${account.user_id}`, { disabled_at: disable ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
      console.log(`${account.login_id} を${disable ? '停止' : '再開'}しました。`)
      break
    }
    case 'list': {
      const rows = await api.call('GET', '/rest/v1/app_accounts?select=login_id,is_driver,can_search_customers,is_admin,disabled_at&order=login_id')
      const staff = await api.call('GET', '/rest/v1/staff_members?select=name,auth_user_id&auth_user_id=not.is.null')
      const accounts = await api.call('GET', '/rest/v1/app_accounts?select=user_id,login_id')
      const nameByLogin = Object.fromEntries(accounts.map((a) => [a.login_id, staff.find((s) => s.auth_user_id === a.user_id)?.name ?? '（未紐付け）']))
      for (const r of rows) {
        const flags = [r.is_driver && 'ドライバー', r.can_search_customers && '顧客検索', r.is_admin && '管理者', r.disabled_at && '停止中'].filter(Boolean).join('・')
        console.log(`${r.login_id.padEnd(12)} ${nameByLogin[r.login_id].padEnd(10)} ${flags}`)
      }
      break
    }
    default:
      console.error('使い方: node scripts/kyoei-accounts.mjs <create|reset|adopt|disable|enable|list> [options]（詳しくはファイル冒頭）')
      process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
