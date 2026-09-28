-- Books: split consignment deals from sourcing deals.
-- Sourcing = Henry buys the watch and resells it (his money at risk).
-- Consignment = he sells a client's watch and keeps a fee; buy_total holds
-- the payout to the consignor, so margin is the fee, not a trading margin.
-- Revenue still counts both. Margins are never blended across the two.
alter table public.dbh_deals
    add column if not exists deal_type text not null default 'Sourcing';

alter table public.dbh_deals
    drop constraint if exists dbh_deals_deal_type_check;
alter table public.dbh_deals
    add constraint dbh_deals_deal_type_check
    check (deal_type in ('Sourcing', 'Consignment'));

-- DBH-2026-007 (Vacheron Overseas for Shamik Patel) was a consignment.
update public.dbh_deals set deal_type = 'Consignment' where ref = 'DBH-2026-007';
