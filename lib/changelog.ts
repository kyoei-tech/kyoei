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

export const CURRENT_VERSION = CHANGELOG[0]?.version ?? '1.0.0'
