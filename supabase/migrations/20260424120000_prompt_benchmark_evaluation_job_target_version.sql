begin;

alter table public.evaluation_jobs
  add column if not exists target_submission_version integer
    check (target_submission_version is null or target_submission_version > 0);

create index if not exists idx_evaluation_jobs_target_version
  on public.evaluation_jobs(activity_id, target_participant_id, target_submission_version, created_at desc);

update public.evaluation_jobs as jobs
set target_submission_version = case
  when jobs.submission_scope = 'published' then participants.latest_published_version
  else participants.latest_submission_version
end
from public.participants as participants
where jobs.target_submission_version is null
  and jobs.target_participant_id = participants.id;

commit;
