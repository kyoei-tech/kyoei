create table public.confirm_action_messages (
  id text primary key,
  label text not null,
  message text not null,
  updated_at timestamptz not null default now()
);

alter table public.confirm_action_messages enable row level security;

create policy confirm_action_messages_all_access
  on public.confirm_action_messages
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.confirm_action_messages to anon, authenticated;

insert into public.confirm_action_messages (id, label, message) values
  ('home-departure', '出庫確認', '出庫を開始しますか？'),
  ('home-return', '帰庫確認', '帰庫を開始しますか？'),
  ('home-split-rest-message', '分割休息による出庫（タイトル）', '分割休息による出庫'),
  ('home-split-rest-body', '分割休息による出庫（注意文）', '分割休息は1回3時間以上とること。
2分割の場合は合計10時間以上、
3分割の場合は合計12時間以上になるように休息をとること。'),
  ('driving-category-loading', '荷積を開始しますか？', '荷積を開始しますか？'),
  ('driving-category-unloading', '荷卸を開始しますか？', '荷卸を開始しますか？'),
  ('driving-category-waiting', '待機を開始しますか？', '待機を開始しますか？'),
  ('driving-category-resting', '休憩を開始しますか？（運行中）', '休憩を開始しますか？'),
  ('driving-resume', '走行再開確認', '走行再開を開始しますか？'),
  ('timecard-clock-in', 'タイムカード確認（出勤）', 'タイムカードを押しましたか？'),
  ('timecard-clock-out', 'タイムカード確認（退勤）', 'タイムカードを押しましたか？'),
  ('timecard-break-start', '休憩開始確認（タイムカード）', '休憩を開始しますか？'),
  ('timecard-break-end', '休憩終了確認（タイムカード）', '休憩を終了しますか？');;
