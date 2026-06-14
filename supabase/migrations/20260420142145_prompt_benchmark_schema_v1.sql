-- ========================================
-- Prompt Benchmark - schema v1
-- Purpose:
--   Core schema for training-event prompt collection,
--   async AI evaluation, ranking, and dashboard polling.
-- Notes:
--   - intended for Supabase Postgres
--   - business access should go through server-side APIs
--   - service_role is expected on the backend only
-- ========================================

begin;

-- ---------- extensions ----------
create extension if not exists pgcrypto;

-- ---------- helper: updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

-- ---------- activities ----------
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  status text not null default 'draft'
    check (status in ('draft', 'live', 'archived')),
  direct_entry_url text,
  auto_evaluate_enabled boolean not null default true,
  ranking_visible boolean not null default true,
  polling_interval_ms integer not null default 2000
    check (polling_interval_ms >= 1000 and polling_interval_ms <= 10000),
  theme_mode text not null default 'dark'
    check (theme_mode in ('dark', 'light')),
  rubric_version text not null default 'v1',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create trigger set_activities_updated_at
before update on public.activities
for each row execute procedure public.set_updated_at();

comment on table public.activities is 'Training event configuration and presentation settings.';

-- ---------- participants ----------
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  display_name text not null,
  login_name text,
  status text not null default 'not_joined'
    check (status in ('not_joined', 'logged_in', 'submitted', 'evaluating', 'scored')),
  current_score numeric(5,2)
    check (current_score is null or (current_score >= 0 and current_score <= 100)),
  current_rank integer
    check (current_rank is null or current_rank > 0),
  latest_submission_version integer not null default 0
    check (latest_submission_version >= 0),
  latest_evaluated_version integer
    check (latest_evaluated_version is null or latest_evaluated_version >= 0),
  evaluation_state text not null default 'idle'
    check (evaluation_state in ('idle', 'queued', 'running', 'completed', 'stale', 'failed')),
  last_seen_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique(activity_id, display_name)
);

create index if not exists idx_participants_activity_id
  on public.participants(activity_id);
create index if not exists idx_participants_activity_status
  on public.participants(activity_id, status);
create index if not exists idx_participants_activity_rank
  on public.participants(activity_id, current_rank);
create unique index if not exists uq_participants_activity_rank_nonnull
  on public.participants(activity_id, current_rank)
  where current_rank is not null;

create trigger set_participants_updated_at
before update on public.participants
for each row execute procedure public.set_updated_at();

comment on table public.participants is 'Pre-imported attendee roster plus current dashboard state.';

-- ---------- participant_sessions ----------
create table if not exists public.participant_sessions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  session_token text not null unique,
  client_type text not null default 'unknown'
    check (client_type in ('mobile', 'desktop', 'unknown')),
  is_active boolean not null default true,
  last_seen_at timestamptz not null default timezone('utc'::text, now()),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_sessions_participant
  on public.participant_sessions(participant_id);
create index if not exists idx_sessions_activity
  on public.participant_sessions(activity_id);
create index if not exists idx_sessions_active
  on public.participant_sessions(is_active);

comment on table public.participant_sessions is 'Session mapping for mobile / desktop attendee entry.';

-- ---------- submissions ----------
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  version integer not null check (version > 0),
  prompt_text text not null check (char_length(trim(prompt_text)) > 0),
  is_latest boolean not null default true,
  source text not null default 'unknown'
    check (source in ('mobile', 'desktop', 'unknown')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique(participant_id, version)
);

create index if not exists idx_submissions_activity_id
  on public.submissions(activity_id);
create index if not exists idx_submissions_participant_id
  on public.submissions(participant_id);
create index if not exists idx_submissions_latest
  on public.submissions(participant_id, is_latest);
create unique index if not exists uq_submissions_latest_per_participant
  on public.submissions(participant_id)
  where is_latest = true;

comment on table public.submissions is 'Versioned prompt submissions; latest row is used for evaluation snapshotting.';

-- ---------- evaluation_jobs ----------
create table if not exists public.evaluation_jobs (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  trigger_mode text not null
    check (trigger_mode in ('auto', 'manual')),
  job_status text not null default 'queued'
    check (job_status in ('queued', 'running', 'completed', 'failed')),
  model_name text not null default 'Pro/zai-org/GLM-5.1',
  rubric_version text not null default 'v1',
  snapshot_at timestamptz not null default timezone('utc'::text, now()),
  participant_count integer not null default 0 check (participant_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_evaluation_jobs_activity
  on public.evaluation_jobs(activity_id, created_at desc);
create index if not exists idx_evaluation_jobs_status
  on public.evaluation_jobs(job_status);

comment on table public.evaluation_jobs is 'Async batch-evaluation jobs for SiliconFlow-based scoring.';

-- ---------- evaluation_results ----------
create table if not exists public.evaluation_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.evaluation_jobs(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  submission_version integer not null check (submission_version > 0),
  total_score numeric(5,2) not null
    check (total_score >= 0 and total_score <= 100),
  rank integer not null check (rank > 0),
  color_level text not null
    check (color_level in ('excellent', 'good', 'fair', 'weak')),
  structural_completeness integer not null
    check (structural_completeness >= 0 and structural_completeness <= 25),
  precision_clarity integer not null
    check (precision_clarity >= 0 and precision_clarity <= 25),
  exemplar_guidance integer not null
    check (exemplar_guidance >= 0 and exemplar_guidance <= 15),
  context_boundary_control integer not null
    check (context_boundary_control >= 0 and context_boundary_control <= 20),
  task_decomposition integer not null
    check (task_decomposition >= 0 and task_decomposition <= 15),
  taste jsonb not null default '{}'::jsonb,
  align jsonb not null default '{}'::jsonb,
  strengths jsonb not null default '[]'::jsonb,
  weaknesses jsonb not null default '[]'::jsonb,
  improvement_suggestions jsonb not null default '[]'::jsonb,
  summary text,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique(job_id, participant_id)
);

create index if not exists idx_evaluation_results_activity_rank
  on public.evaluation_results(activity_id, rank);
create index if not exists idx_evaluation_results_participant
  on public.evaluation_results(participant_id, created_at desc);

comment on table public.evaluation_results is 'Structured AI evaluation outputs per participant and submission version.';

-- ---------- helper view: latest submission preview ----------
create or replace view public.v_dashboard_latest_submission_preview as
select
  s.activity_id,
  s.participant_id,
  s.version,
  s.prompt_text,
  left(regexp_replace(s.prompt_text, '\s+', ' ', 'g'), 80) as preview_text,
  s.created_at
from public.submissions s
where s.is_latest = true;

comment on view public.v_dashboard_latest_submission_preview is 'Latest-submission preview text for dashboard aggregation.';

-- ---------- RLS ----------
alter table public.activities enable row level security;
alter table public.participants enable row level security;
alter table public.participant_sessions enable row level security;
alter table public.submissions enable row level security;
alter table public.evaluation_jobs enable row level security;
alter table public.evaluation_results enable row level security;

-- Intentionally no anon/authenticated business policies in v1.
-- Expected access pattern: trusted server-side APIs using service_role.

commit;
