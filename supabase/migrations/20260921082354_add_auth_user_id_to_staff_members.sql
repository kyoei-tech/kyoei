alter table public.staff_members
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists staff_members_auth_user_id_key
  on public.staff_members (auth_user_id)
  where auth_user_id is not null;;
