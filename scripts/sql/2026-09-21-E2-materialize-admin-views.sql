-- STEP E2: the five admin views that scan the whole listings table are
-- recomputed on every tab click and now exceed the 8s statement timeout.
-- Turn each into a materialized view (a stored result) refreshed by pg_cron,
-- so the tabs read a snapshot in milliseconds. The API keeps the same names.
do $$
declare v text;
begin
  foreach v in array array['pipeline_health','model_scorecard','field_coverage','contested_refs','extraction_samples'] loop
    if exists (select 1 from pg_views where schemaname='wholesale' and viewname=v) then
      execute format('alter view wholesale.%I rename to %I', v, v||'_live');
      execute format('create materialized view wholesale.%I as select * from wholesale.%I', v, v||'_live');
      execute format('grant select on wholesale.%I to service_role, authenticated, anon', v);
    end if;
  end loop;
end $$;

-- indexes the Accuracy tab sorts/filters on
create index if not exists extraction_samples_created_idx on wholesale.extraction_samples (created_at desc);
create index if not exists extraction_samples_trust_idx   on wholesale.extraction_samples (trust_score);

-- refresh: health every 2 minutes (it reports freshness), the rest every 10
select cron.schedule('refresh-pipeline-health', '*/2 * * * *',
  $$refresh materialized view wholesale.pipeline_health$$);
select cron.schedule('refresh-admin-views', '*/10 * * * *',
  $$refresh materialized view wholesale.model_scorecard;
    refresh materialized view wholesale.field_coverage;
    refresh materialized view wholesale.contested_refs;
    refresh materialized view wholesale.extraction_samples$$);

-- sanity: all five now answer instantly
select (select count(*) from wholesale.pipeline_health)  as health_rows,
       (select count(*) from wholesale.model_scorecard)  as scorecard_rows,
       (select count(*) from wholesale.field_coverage)   as coverage_rows,
       (select count(*) from wholesale.contested_refs)   as contested_rows,
       (select count(*) from wholesale.extraction_samples) as sample_rows;
