alter table public.dispatch_sheets
  drop column if exists page_images,
  add column if not exists dispatch_date text,
  add column if not exists extracted_data jsonb;;
