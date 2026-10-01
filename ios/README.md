# KYOEI iOS

Next.js 版（リポジトリ直下）を SwiftUI に作り直したネイティブアプリです。**アプリ単体で完結**し、通信先は Supabase（DB / Auth / Realtime / Storage / RPC）と iOS 標準機能だけです。Next.js サーバー（`/api` ルートを含む）や Vercel には一切依存しません。サーバー側で動くのは Supabase 上の DB トリガーと Edge Function（即時プッシュ通知）だけです。iOS 版が完成したら、Web 版はまとめて廃止できます。

## 構成

```
ios/
├── KyoeiCore/      Foundation だけで書いたドメインロジックとモデル（Swift Package、テスト付き）
├── Kyoei/          SwiftUI アプリ本体
│   ├── App/        エントリポイント、AppShell（タブ・ステータス帯・1 秒ごとの tick）
│   ├── Stores/     @Observable のストア（設定・運行状態・共有テーブル・通知キュー）
│   ├── Data/       Supabase クライアント、RealtimeTable、Storage、RPC、ローカル通知、DeviceID（Keychain）
│   ├── Design/     カラートークン（globals.css から変換）、タブ別フォント倍率、カードの共通スタイル
│   ├── Components/ 共通 UI（PinGate、確認ダイアログ、BackHeader、MonthNav、添付画像など）
│   └── Features/   画面ごとの実装（Home / Timecard / Staff / News / Yard / Menu / Settings / TripHistory / Accidents / Reference）
├── AppCheck/       開発用。Kyoei/ を macOS 向けに型チェックする（Xcode 不要）
├── Config/         Secrets.xcconfig（git 管理外）とひな形
├── scripts/check.sh
└── project.yml     XcodeGen の設定

supabase/migrations/   iOS 版に必要な DB 側の設定（下記）
supabase/functions/push-dispatch/   即時プッシュ通知の Edge Function（APNs 直結）
scripts/migrate-blob-to-supabase-storage.mjs   既存添付の移行（1 回だけ実行）
```

## サーバー依存の置き換え

| Web 版（サーバー経由） | iOS 版（アプリ単体） |
|---|---|
| `/api/{dispatch-sheet,beginner-notes,timecard-todo}/upload\|file` → 非公開の Vercel Blob | Supabase Storage の非公開バケットをアプリから直接読み書き（`AttachmentStore`）。配車表は本人のフォルダだけにアクセスできる RLS 付き |
| `/api/test-accounts`（service role キーをサーバーで使用。PIN の照合なし） | `SECURITY DEFINER` の DB 関数を RPC で呼ぶ（`TestAccountAdmin`）。PIN は DB 側で bcrypt 照合し、5 回失敗で 10 分ロック。service role キーはアプリに含めない |
| 運行タイマー通知：アプリが開いている間に判定し、閉じているときは `driving_sessions` テーブル + Edge Function 経由の Web Push | 閾値に達する時刻を計算して iOS のローカル通知として予約（`NotificationScheduler`）。電波がなくても時間どおりに鳴る |
| おしらせ通知：Edge Function `push-broadcast` 経由の Web Push | **DB トリガー → Edge Function `push-dispatch` → APNs による即時リモートプッシュ**。出勤簿のステータス変更も同じ仕組みで通知する（`PushRegistrar` / `supabase/functions/push-dispatch`） |
| `proxy.ts`（セッション Cookie の更新） | 不要（supabase-swift がトークンを Keychain に保存し、自動で更新する） |

### 通知の流れ

| 通知 | 経路 | アプリが閉じているとき | アプリが前面にあるとき |
|---|---|---|---|
| 運行タイマー（連続走行・運行時間・休憩 30 分） | ローカル通知（端末内で予約） | 時間どおりに OS の通知 | 「了解しました。」モーダル |
| おしらせの投稿 | DB トリガー → `push-dispatch` → APNs | 即時に OS の通知（タップでおしらせタブ） | 「了解しました。」モーダル |
| 出勤簿のステータス変更 | 同上（本人の端末を除く） | 即時に OS の通知（タップで出勤簿タブ） | バナー |

端末ごとに受け取る種類（`pushTopics`）を選べます（UI は設定画面と合わせてフェーズ 3 で実装）。APNs の鍵は Edge Function のシークレットにだけ置き、アプリには含めません。

## セットアップ

