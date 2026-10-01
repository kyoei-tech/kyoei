
-- LoL destinations (delivery destination info entries, keyed by destination id e.g. 'aa', 'bb', ...)
create table if not exists public.lol_entries (
  id uuid primary key default gen_random_uuid(),
  destination_id text not null,
  shop_name text not null default '',
  address text not null default '',
  phone text not null default '',
  hours text not null default '',
  break_time text not null default '',
  place text not null default '',
  event_day text not null default '',
  memo text not null default '',
  method text not null default '',
  notes text not null default '',
  cal_out jsonb not null default '["","","","","","",""]'::jsonb,
  cal_in jsonb not null default '["","","","","","",""]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lol_entries enable row level security;
create policy "lol_entries_public_all" on public.lol_entries for all using (true) with check (true);

-- AA calendar 1: auction dates -> venue names per weekday (0=Sun..6=Sat)
create table if not exists public.aa_venues (
  id uuid primary key default gen_random_uuid(),
  weekday integer not null check (weekday between 0 and 6),
  venue_name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.aa_venues enable row level security;
create policy "aa_venues_public_all" on public.aa_venues for all using (true) with check (true);

-- AA calendar 2: per-venue shipping deadline per weekday
create table if not exists public.aa_deadlines (
  id uuid primary key default gen_random_uuid(),
  weekday integer not null check (weekday between 0 and 6),
  venue_name text not null,
  deadline_time text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.aa_deadlines enable row level security;
create policy "aa_deadlines_public_all" on public.aa_deadlines for all using (true) with check (true);

-- News posts
create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default '',
  content text not null default '',
  author text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.news_posts enable row level security;
create policy "news_posts_public_all" on public.news_posts for all using (true) with check (true);

-- High value cars
create table if not exists public.high_value_cars (
  id uuid primary key default gen_random_uuid(),
  maker text not null default '',
  model_name text not null default '',
  model_code text not null default '',
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.high_value_cars enable row level security;
create policy "high_value_cars_public_all" on public.high_value_cars for all using (true) with check (true);

-- Q&A questions (anonymous)
create table if not exists public.qa_questions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now()
);

alter table public.qa_questions enable row level security;
create policy "qa_questions_public_all" on public.qa_questions for all using (true) with check (true);

-- Q&A answers (each question can have multiple answers, each requires a responder name)
create table if not exists public.qa_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.qa_questions(id) on delete cascade,
  responder text not null,
  body text not null default '',
  created_at timestamptz not null default now()
);

alter table public.qa_answers enable row level security;
create policy "qa_answers_public_all" on public.qa_answers for all using (true) with check (true);

create index if not exists idx_lol_entries_destination on public.lol_entries(destination_id, sort_order);
create index if not exists idx_aa_venues_weekday on public.aa_venues(weekday, sort_order);
create index if not exists idx_aa_deadlines_weekday on public.aa_deadlines(weekday, sort_order);
create index if not exists idx_qa_answers_question on public.qa_answers(question_id, created_at);
;
