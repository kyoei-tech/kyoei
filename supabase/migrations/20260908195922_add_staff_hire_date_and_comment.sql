alter table public.staff_members
  add column if not exists hire_date date,
  add column if not exists comment text not null default '';;
