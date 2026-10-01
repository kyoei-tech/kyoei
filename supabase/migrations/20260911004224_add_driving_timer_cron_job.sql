-- Schedules the driving-timer-check edge function (see that function's
-- own comment for what it does) to run every minute via pg_cron + pg_net,
-- mirroring the same call pattern the existing notify_new_news_post
-- trigger uses for push-broadcast.
create extension if not exists pg_cron;

select cron.schedule(
  'driving-timer-check',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://ysnqacxkwhhnqcehpbdl.supabase.co/functions/v1/driving-timer-check',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', '<redacted: x-push-secret, see the Edge Function secrets>'),
    body := '{}'::jsonb
  );
  $$
);;
