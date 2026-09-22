-- STEP E2 (v2): materialize the five heavy admin views IN THE BACKGROUND.
-- Building all five in one editor call exceeded the dashboard's time limit,
-- so this hands the work to pg_cron: one view per minute tick, then it
-- schedules the refresh jobs and removes itself. The editor call returns
-- instantly; the whole thing is done ~6 minutes later.

create or replace function wholesale.materialize_admin_views_step()
returns text language plpgsql as $$
declare v text; done int := 0;
begin
  foreach v in array array['pipeline_health','model_scorecard','field_coverage','contested_refs','extraction_samples'] loop
    if exists (select 1 from pg_matviews where schemaname='wholesale' and matviewname=v) then
      done := done + 1; continue;               -- already materialized
    end if;
    if exists (select 1 from pg_views where schemaname='wholesale' and viewname=v) then
      execute format('alter view wholesale.%I rename to %I', v, v||'_live');
    end if;
    execute format('create materialized view wholesale.%I as select * from wholesale.%I', v, v||'_live');
    execute format('grant select on wholesale.%I to service_role, authenticated, anon', v);
    if v = 'extraction_samples' then
      create index if not exists extraction_samples_created_idx on wholesale.extraction_samples (created_at desc);
      create index if not exists extraction_samples_trust_idx   on wholesale.extraction_samples (trust_score);
    end if;
    return 'materialized ' || v;                -- one per tick keeps each run short
  end loop;

  -- all five exist: install the refresh jobs and retire this stepper
  perform cron.unschedule(jobid) from cron.job where jobname in ('refresh-pipeline-health','refresh-admin-views','materialize-admin-views');
  perform cron.schedule('refresh-pipeline-health', '*/2 * * * *',
    $j$refresh materialized view wholesale.pipeline_health$j$);
  perform cron.schedule('refresh-admin-views', '*/10 * * * *',
    $j$refresh materialized view wholesale.model_scorecard;
       refresh materialized view wholesale.field_coverage;
       refresh materialized view wholesale.contested_refs;
       refresh materialized view wholesale.extraction_samples$j$);
  return 'all five materialized; refresh jobs installed';
end $$;

-- run the stepper every minute until it retires itself (~6 minutes)
select cron.schedule('materialize-admin-views', '* * * * *',
  $$select wholesale.materialize_admin_views_step()$$);

-- progress check, re-run any time: lists which of the five are done
select matviewname as materialized_so_far from pg_matviews
where schemaname = 'wholesale'
  and matviewname in ('pipeline_health','model_scorecard','field_coverage','contested_refs','extraction_samples');
