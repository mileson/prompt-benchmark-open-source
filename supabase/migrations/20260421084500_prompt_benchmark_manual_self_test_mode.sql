begin;

update public.activities
set auto_evaluate_enabled = false,
    updated_at = timezone('utc'::text, now())
where slug = 'prompt-benchmark'
  and auto_evaluate_enabled is distinct from false;

commit;
