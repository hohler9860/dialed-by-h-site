-- EMERGENCY ONLY: restores the exposed permissions observed 2026-09-30.
-- Requires separate explicit approval; reopens unauthorized access.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
GRANT EXECUTE ON FUNCTION public.day_summary() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.identity_health() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_empty_wants() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.repair_want_brands() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_lead_agreement(uuid,text,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_lead_brief(uuid,jsonb,jsonb,text,text,timestamp with time zone) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_lead_brief(uuid,jsonb,jsonb,text,text,timestamp with time zone,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_wa_lead(text,text,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_lead_brief(uuid,jsonb,jsonb,text,text,timestamp with time zone,text) TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.lead_stage TO anon, authenticated;
ALTER VIEW public.lead_stage RESET (security_invoker);
COMMIT;
