-- STEP F: make wholesale search fast for good. The search does five
-- "contains" text matches (brand, model, reference, nickname, seller) which
-- ordinary indexes cannot serve. Trigram indexes can. ~20 seconds total.
create extension if not exists pg_trgm;
create index if not exists listings_brand_trgm     on wholesale.listings using gin (brand gin_trgm_ops);
create index if not exists listings_model_trgm     on wholesale.listings using gin (model gin_trgm_ops);
create index if not exists listings_reference_trgm on wholesale.listings using gin (reference gin_trgm_ops);
create index if not exists listings_nickname_trgm  on wholesale.listings using gin (nickname gin_trgm_ops);
create index if not exists listings_seller_trgm    on wholesale.listings using gin (seller_name gin_trgm_ops);
analyze wholesale.listings;
select indexname from pg_indexes where schemaname='wholesale' and indexname like 'listings_%_trgm';
