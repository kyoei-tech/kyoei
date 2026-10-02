
create table if not exists public.accident_report_memo (
  id text primary key default 'current',
  content text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.accident_report_memo enable row level security;

drop policy if exists "accident_report_memo_public_all" on public.accident_report_memo;
create policy "accident_report_memo_public_all" on public.accident_report_memo
  for all using (true) with check (true);

insert into public.accident_report_memo (id, content)
values ('current', '')
on conflict (id) do nothing;
;
