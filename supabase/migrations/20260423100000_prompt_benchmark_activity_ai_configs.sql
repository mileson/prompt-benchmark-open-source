begin;

create table if not exists public.activity_ai_configs (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null unique references public.activities(id) on delete cascade,
  base_url text not null default 'https://open.bigmodel.cn/api/paas/v4',
  model_name text not null default 'glm-5.1',
  api_key_encrypted text,
  api_key_masked text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create trigger set_activity_ai_configs_updated_at
before update on public.activity_ai_configs
for each row execute procedure public.set_updated_at();

alter table public.activity_ai_configs enable row level security;

comment on table public.activity_ai_configs is 'Per-activity AI runtime configuration for standard-mode evaluations.';

commit;
