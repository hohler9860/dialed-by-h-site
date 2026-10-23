-- Starbucks buyer watch (2026-10-23)
--
-- Henry is selling a 126610LV. When a dealer in any tracked group posts a buy
-- request for one (WTB / NTQ / ISO / looking for / need / sold order), ping
-- him on WhatsApp right away so he can DM them first.
--
-- Path: insert on wholesale.messages -> this trigger -> pg_net POST -> n8n
-- "WA watch: Starbucks buyers -> Henry" [lernxYhKLNStrj7Q] -> Evolution
-- sendText to his own number. The webhook URL lives in Vault as
-- 'wa_watch_webhook_url' (its path is the only secret).
--
-- Kill switch:
--   alter table wholesale.messages disable trigger messages_watch_starbucks;

create table if not exists wholesale.watch_alerts (
  id             bigint generated always as identity primary key,
  message_pk     bigint not null unique,
  group_jid      text,
  sender_jid     text,
  sender_name    text,
  body           text,
  body_hash      text not null,
  net_request_id bigint,
  sent_at        timestamptz not null default now()
);
create index if not exists watch_alerts_sender_idx on wholesale.watch_alerts (sender_jid, sent_at desc);
create index if not exists watch_alerts_hash_idx on wholesale.watch_alerts (body_hash, sent_at desc);
alter table wholesale.watch_alerts enable row level security;

-- Pure matcher, kept separate so it can be backtested against history.
-- The buy word has to come BEFORE the 126610LV mention: HK stock lists end
-- with a "Looking for: ..." section, and their own 126610LV sits above it.
create or replace function wholesale.starbucks_want(p_body text, p_group text)
returns boolean language sql immutable as $$
  select coalesce(
    p_body ~* (
      '((^|[^a-z])(wtb|ntq|iso|lf)([^a-z]|$)'
      || '|looking\s+(to\s+buy|for)(?!\s+(offers?|trades?|a\s+trade))'
      || '|in\s+search|searching|(^|[^a-z])buying([^a-z]|$)|sold\s+order'
      || '|who\s+(has|got)|any\s*(one|body)\s+(have|has|got)'
      || '|(^|\n)\W*(need|want)([^a-z]|$))'
      || '.*(starbuck|126610\s*-?\s*lv)')
    -- a bare "Starbucks" posted in a WTB-only group is a want too
    or (p_group ~* '(wtb|ntq)' and length(p_body) <= 40
        and p_body ~* '(starbuck|126610\s*-?\s*lv)'
        and p_body !~* '(\$|[0-9]\s*k([^a-z]|$)|[0-9],[0-9]{3}|(^|[^a-z])(have|stock|available)([^a-z]|$))'),
    false)
$$;

create or replace function wholesale.watch_starbucks()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_group text;
  v_phone text;
  v_hash  text;
  v_text  text;
  v_url   text;
  v_req   bigint;
begin
  -- A WhatsApp re-link backfills days of history; those posts are stale.
  if new.message_ts < now() - interval '3 hours' then
    return new;
  end if;

  select g.name into v_group from wholesale.groups g where g.jid = new.group_jid;
  if not wholesale.starbucks_want(new.body, coalesce(v_group, '')) then
    return new;
  end if;

  -- Dealers cross-post the same want into 2-4 groups within minutes, and some
  -- repost a "buying for stock" list daily: one ping per dealer per day, and
  -- the same text at most once a week.
  v_hash := md5(lower(regexp_replace(new.body, '\s+', ' ', 'g')));
  if exists (select 1 from wholesale.watch_alerts a
             where (a.sender_jid = new.sender_jid and a.sent_at > now() - interval '24 hours')
                or (a.body_hash = v_hash and a.sent_at > now() - interval '7 days')) then
    return new;
  end if;

  select regexp_replace(d.phone, '\D', '', 'g') into v_phone
  from wholesale.dealers d where d.lid = new.sender_jid and d.phone is not null limit 1;
  if v_phone is null and new.sender_jid like '%@s.whatsapp.net' then
    v_phone := split_part(new.sender_jid, '@', 1);
  end if;

  v_text := '☕ Starbucks buyer' || chr(10)
         || coalesce(v_group, 'Unknown group') || ' · ' || coalesce(new.sender_name, 'unknown') || chr(10) || chr(10)
         || '"' || left(new.body, 600) || '"'
         || case when v_phone is not null then chr(10) || chr(10) || 'DM: https://wa.me/' || v_phone else '' end;

  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'wa_watch_webhook_url';
  if v_url is not null then
    v_req := net.http_post(url := v_url, body := jsonb_build_object('text', v_text, 'message_pk', new.id));
  end if;

  insert into wholesale.watch_alerts (message_pk, group_jid, sender_jid, sender_name, body, body_hash, net_request_id)
  values (new.id, new.group_jid, new.sender_jid, new.sender_name, new.body, v_hash, v_req)
  on conflict (message_pk) do nothing;

  return new;
exception when others then
  -- Never let an alert problem block ingest.
  raise warning 'watch_starbucks failed on message %: %', new.id, sqlerrm;
  return new;
end $$;

drop trigger if exists messages_watch_starbucks on wholesale.messages;
create trigger messages_watch_starbucks
  after insert on wholesale.messages
  for each row
  when (new.body ~* '(starbuck|126610\s*-?\s*lv)')
  execute function wholesale.watch_starbucks();
