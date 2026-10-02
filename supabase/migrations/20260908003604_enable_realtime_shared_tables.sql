
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lol_entries'
  ) then
    alter publication supabase_realtime add table public.lol_entries;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aa_venues'
  ) then
    alter publication supabase_realtime add table public.aa_venues;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aa_deadlines'
  ) then
    alter publication supabase_realtime add table public.aa_deadlines;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'news_posts'
  ) then
    alter publication supabase_realtime add table public.news_posts;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'high_value_cars'
  ) then
    alter publication supabase_realtime add table public.high_value_cars;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'qa_questions'
  ) then
    alter publication supabase_realtime add table public.qa_questions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'qa_answers'
  ) then
    alter publication supabase_realtime add table public.qa_answers;
  end if;
end $$;
;
