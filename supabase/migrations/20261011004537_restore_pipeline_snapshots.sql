-- Restore only the two requested snapshots, with bounded, staggered jobs.
set local lock_timeout = '1s';
set local statement_timeout = '15s';

create table wholesale.admin_snapshot_refreshes (
    name text primary key check (name in ('pipeline_health', 'model_scorecard')),
    refreshed_at timestamptz not null
);
alter table wholesale.admin_snapshot_refreshes enable row level security;
revoke all on wholesale.admin_snapshot_refreshes from public, anon, authenticated;
grant select on wholesale.admin_snapshot_refreshes to service_role;

create unique index pipeline_health_step_uidx on wholesale.pipeline_health (step);
create unique index model_scorecard_model_uidx on wholesale.model_scorecard (model);
-- The group-first index cannot efficiently serve max(message_ts) or a global
-- time window. This also benefits the existing live Pipeline snapshot.
create index if not exists messages_message_ts_idx on wholesale.messages (message_ts desc);

create function wholesale.refresh_admin_snapshot(p_name text)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, wholesale
as $$
begin
    if p_name not in ('pipeline_health', 'model_scorecard') or p_name is null then
        raise exception 'Unknown admin snapshot';
    end if;
    if not pg_try_advisory_xact_lock(hashtext('dbh-admin-snapshot:' || p_name)) then
        return false;
    end if;
    if p_name = 'pipeline_health' then
        refresh materialized view concurrently wholesale.pipeline_health;
    else
        refresh materialized view concurrently wholesale.model_scorecard;
    end if;
    insert into wholesale.admin_snapshot_refreshes(name, refreshed_at)
    values (p_name, clock_timestamp())
    on conflict (name) do update set refreshed_at = excluded.refreshed_at;
    return true;
end;
$$;
revoke all on function wholesale.refresh_admin_snapshot(text) from public, anon, authenticated, service_role;

select cron.schedule('refresh-pipeline-health', '*/15 * * * *',
    $job$set statement_timeout = '8s'; set lock_timeout = '1s'; select wholesale.refresh_admin_snapshot('pipeline_health');$job$);
select cron.schedule('refresh-model-scorecard', '7 */6 * * *',
    $job$set statement_timeout = '8s'; set lock_timeout = '1s'; select wholesale.refresh_admin_snapshot('model_scorecard');$job$);
