create table public.client_match_feedback (
  want_id bigint not null references public.client_wants(id) on delete cascade,
  listing_id bigint not null references wholesale.listings(id) on delete cascade,
  evidence_hash text not null check (length(evidence_hash) = 64),
  engine_version text not null,
  decision text not null check (decision in ('FIT','REJECT')),
  reason text not null,
  reviewed_at timestamptz not null default now(),
  primary key (want_id,listing_id,evidence_hash,engine_version)
);
alter table public.client_match_feedback enable row level security;
revoke all on public.client_match_feedback from public,anon,authenticated;
grant select,insert,update on public.client_match_feedback to service_role;
comment on table public.client_match_feedback is 'Human labeled matching evidence. Fit is not a quote or availability approval. Changed evidence invalidates feedback.';
