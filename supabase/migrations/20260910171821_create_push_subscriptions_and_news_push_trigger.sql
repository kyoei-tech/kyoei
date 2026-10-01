create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_all_access" on public.push_subscriptions;
create policy "push_subscriptions_all_access"
  on public.push_subscriptions
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- pg_net is required so a Postgres trigger can call the Supabase Edge
-- Function that actually sends the web push messages.
create extension if not exists pg_net;

create or replace function public.notify_new_news_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://ysnqacxkwhhnqcehpbdl.supabase.co/functions/v1/push-broadcast',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', '<redacted: x-push-secret, see the Edge Function secrets>'
    ),
    body := jsonb_build_object(
      'title', 'おしらせ',
      'message', '新しいおしらせがあります💡'
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_new_news_post on public.news_posts;
create trigger trg_notify_new_news_post
  after insert on public.news_posts
  for each row
  execute function public.notify_new_news_post();;
