-- Add activity-level attendee participation mode.
-- allowlist keeps the existing roster-matching login flow.
-- anonymous lets first-time names create participant rows for the activity.

begin;

alter table public.activities
  add column if not exists participation_mode text not null default 'allowlist';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'activities_participation_mode_check'
      and conrelid = 'public.activities'::regclass
  ) then
    alter table public.activities
      add constraint activities_participation_mode_check
      check (participation_mode in ('allowlist', 'anonymous'));
  end if;
end;
$$;

comment on column public.activities.participation_mode is
  'Attendee entry mode: allowlist requires pre-imported names, anonymous auto-creates participants by first entered display name.';

commit;