1. Supabase に `supabase/migrations/` を適用する（`supabase db push`、または SQL エディタで順に実行）
   - `20261001000000_storage_buckets.sql` … バケット 3 つと Storage の RLS
   - `20261001000100_admin_test_accounts.sql` … テストアカウント管理用の RPC。**適用後に PIN を変更してください**（手順はファイル冒頭のコメント）
   - `20261001000200_push_notifications.sql` … デバイストークンのテーブル、登録用 RPC、通知トリガー
2. プッシュ通知を設定する：APNs の鍵の作成、Edge Function のデプロイ、Vault への登録（手順は `supabase/functions/push-dispatch/README.md`）
3. 設定ファイルを作る：`cp ios/Config/Secrets.example.xcconfig ios/Config/Secrets.xcconfig` を実行し、Supabase の URL と anon キーを記入する
4. `brew install xcodegen && cd ios && xcodegen && open Kyoei.xcodeproj`

Xcode がなくても、ロジックのテスト、アプリ側コードの型チェック、Edge Function のテストは実行できます。

```sh
ios/scripts/check.sh
```

## Web 版を廃止するときの手順

1. Web 版の利用を止めたら、既存の添付ファイルを Storage にコピーする（何度実行しても結果は同じ）

   ```sh
   BLOB_READ_WRITE_TOKEN=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
     node scripts/migrate-blob-to-supabase-storage.mjs --dry-run   # 確認してから --dry-run を外して実行
   ```

   - 配車表は `<auth uid>/...` に移動し、`dispatch_sheets.blob_url` を書き換えます（書き換え後は Web 版から表示できなくなるので、必ず廃止のタイミングで実行してください）
   - TODO の `/images/...`（Next.js の public 配下のファイル）も Storage にアップロードし、行を書き換えます
2. 削除してよいもの
   - Next.js 一式（`app/` `components/` `lib/` `public/` `proxy.ts` `next.config.mjs` `package.json` など）と Vercel プロジェクト
   - Vercel Blob ストア（移行スクリプトの成功を確認した後）
   - Supabase Edge Functions `driving-timer-check` と `push-broadcast`、テーブル `driving_sessions` と `push_subscriptions`（Web Push 専用。iOS 版では `push-dispatch` と `device_push_tokens` が代わりを務める）
   - 移行スクリプト本体

## 進捗

- [x] フェーズ 0：土台（Core ロジック、ストア、Realtime、テーマ、タブ骨格、共通 UI）
- [x] アーキテクチャ：サーバー依存の除去（Storage、管理用 RPC、ローカル通知）
- [x] 即時リモートプッシュ（DB トリガー → Edge Function → APNs。おしらせ、出勤簿のステータス）
- [x] フェーズ 1：ホーム
  - 乗務員：出庫・帰庫（分割休息の確認の連鎖を含む）、運行状況、休息状況、法定チェック
  - タイムカード：出勤・退勤、休憩、共有メモ、個人メモ、やること（画像は Storage）
  - 無事故日数、今月の目標
  - 運行タイマーのローカル通知、運行履歴への保存、出勤簿との同期
- [x] フェーズ 2
  - 出勤簿：2 回タップで出退勤の切り替え、3 回タップでコメント編集、社員とヤード管理者の追加・編集・削除
  - おしらせ：一覧、詳細、投稿、過去の投稿の編集・削除。開いている間はモーダル、前面に戻ったときは見逃した投稿を取り込む
  - ヤード配置：かな対応の移動先検索、ヤード・位置・行き先の編集。行き先名を変えると、割り当て済みの位置にも反映
- [x] フェーズ 3：メニュー配下の全画面
  - 設定：フォント、背景色、乗務員 ID、アルバイトモード、試験運転モード、通知（受け取る種類の選択を含む）
  - テストアカウント管理（PIN は DB 側で照合）
  - 隠し管理メニュー（プッシュ通知・アラート文言・検索結果登録）と Version
  - 運行履歴（全表示とカレンダー、隠し編集、出勤日の調整）、無事故カレンダー（月間・年間・カテゴリー）
  - 参照ページ：LoL MAP、LoL、AA、高額車、緊急連絡先、初心者ノート（画像は Storage）、ドライバー語録、Q&A
  - 事故報告：端末内だけに保存（ファイル保護あり、iCloud バックアップ対象外）。カメラ撮影と、共有シートでの画像書き出しに対応
- [ ] フェーズ 4：マイページ、認証、配車表（PDF 解析）

未実装の画面（マイページのみ）は `ComingSoonView` に担当フェーズを表示しています。アプリアイコンは 1024px の原画が必要なため未設定です。
