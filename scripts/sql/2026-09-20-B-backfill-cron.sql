-- STEP B (replaces old B + C): background backfill of brand/model from
-- wholesale.ref_rules. A one-minute pg_cron job fixes 4,000 listings per tick
-- and unschedules itself when every listing has been checked. ~35 minutes
-- for 130k rows. Nothing here blocks the editor for more than a second.

-- progress marker (nullable, so adding it is instant)
alter table wholesale.listings add column if not exists ref_rules_pass smallint;

create or replace function wholesale.apply_ref_rules_batch(p_batch int default 4000)
returns int language plpgsql as $$
declare n int;
begin
  with cand as (
    select id from wholesale.listings
    where ref_rules_pass is null
    order by id
    limit p_batch
  ),
  best as (
    select c.id,
           (select r.brand from wholesale.ref_rules r
              where l.reference ~ r.pattern order by length(r.pattern) desc limit 1) as brand,
           (select r.model from wholesale.ref_rules r
              where l.reference ~ r.pattern order by length(r.pattern) desc limit 1) as model,
           l.brand as old_brand, l.model as old_model, l.corrected_fields
    from cand c join wholesale.listings l on l.id = c.id
  )
  update wholesale.listings l
     set ref_rules_pass = 1,
         brand = case when b.brand is not null
                       and coalesce(b.corrected_fields::text,'') !~ '(brand|model)'
                      then b.brand else l.brand end,
         model = case when b.brand is not null
                       and coalesce(b.corrected_fields::text,'') !~ '(brand|model)'
                      then b.model else l.model end
    from best b
   where l.id = b.id;
  get diagnostics n = row_count;
  if n = 0 then
    perform cron.unschedule('ref-rules-backfill');
  end if;
  return n;
end $$;

-- run one batch right now so you see it work (prints rows processed)
select wholesale.apply_ref_rules_batch(2000) as processed_now;

-- then every minute until done
select cron.schedule('ref-rules-backfill', '* * * * *',
  $$select wholesale.apply_ref_rules_batch(4000)$$);

-- progress check (re-run any time): remaining should fall to 0
select count(*) filter (where ref_rules_pass is null) as remaining,
       count(*) filter (where model = 'Daytona' and reference !~ '^M?1[12]65') as still_wrong_daytona
from wholesale.listings;
