-- Durable state for short Vercel invocations. No browser role can read it.
create table public.social_publisher_runtime (
  id smallint primary key default 1 check (id=1),
  state jsonb not null default '{}'::jsonb check (octet_length(state::text)<=12582912),
  paused boolean not null default true,
  control_version bigint not null default 0,
  lease_owner uuid,
  lease_until timestamptz,
  next_run_at timestamptz not null default now(),
  scheduler_heartbeat timestamptz,
  last_run_at timestamptz,
  scheduler_secret_hash text
);
alter table public.social_publisher_runtime enable row level security;
revoke all on public.social_publisher_runtime from public,anon,authenticated;
grant select,insert,update on public.social_publisher_runtime to service_role;
insert into public.social_publisher_runtime(id) values(1);

create function public.social_runtime_claim(p_owner uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.social_publisher_runtime;
begin
  select * into r from public.social_publisher_runtime where id=1 for update;
  if r.lease_owner is not null and r.lease_until>clock_timestamp() then return null; end if;
  update public.social_publisher_runtime set lease_owner=p_owner,lease_until=clock_timestamp()+interval '120 seconds' where id=1 returning * into r;
  return to_jsonb(r);
end $$;
create function public.social_runtime_save(p_owner uuid,p_state jsonb,p_next_run timestamptz,p_pause boolean,p_control_version bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.social_publisher_runtime;
begin
  select * into r from public.social_publisher_runtime where id=1 for update;
  if r.lease_owner is distinct from p_owner or r.lease_until<=clock_timestamp() then raise exception 'Publishing lease expired'; end if;
  if p_pause is true and not r.paused then r.paused=true;r.control_version=r.control_version+1; end if;
  if p_pause is false and r.control_version=p_control_version then r.paused=false; end if;
  update public.social_publisher_runtime set state=p_state,paused=r.paused,control_version=r.control_version,
    next_run_at=p_next_run,lease_until=clock_timestamp()+interval '120 seconds',last_run_at=clock_timestamp()
    where id=1;
  return jsonb_build_object('paused',r.paused,'control_version',r.control_version);
end $$;
create function public.social_runtime_release(p_owner uuid) returns void
language sql security invoker set search_path='' as $$
  update public.social_publisher_runtime set lease_owner=null,lease_until=null where id=1 and lease_owner=p_owner;
$$;
create function public.social_runtime_pause() returns void
language sql security invoker set search_path='' as $$
  update public.social_publisher_runtime set paused=true,control_version=control_version+1 where id=1;
$$;
create function public.social_runtime_heartbeat() returns void
language sql security invoker set search_path='' as $$
  update public.social_publisher_runtime set scheduler_heartbeat=clock_timestamp() where id=1;
$$;
revoke all on function public.social_runtime_claim(uuid),public.social_runtime_save(uuid,jsonb,timestamptz,boolean,bigint),public.social_runtime_release(uuid),public.social_runtime_pause(),public.social_runtime_heartbeat() from public,anon,authenticated;
grant execute on function public.social_runtime_claim(uuid),public.social_runtime_save(uuid,jsonb,timestamptz,boolean,bigint),public.social_runtime_release(uuid),public.social_runtime_pause(),public.social_runtime_heartbeat() to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('social-publisher-media','social-publisher-media',false,5242880,array['image/jpeg','image/png']);

create extension if not exists pg_net with schema extensions;
-- Raw scheduler credential stays in Vault, never in source or browser responses.
do $$
declare token text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
begin
  perform vault.create_secret(token,'social_publisher_scheduler','Authorization for the existing website publishing scheduler');
  update public.social_publisher_runtime set scheduler_secret_hash=encode(sha256(convert_to(token,'UTF8')),'hex') where id=1;
end $$;
select cron.schedule('social-publisher-tick','* * * * *', $cron$
  select net.http_post(
    url := 'https://www.dialedbyhenry.com/api/leads-admin',
    body := '{"action":"social-tick"}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='social_publisher_scheduler')),
    timeout_milliseconds := 55000
  );
$cron$);
-- Enable only after the Vercel endpoint passes production checks.
select cron.alter_job((select jobid from cron.job where jobname='social-publisher-tick'),active:=false);
