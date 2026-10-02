# parse-dispatch-sheet

ドライバーがアップロードした配車表（運行指示書兼運転日報）の PDF を読み取り、結果を `dispatch_sheets.extracted_data` に保存する Edge Function です。AI や画像認識は使わず、pdf.js のテキスト層から文字と座標を取り出して、印字された列見出しの位置で各列に振り分けます（`parser.ts`）。

```
iPhone ─ PDF を本人フォルダへ保存 ─▶ Storage（dispatch-sheets/<auth uid>/…）
   │
   └─ { sheetId } ─▶ parse-dispatch-sheet ─ 本人の配車表か確認 ─▶ 原本を読む ─▶ 解析 ─▶ dispatch_sheets を更新
                                                                                      │
iPhone ◀──────────────────────── Realtime（一覧の「解析中」が「17台」に変わる）──────┘
```

- 呼び出せるのは、ログイン中の本人だけです（JWT を検証）。配車表の原本が `<呼び出した人の auth uid>/` フォルダにない場合は、403 を返します。
- 原本は、呼び出した本人のログイン情報で Storage から読みます（Storage の RLS もかかります）。
- `{ "reparseOutdated": true }` を送ると、古いパーサーで読んだ配車表（Web 版でアップロードしたものを含む）を本人の分だけ読み直します。アプリは配車表の一覧を開くたびにこれを呼びます。読み直す対象がなければ、すぐに戻ります。
- 読み取れなかったときは `parse_error` に理由を残します。原本はそのまま表示できます。

## 読み取る項目（1 台ごと）

回戦、品名、オークション、車体番号、請求先、積地・降地（「【搬出】(5330)」などの管理番号は `pickupRef` / `dropoffRef` に分離）、積日・卸日と条件、摘要１（電話番号 `phones` と注意キーワード `alerts` を抽出）、出荷地、納入地、緊締、確認が必要な項目 `warnings`。

文字は NFKC で統一します（ﾌﾘｰﾄﾞ → フリード）。英単語の途中で折り返した欄は空白でつなぎます（JAPAN FORWARDING）。

## パーサーを直したとき

`parser.ts` の `PARSER_VERSION` を 1 つ上げてデプロイします。各ドライバーが次に配車表の一覧を開いたときに、保存済みの原本が自動で読み直されます。

## デプロイ

```sh
# 先に supabase/migrations/20261001000300_dispatch_sheet_parsing.sql を適用する
supabase functions deploy parse-dispatch-sheet
```

JWT の検証は有効のままにします（`--no-verify-jwt` は付けない）。`SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY` はプラットフォームが自動で渡します。service role キーは、本人の配車表であることを確認してから結果を書き込むときにだけ使います。

## テスト

```sh
node --test supabase/functions/parse-dispatch-sheet/parse-dispatch-sheet.test.ts
```

実在の配車表には個人名が含まれるため、リポジトリには入れていません。テストは、本物の様式と同じ座標に並べた架空のデータで行います。
