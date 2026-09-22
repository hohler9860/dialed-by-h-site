-- STEP G: ease the Disk IO budget. The admin snapshots refresh every 2 / 10
-- minutes; each refresh re-reads the whole listings table. Nobody needs the
-- Accuracy numbers fresher than half an hour. Health stays at 5 minutes.
-- (cron.schedule with an existing name replaces that job's schedule.)
select cron.schedule('refresh-pipeline-health', '*/5 * * * *',
  $$refresh materialized view wholesale.pipeline_health$$);
select cron.schedule('refresh-admin-views', '*/30 * * * *',
  $$refresh materialized view wholesale.model_scorecard;
    refresh materialized view wholesale.field_coverage;
    refresh materialized view wholesale.contested_refs;
    refresh materialized view wholesale.extraction_samples$$);
select jobname, schedule from cron.job order by jobname;
