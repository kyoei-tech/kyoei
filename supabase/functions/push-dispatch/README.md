# push-dispatch

お知らせの投稿や出勤簿のステータス変更を、**アプリが閉じていても即時に** iOS 端末へプッシュ通知する Edge Function です。

```
news_posts INSERT ─┐
                   ├─ AFTER トリガー ─ pg_net（非同期 HTTP）─▶ push-dispatch ─▶ APNs ─▶ 各端末
staff_members      │   private.dispatch_push_event()            │
  .status UPDATE ──┘                                            └─ device_push_tokens（topics で絞り込み）
```

- APNs へは HTTP/2 とトークン認証（.p8 鍵）で直接送ります。OneSignal や FCM などの中継サービスは使いません。
- 送信先は `device_push_tokens.topics` で決まります（`news` / `staff_status`）。ステータス変更は、本人（設定の乗務員 ID が一致する端末）には送りません。
- APNs が「無効」と返したトークン（410、BadDeviceToken）は、自動で削除します。
- トリガーは pg_net に送信を任せてすぐに戻るため、元の INSERT / UPDATE が遅くなったり、失敗したりすることはありません。
- 運行タイマーの通知はここでは扱いません。アプリが iOS のローカル通知として予約するため、電波がなくても時間どおりに鳴ります。

## セットアップ

1. **Apple Developer**
   - Identifiers で `jp.kyoei.app` の Push Notifications を有効にする
   - Keys で「Apple Push Notifications service (APNs)」の鍵を作り、`AuthKey_XXXXXXXXXX.p8`、Key ID、Team ID を控える
2. **Edge Function のシークレットを設定し、デプロイする**

   ```sh
   supabase secrets set \
     APNS_KEY_ID=XXXXXXXXXX \
     APNS_TEAM_ID=YYYYYYYYYY \
     APNS_BUNDLE_ID=jp.kyoei.app \
     APNS_PRIVATE_KEY="$(cat AuthKey_XXXXXXXXXX.p8)" \
     PUSH_WEBHOOK_SECRET="$(openssl rand -hex 32)"

   # 呼び出し元は DB（共有シークレットで認証）なので、JWT の検証は無効にする
   supabase functions deploy push-dispatch --no-verify-jwt
   ```

3. **マイグレーションを適用し、DB 側に URL とシークレットを登録する**

   `supabase/migrations/20261001000200_push_notifications.sql` を適用した後、SQL エディタで次を実行します。

   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/push-dispatch', 'push_dispatch_url');
   select vault.create_secret('<PUSH_WEBHOOK_SECRET と同じ値>', 'push_webhook_secret');
   ```

   この 2 つが登録されるまで、トリガーは何もしません（安全に先行適用できます）。

## 動作確認

```sh
# 関数を直接呼ぶ（登録済みの端末に届く）
curl -X POST https://<project-ref>.supabase.co/functions/v1/push-dispatch \
  -H "x-push-webhook-secret: <PUSH_WEBHOOK_SECRET>" -H "Content-Type: application/json" \
  -d '{"type":"INSERT","table":"news_posts","schema":"public","record":{"id":"test","title":"テスト配信"},"old_record":null}'
# => {"targeted":N,"delivered":N,"failed":0,"pruned":0}
```

- 関数のログ：`supabase functions logs push-dispatch`
- DB からの送信記録：`select * from net._http_response order by created desc limit 10;`
- Xcode から実行した Debug ビルドは `sandbox` 環境で、TestFlight / App Store 版は `production` 環境で登録されます。関数は端末ごとに送信先のホストを切り替えます。

## テスト

`events.ts` / `apns.ts` / `dispatch.ts` は Deno と Node のどちらでも動きます（Web Crypto と fetch だけを使用）。

```sh
node --test supabase/functions/push-dispatch/push-dispatch.test.ts   # Node 23 以降
deno test supabase/functions/push-dispatch/                          # Deno
```
