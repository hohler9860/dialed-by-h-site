create function wholesale.client_match_candidate_pool(p_requests jsonb)
returns setof wholesale.listings
language sql stable security invoker
set search_path = pg_catalog, wholesale
set statement_timeout = '8s'
as $$
  select l.* from wholesale.listings l
  where l.message_ts >= now() - interval '3 days'
    and l.listing_type = 'FOR_SALE' and l.price_usd >= 500
    and exists (
      select 1 from jsonb_array_elements(p_requests) with ordinality q(r,n)
      where q.n <= 100 and coalesce(q.r->>'brand','') <> ''
        and case regexp_replace(upper(coalesce(l.brand,'')), '[^A-Z0-9]', '', 'g')
          when 'AP' then 'AUDEMARSPIGUET' when 'PP' then 'PATEKPHILIPPE'
          else regexp_replace(upper(coalesce(l.brand,'')), '[^A-Z0-9]', '', 'g') end = q.r->>'brand'
        and case when coalesce(q.r->>'reference','') <> '' then
          regexp_replace(upper(coalesce(l.reference,'')), '[^A-Z0-9]', '', 'g') = q.r->>'reference'
        else coalesce(q.r->>'model','') <> '' and
          regexp_replace(upper(coalesce(l.model,'')), '[^A-Z0-9]', '', 'g') = q.r->>'model'
        end
    )
  order by l.message_ts desc,l.id desc limit 10000
$$;
revoke all on function wholesale.client_match_candidate_pool(jsonb) from public, anon, authenticated;
grant execute on function wholesale.client_match_candidate_pool(jsonb) to service_role;
