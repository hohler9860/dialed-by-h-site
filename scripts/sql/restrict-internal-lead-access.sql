-- APPROVAL REQUIRED before production application. No customer-data writes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

REVOKE EXECUTE ON FUNCTION public.day_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.day_summary() TO service_role;
REVOKE EXECUTE ON FUNCTION public.identity_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.identity_health() TO service_role;
REVOKE EXECUTE ON FUNCTION public.refresh_empty_wants() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_empty_wants() TO service_role;
REVOKE EXECUTE ON FUNCTION public.repair_want_brands() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repair_want_brands() TO service_role;
REVOKE EXECUTE ON FUNCTION public.save_lead_agreement(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_lead_agreement(uuid,text,text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.save_lead_brief(uuid,jsonb,jsonb,text,text,timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_lead_brief(uuid,jsonb,jsonb,text,text,timestamp with time zone) TO service_role;
REVOKE EXECUTE ON FUNCTION public.save_lead_brief(uuid,jsonb,jsonb,text,text,timestamp with time zone,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_lead_brief(uuid,jsonb,jsonb,text,text,timestamp with time zone,text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.upsert_wa_lead(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_wa_lead(text,text,text) TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.lead_stage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.lead_stage TO service_role;
ALTER VIEW public.lead_stage SET (security_invoker = true);

-- Catalog assertions only: never executes business functions or selects lead rows.
DO $check$
DECLARE sig text; role_name text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.day_summary()',
    'public.identity_health()',
    'public.refresh_empty_wants()',
    'public.repair_want_brands()',
    'public.save_lead_agreement(uuid,text,text)',
    'public.save_lead_brief(uuid,jsonb,jsonb,text,text,timestamp with time zone)',
    'public.save_lead_brief(uuid,jsonb,jsonb,text,text,timestamp with time zone,text)',
    'public.upsert_wa_lead(text,text,text)'
  ] LOOP
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_function_privilege(role_name, sig, 'EXECUTE') THEN
        RAISE EXCEPTION 'Unexpected execute privilege: % %', role_name, sig;
      END IF;
    END LOOP;
    IF NOT has_function_privilege('service_role', sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'Missing service execute privilege: %', sig;
    END IF;
  END LOOP;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_table_privilege(role_name, 'public.lead_stage', 'SELECT')
       OR has_any_column_privilege(role_name, 'public.lead_stage', 'SELECT') THEN
      RAISE EXCEPTION 'Unexpected view read privilege: %', role_name;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role','public.lead_stage','SELECT')
     OR NOT has_table_privilege('service_role','public.dialed_submissions','SELECT')
     OR NOT has_table_privilege('service_role','public.lead_drafts','SELECT')
     OR NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role') THEN
    RAISE EXCEPTION 'Service view prerequisites missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.lead_stage'::regclass
                 AND reloptions @> ARRAY['security_invoker=true']) THEN
    RAISE EXCEPTION 'lead_stage must use security_invoker';
  END IF;
END
$check$;

COMMIT;
