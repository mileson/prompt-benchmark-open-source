begin;

alter table public.participants
  add column if not exists product_url text;

create index if not exists idx_participants_activity_product_url
  on public.participants(activity_id)
  where product_url is not null;

commit;
