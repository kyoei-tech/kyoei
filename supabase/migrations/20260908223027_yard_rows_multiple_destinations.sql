alter table public.yard_rows
  add column if not exists destinations text[] not null default '{}';

update public.yard_rows
set destinations = array[destination]
where destination is not null and trim(destination) <> '' and destinations = '{}';

alter table public.yard_rows drop column if exists destination;;
