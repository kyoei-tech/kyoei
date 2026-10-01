# KYOEI 管理画面（admin/）

パソコンから使う管理者専用の Web サイトです。アプリのアカウント・POS番号一覧・アプリに表示する内容を管理します。Web 版（リポジトリ直下）とは別の Next.js 16 プロジェクトで、Web 版を廃止したあとも残ります。

## 守り方

- 入れるのは、`app_accounts.is_admin` が付いた有効なアカウントだけです。ログイン ID とパスワードのあと、**KYOEI アプリ（iPhone）での承認が必須**です（二段階認証）。画面に出る2桁の数字をアプリで選び、Face ID で承認します。承認は、その iPhone の Secure Enclave にある鍵の署名で確かめます（鍵は、管理者が発行したコードで設定したときに登録）。認証アプリや SMS は使いません。
- ページとサーバー処理のたびに、サーバー側で「ログイン済み・アプリで承認済み・管理者」を Supabase に問い合わせて確認します（`lib/auth.ts`）。
- POS番号一覧と変更履歴は、DB の権限（RLS）でも「二段階認証済みの管理者」でなければ読み書きできません。
- service role キーは、Supabase の管理者 API が必要な処理（アカウントの作成、コードの発行、停止）でだけ、サーバー内で使います。ブラウザには渡しません。
- 15分操作がないと自動でログアウトします。画面の埋め込みは禁止し、検索エンジンにも載せません。
- 変更はすべて `admin_audit_log` に記録され、誰も削除・変更できません。

## 画面

| パス | 内容 |
|---|---|
| `/login` | ログイン → KYOEI アプリで承認 |
| `/` | ホーム（利用状況・対応が必要なこと・最近の変更） |
| `/accounts` | アカウントの招待（コード・QR・LINE 用リンク）、権限・名前の紐付け、再設定コード、停止・再開 |
| `/customers` | POS番号一覧（会員名・よみ・会場名・会員番号）、1件追加・削除、CSV 取り込み（事前確認つき）・書き出し |
| `/history` | 変更履歴 |
| `/setup?t=…` | 招待リンクを開いた人向けの案内ページ（ログイン不要。アプリを開くボタンとコード） |
| `/soon/…` | 準備中の項目（おしらせ・出勤簿・申請・記録など） |

## 開発

```sh
cd admin
cp .env.example .env.local   # 値を記入（.env.local は git 管理外）
npm install
npm run dev                  # http://localhost:3100
npm test                     # CSV・顧客の並べ替え・コードのテスト
```

必要な DB の変更は `supabase/migrations/20261002000100_admin_console.sql` と `20261002000200_admin_login_approval.sql`、Edge Function は `admin-login-approve` と `account-setup` です。

## デプロイ（Vercel）

Web 版と同じ Vercel アカウントに、**別のプロジェクト**として作成します。

1. Vercel で「Add New → Project」→ このリポジトリを選び、**Root Directory を `admin`** にする
2. Environment Variables に `.env.example` の4つを設定する（`SUPABASE_SERVICE_ROLE_KEY` は Production だけ）
3. デプロイ後、`NEXT_PUBLIC_SITE_URL` を実際の URL にして再デプロイする（招待リンクに使われます）
