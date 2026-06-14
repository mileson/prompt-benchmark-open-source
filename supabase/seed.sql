-- ========================================
-- Prompt Benchmark - seed v1
-- Purpose:
--   Create one live demo activity and a baseline participant roster
--   for local / remote environment bootstrap.
-- ========================================

begin;

with upsert_activity as (
  insert into public.activities (
    title,
    slug,
    status,
    direct_entry_url,
    auto_evaluate_enabled,
    ranking_visible,
    polling_interval_ms,
    theme_mode,
    rubric_version
  ) values (
    '提示词培训现场大屏示例',
    'prompt-benchmark',
    'live',
    '/join/prompt-benchmark',
    false,
    true,
    2000,
    'dark',
    'v1'
  )
  on conflict (slug) do update
    set title = excluded.title,
        status = excluded.status,
        direct_entry_url = excluded.direct_entry_url,
        auto_evaluate_enabled = excluded.auto_evaluate_enabled,
        ranking_visible = excluded.ranking_visible,
        polling_interval_ms = excluded.polling_interval_ms,
        theme_mode = excluded.theme_mode,
        rubric_version = excluded.rubric_version,
        updated_at = timezone('utc'::text, now())
  returning id
), activity_target as (
  select id from upsert_activity
  union all
  select id from public.activities where slug = 'prompt-benchmark'
  limit 1
), roster(display_name) as (
  values
    ('Learner 01'),
    ('Learner 02'),
    ('Learner 03'),
    ('Learner 04'),
    ('Learner 05'),
    ('Learner 06'),
    ('Learner 07'),
    ('Learner 08'),
    ('Learner 09'),
    ('Learner 10'),
    ('Learner 11'),
    ('Learner 12'),
    ('Learner 13'),
    ('Learner 14'),
    ('Learner 15'),
    ('Learner 16'),
    ('Learner 17'),
    ('Learner 18'),
    ('Learner 19'),
    ('Learner 20'),
    ('Learner 21'),
    ('Learner 22'),
    ('Learner 23'),
    ('Learner 24'),
    ('Learner 25'),
    ('Learner 26'),
    ('Learner 27'),
    ('Learner 28'),
    ('Learner 29'),
    ('Learner 30')
)
insert into public.participants (
  activity_id,
  display_name,
  status,
  evaluation_state
)
select
  activity_target.id,
  roster.display_name,
  'not_joined',
  'idle'
from activity_target
cross join roster
on conflict (activity_id, display_name) do nothing;

commit;
