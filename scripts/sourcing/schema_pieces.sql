-- Hand-rolled CMS for "Pieces for Sourcing" — replaces the Notion database.
--
-- Run this ONCE in the Supabase SQL editor for the DBH project
-- (untnrofsnmoyxdidxbdj), not the BWC project.
--
-- Design notes:
--  * id is the piece's ORIGINAL Notion page UUID. pieceSlug() in api/_pieces.js
--    builds the public /watch/<slug> URL from the last 6 hex chars of this id,
--    so preserving it keeps every indexed URL byte-identical. New pieces created
--    in the admin get a fresh uuid and slug the same way.
--  * images holds FULL public Supabase Storage URLs, already background-processed.
--    The browser loads them straight from Supabase's CDN — no serverless function,
--    no per-image lookup, no signed URL that expires.
--  * Derived fields (slug, details) are intentionally NOT stored. They stay
--    computed in api/_pieces.js exactly as they are today, so nothing renders
--    differently after the cutover.
--  * RLS on with zero policies = service-role access only. The site reads through
--    the server-side snapshot, never from the browser, so the catalog is not
--    directly queryable by the public.

create table if not exists public.pieces (
    id              uuid primary key default gen_random_uuid(),

    -- identity
    piece           text not null default '',   -- Notion "Piece" (title)
    brand           text not null default '',
    model           text not null default '',
    nickname        text not null default '',
    ref             text not null default '',   -- "Reference Number"

    -- specs
    case_material   text not null default '',
    case_size_mm    numeric,                    -- rendered as "<n>mm"
    dial_color      text not null default '',
    bracelet        text not null default '',   -- "Bracelet/Strap"
    condition       text not null default '',
    set_included    text not null default '',   -- Notion "Set" ("set" is reserved)
    year            numeric,

    -- merchandising
    collections     text[] not null default '{}',  -- Notion "Collection" multi-select
    celebs          text[] not null default '{}',  -- Notion "Celebrity" multi-select
    tags            text not null default '',

    -- media: full public Storage URLs, pre-processed webp, order matters.
    -- images         = 900px piece centered on #0d0d0d (buy grid, watch pages)
    -- images_cutout  = 520px transparent (homepage ticker, celeb card fallback).
    --                  Falls back to the standard URL for opaque photos, which
    --                  have no meaningful cutout — same as the old ?mode=cutout.
    images          text[] not null default '{}',
    images_cutout   text[] not null default '{}',

    -- housekeeping
    sort_order      integer,                    -- preserves the Notion created_time order
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- The catalog is served in a stable order; Notion sorted by created_time asc.
create index if not exists pieces_sort_order_idx on public.pieces (sort_order nulls last, created_at);
create index if not exists pieces_brand_idx      on public.pieces (brand);

-- Keep updated_at honest so the admin can show "last edited".
create or replace function public.pieces_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists pieces_touch_updated_at on public.pieces;
create trigger pieces_touch_updated_at
    before update on public.pieces
    for each row execute function public.pieces_touch_updated_at();

-- Service-role only. No public policies by design.
alter table public.pieces enable row level security;
