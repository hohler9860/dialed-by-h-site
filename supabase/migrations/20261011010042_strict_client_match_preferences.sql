create table public.client_match_preferences (
  want_id bigint primary key references public.client_wants(id) on delete cascade,
  preferences jsonb not null check (jsonb_typeof(preferences) = 'object'),
  source_hash text not null check (length(source_hash) = 64),
  confirmed_at timestamptz not null default now()
);
alter table public.client_match_preferences enable row level security;
revoke all on public.client_match_preferences from public, anon, authenticated;
grant select, insert, update on public.client_match_preferences to service_role;
comment on table public.client_match_preferences is 'Admin-confirmed structured sourcing constraints; expire after 30 days or source changes. No client notifications.';
