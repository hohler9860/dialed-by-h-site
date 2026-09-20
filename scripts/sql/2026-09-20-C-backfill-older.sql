-- STEP C: backfill brand/model from the rules for listings created before 1 Sep 2026.
-- One update per rule (each one fast scan) instead of one giant regex join.
-- Shortest pattern first so the most specific rule wins last.
-- Skips rows corrected by hand. Safe to re-run.
do $$
declare r record;
begin
  for r in select pattern, brand, model from wholesale.ref_rules order by length(pattern), pattern loop
    update wholesale.listings l
       set brand = r.brand, model = r.model
     where l.reference ~ r.pattern
       and l.created_at < '2026-09-01'
       and (l.brand is distinct from r.brand or l.model is distinct from r.model)
       and coalesce(l.corrected_fields::text, '') !~ '(brand|model)';
  end loop;
end $$;

-- check: should come back 0
select count(*) as still_wrong_daytona from wholesale.listings
where model = 'Daytona' and reference !~ '^M?1[12]65' and created_at < '2026-09-01';
