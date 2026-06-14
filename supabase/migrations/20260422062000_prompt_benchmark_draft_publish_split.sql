begin;

alter table public.participants
  add column if not exists latest_published_version integer not null default 0
    check (latest_published_version >= 0);

create index if not exists idx_participants_activity_published_version
  on public.participants(activity_id, latest_published_version);

update public.participants
set latest_published_version = latest_submission_version,
    updated_at = timezone('utc'::text, now())
where latest_published_version = 0
  and latest_submission_version > 0
  and status in ('submitted', 'evaluating', 'scored');

alter table public.evaluation_jobs
  add column if not exists submission_scope text not null default 'published'
    check (submission_scope in ('published', 'latest_submission')),
  add column if not exists target_participant_id uuid references public.participants(id) on delete cascade;

create index if not exists idx_evaluation_jobs_scope
  on public.evaluation_jobs(activity_id, submission_scope, target_participant_id, created_at desc);

create or replace view public.v_dashboard_latest_submission_preview as
select
  p.activity_id,
  p.id as participant_id,
  s.version,
  s.prompt_text,
  left(regexp_replace(s.prompt_text, '\s+', ' ', 'g'), 80) as preview_text,
  s.created_at
from public.participants p
join public.submissions s
  on s.activity_id = p.activity_id
 and s.participant_id = p.id
 and s.version = p.latest_published_version
where p.latest_published_version > 0;

comment on view public.v_dashboard_latest_submission_preview is 'Latest published-submission preview text for dashboard aggregation.';

commit;
