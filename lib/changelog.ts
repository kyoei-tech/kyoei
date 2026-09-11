'use client'

import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { createClient } from '@/lib/supabase/client'

// Human-written update history shown in the "Version" menu page.
// Keep entries short and in plain Japanese so non-technical staff can
// follow what changed, where, and when.
export type ChangeKind = '追加' | '変更' | '削除'

export type ChangelogEntry = {
  page: string
  kind: ChangeKind
  description: string
}

export type ChangelogVersion = {
  version: string
  date: string // YYYY-MM-DD
  entries: ChangelogEntry[]
}

export const CHANGELOG: ChangelogVersion[] = [
  {
    version: '1.7.0',
    date: '2026-09-10',
    entries: [
      {
        page: 'Version',
        kind: '変更',
        description:
          '4回連続タップでの削除をやめ、各項目に編集ボタンを追加。暗証番号（0525）を入力すると「編集」「非表示」「削除」から選べるようになりました。非表示にした項目は一覧の下にまとめて表示され、いつでも元に戻せます。',
      },
    ],
  },
  {
    version: '1.6.0',
    date: '2026-09-10',
    entries: [
      {
        page: 'ホーム',
        kind: '追加',
        description:
          'ホームタブを5回連続でタップすると、出勤・退勤と休憩時間だけを記録する簡単な画面（タイムカードモード）に切り替わるようになりました。もう一度5回タップすると元の画面に戻ります。',
      },
      {
        page: 'ホーム',
        kind: '追加',
        description:
          'タイムカードモードに「勤務状況をみる」ページを追加。休憩の開始・終了に加え、全員で共有するメモ（トリプルタップで名前と内容を追記）と、この端末だけに保存される個人メモ（ダブルタップで編集）を使えます。',
      },
      {
        page: '出勤簿',
        kind: '追加',
        description:
          '「本日のヤード管理者」を追加。社員登録と同じように名前を追加・編集・削除でき、タップで出勤・退勤を切り替えられます。',
      },
    ],
  },
  {
    version: '1.5.0',
    date: '2026-09-10',
    entries: [
      {
        page: '出勤簿',
        kind: '変更',
        description:
          '役職者以外の並び順を、勤続年数が長い人から順番に並ぶように修正しました。',
      },
      {
        page: 'Version',
        kind: '追加',
        description:
          '更新内容の項目を4回連続でタップすると削除できるようになりました。',
      },
    ],
  },
  {
    version: '1.4.0',
    date: '2026-09-10',
    entries: [
      {
        page: 'メニュー',
        kind: '追加',
        description:
          '一番上に「LoL MAP」を追加。ボタンを押すとGoogleマップが開くようになりました。',
      },
      {
        page: 'メニュー',
        kind: '追加',
        description:
          '一番下に「Version」を追加。これまでの更新内容をここから確認できます。',
      },
      {
        page: 'ヤード配置',
        kind: '追加',
        description:
          'タイトルの下に「更新済み」「未更新」の表示を追加。今日中に更新していれば緑の太字、していなければオレンジの表示になります（毎日0時にリセット）。',
      },
    ],
  },
  {
    version: '1.3.0',
    date: '2026-09-10',
    entries: [
      {
        page: '無事故カレンダー',
        kind: '追加',
        description:
          '事故の記録に「カテゴリー」を選べるようになりました。候補にない場合はその場で新しいカテゴリーを追加できます。',
      },
      {
        page: '無事故カレンダー',
        kind: '追加',
        description:
          '「月間」「年間」を切り替えるボタンを追加。年間表示では月ごと・カテゴリーごとの事故件数を確認できます。',
      },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-09-10',
    entries: [
      {
        page: 'ホーム',
        kind: '変更',
        description:
          '「今週の目標」をダブルタップして編集する際、タイトルの文章も一緒に編集できるようになりました。',
      },
      {
        page: 'ホーム',
        kind: '追加',
        description:
          '「今週の目標」の本文をダブルタップで編集できるようになりました（表示の見た目は変わりません）。',
      },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-09-10',
    entries: [
      {
        page: 'LoL',
        kind: '変更',
        description:
          '荷扱車格で「条件あり」を選んだとき、入力した条件が赤字の太字で表示されるようになりました。',
      },
      {
        page: 'LoL',
        kind: '変更',
        description:
          '既訪者（訪問した人）の表示を、名前の大きさに合わせた角丸の枠に変更。1行に最大4人まで並び、5人目以降は次の行に表示されます。',
      },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-09-01',
    entries: [
      {
        page: '全体',
        kind: '追加',
        description: '出勤簿・ヤード配置・LoL・AA・無事故カレンダーなど、初期版として公開しました。',
      },
    ],
  },
]

// The Version page (components/version-view.tsx) now reads its entries
// live from the `changelog_entries` table in Supabase, not from the
// CHANGELOG array above — that array is kept only as historical seed data
// and for the ChangeKind type. This constant is only the last-resort
// fallback for useCurrentVersion() below (shown for an instant before the
// table loads, or if the table is ever unreachable) — it does not need to
// be kept in sync with the table by hand anymore.
export const CURRENT_VERSION = '1.10.0'

async function fetchLatestVersion(): Promise<{ version: string }[]> {
  const supabase = createClient()
  // Lower version_order = newer: components/version-view.tsx sorts
  // version_order ascending and treats idx 0 (the smallest value) as
  // "最新" / newest, and saveNewVersion() there assigns each new version
  // an even lower value than any existing one. Mirror that convention here.
  const { data, error } = await supabase
    .from('changelog_entries')
    .select('version')
    .order('version_order', { ascending: true })
    .limit(1)
  if (error) throw error
  return (data as { version: string }[]) ?? []
}

/**
 * The current app version, read live from the lowest `version_order` row
 * in `changelog_entries` and kept in sync in real time — so adding a new
 * version from the Version page (components/version-view.tsx) updates the
 * "現在のバージョン：…" label shown in the menu immediately, with no manual
 * constant to bump. Falls back to CURRENT_VERSION while loading or if the
 * table is empty/unreachable.
 *
 * Uses a distinct cacheKey ("latest") because components/version-view.tsx
 * watches the same table with a different query shape (all columns, all
 * rows) — sharing a cache key would let whichever fetch resolves last
 * silently overwrite the other's data.
 */
export function useCurrentVersion(): string {
  const { data } = useRealtimeTable('changelog_entries', fetchLatestVersion, {
    cacheKey: 'latest',
  })
  return data[0]?.version ?? CURRENT_VERSION
}
