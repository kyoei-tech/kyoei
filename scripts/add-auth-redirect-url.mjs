#!/usr/bin/env node
// Adds the iOS app's email-confirmation redirect (kyoei://auth/callback) to
// the Supabase project's Auth "Redirect URLs" allow list via the Management
// API. Existing entries are kept (read → merge → write), and re-running is a
// no-op, so it is safe to run more than once.
//
//   SUPABASE_ACCESS_TOKEN=<personal access token> \
//   SUPABASE_PROJECT_REF=<project ref, e.g. abcdefghijklmnop> \
//     node scripts/add-auth-redirect-url.mjs [--dry-run]
//
// The access token is created at https://supabase.com/dashboard/account/tokens
// and is only used for this call; it is never stored.

export const IOS_REDIRECT_URL = 'kyoei://auth/callback'

/** Merges `url` into Supabase's comma-separated uri_allow_list, keeping order and existing entries. */
export function mergeAllowList(current, url) {
  const entries = (current ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (entries.includes(url)) return { value: entries.join(','), changed: false }
  return { value: [...entries, url].join(','), changed: true }
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  const ref = process.env.SUPABASE_PROJECT_REF
  const dryRun = process.argv.includes('--dry-run')
  if (!token || !ref) {
    console.error('SUPABASE_ACCESS_TOKEN と SUPABASE_PROJECT_REF を指定してください。')
    process.exit(1)
  }

  const endpoint = `https://api.supabase.com/v1/projects/${ref}/config/auth`
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const current = await fetch(endpoint, { headers })
  if (!current.ok) {
    console.error(`現在の設定を取得できませんでした (HTTP ${current.status}): ${await current.text()}`)
    process.exit(1)
  }
  const config = await current.json()
  const { value, changed } = mergeAllowList(config.uri_allow_list, IOS_REDIRECT_URL)

  console.log('現在の Redirect URLs:', config.uri_allow_list || '（なし）')
  if (!changed) {
    console.log(`${IOS_REDIRECT_URL} は登録済みです。変更はありません。`)
    return
  }
  console.log('更新後の Redirect URLs:', value)
  if (dryRun) {
    console.log('--dry-run のため保存していません。')
    return
  }

  const update = await fetch(endpoint, { method: 'PATCH', headers, body: JSON.stringify({ uri_allow_list: value }) })
  if (!update.ok) {
    console.error(`保存できませんでした (HTTP ${update.status}): ${await update.text()}`)
    process.exit(1)
  }
  console.log(`${IOS_REDIRECT_URL} を追加しました。`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
