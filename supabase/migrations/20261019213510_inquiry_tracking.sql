-- Session-scoped website measurement; never expose events or lead attribution to clients.
alter table public.dialed_submissions add column if not exists attribution jsonb;
create table public.inquiry_events (
  event_id uuid primary key,
  created_at timestamptz not null default now(),
  event text not null check (event in ('page_view','form_open','form_attempt','form_error','whatsapp_click')),
  session_id uuid not null,
  form_id uuid,
  form_type text check (form_type in ('BUY','SELL','TRADE','WATCH_DETAIL')),
  path text not null check (length(path) <= 200),
  landing_path text not null check (length(landing_path) <= 200),
  referrer_host text check (length(referrer_host) <= 253),
  utm_source text check (length(utm_source) <= 80),
  utm_medium text check (length(utm_medium) <= 80),
  utm_campaign text check (length(utm_campaign) <= 80),
  utm_content text check (length(utm_content) <= 80),
  device text check (device in ('mobile','desktop'))
);
alter table public.inquiry_events enable row level security;
revoke all on public.inquiry_events from public, anon, authenticated;
grant select, insert, delete on public.inquiry_events to service_role;
create index inquiry_events_created_at_idx on public.inquiry_events(created_at);
create index inquiry_events_form_id_idx on public.inquiry_events(form_id) where form_id is not null;

create function public.inquiry_analytics(p_days integer default 30)
returns jsonb language sql stable security invoker set search_path = '' as $$
with events as (
  select created_at, event, session_id::text, form_id::text, form_type, path,
    coalesce(utm_source, referrer_host, 'direct/unknown') as source,
    coalesce(utm_campaign, '(none)') as campaign
  from public.inquiry_events
  where created_at >= now() - make_interval(days => least(greatest(p_days, 1),90))
  union all
  select created_at, 'form_submit', attribution->>'session_id', attribution->>'form_id', submission_type,
    attribution->>'path', coalesce(attribution->>'utm_source', attribution->>'referrer_host', 'direct/unknown'),
    coalesce(attribution->>'utm_campaign', '(none)')
  from public.dialed_submissions
  where attribution->>'form_id' is not null
    and created_at >= now() - make_interval(days => least(greatest(p_days,1),90))
), forms as (
  select form_id, bool_or(event='form_open') as opened, bool_or(event='form_attempt') as attempted,
    bool_or(event='form_submit') as submitted, bool_or(event='form_error') as errored
  from events where form_id is not null group by form_id
), sources as (
  select source, campaign, count(distinct session_id) as sessions,
    count(distinct form_id) filter(where event='form_open') as forms_opened,
    count(*) filter(where event='form_submit') as inquiries,
    count(*) filter(where event='whatsapp_click') as whatsapp_clicks
  from events group by source, campaign order by inquiries desc, sessions desc limit 100
), pages as (
  select path, count(distinct session_id) as sessions,
    count(distinct form_id) filter(where event='form_open') as forms_opened,
    count(*) filter(where event='form_submit') as inquiries,
    count(*) filter(where event='whatsapp_click') as whatsapp_clicks
  from events group by path order by sessions desc limit 50
)
select jsonb_build_object(
  'days', least(greatest(p_days,1),90), 'generated_at', now(),
  'first_event_at', (select min(created_at) from public.inquiry_events),
  'totals', (select jsonb_build_object('sessions',count(distinct session_id),
    'page_views',count(*) filter(where event='page_view'),
    'inquiries',count(*) filter(where event='form_submit'),
    'whatsapp_clicks',count(*) filter(where event='whatsapp_click'),
    'whatsapp_sessions',count(distinct session_id) filter(where event='whatsapp_click')) from events),
  'funnel', (select jsonb_build_object('opened',count(*) filter(where opened),
    'attempted',count(*) filter(where opened and attempted),
    'completed',count(*) filter(where opened and submitted),
    'not_completed',count(*) filter(where opened and not submitted),
    'errors',count(*) filter(where errored),
    'submitted_without_open',count(*) filter(where submitted and not opened)) from forms),
  'sources',coalesce((select jsonb_agg(to_jsonb(sources)) from sources),'[]'::jsonb),
  'pages',coalesce((select jsonb_agg(to_jsonb(pages)) from pages),'[]'::jsonb)
);
$$;
revoke all on function public.inquiry_analytics(integer) from public, anon, authenticated;
grant execute on function public.inquiry_analytics(integer) to service_role;

-- Existing pg_cron installation: keep raw event retention bounded.
select cron.schedule('inquiry-events-retention','25 5 * * *',
  $job$delete from public.inquiry_events where created_at < now() - interval '90 days'$job$);
notify pgrst, 'reload schema';
