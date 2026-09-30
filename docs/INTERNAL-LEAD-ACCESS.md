# Internal lead access containment

Prepared September 30, 2026 for Supabase project `untnrofsnmoyxdidxbdj`. Production application requires Henry's explicit approval of this exact access change. The parent task is the sole production executor.

## Change

Run `scripts/sql/restrict-internal-lead-access.sql` through Supabase `apply_migration` with name `restrict_internal_lead_access` after approval. It atomically revokes EXECUTE from PUBLIC, anon and authenticated on:

- public.day_summary()
- public.identity_health()
- public.refresh_empty_wants()
- public.repair_want_brands()
- public.save_lead_agreement(uuid,text,text)
- public.save_lead_brief(uuid,jsonb,jsonb,text,text,timestamp with time zone)
- public.save_lead_brief(uuid,jsonb,jsonb,text,text,timestamp with time zone,text)
- public.upsert_wa_lead(text,text,text)

It preserves service_role execution, revokes all PUBLIC/anon/authenticated privileges on public.lead_stage, preserves service_role SELECT, and sets security_invoker=true. Function bodies, rows, underlying table grants/policies, public form submission and unrelated objects remain unchanged. postgres ownership/access remains.

## Verified caller evidence

- api/leads-admin.js:14,71,81,348: uses SUPABASE_SERVICE_ROLE_KEY in both API key and bearer headers, guarded by ADMIN_PASSWORD before internal actions.
- api/leads-admin.js:368: lead_stage used by list.
- api/leads-admin.js:1458: identity_health used by accuracy.
- api/leads-admin.js:1498: day_summary used by today.
- scripts/whatsapp-reconcile.js:40, email-reconcile.js:34 and imessage-reconcile.js:45 all require service-role credentials. These reconcile directly against tables; no calls to targeted write RPCs found.
- No browser callers to the restricted objects found. No repository caller to the five write/maintenance function names found. No deployed Supabase Edge Functions reported.
- External n8n/other automation credentials and direct database users were not inspected. Any external caller using anon/authenticated will lose access intentionally; migrate trusted workflows to existing server-side service credentials after verifying ownership. Do not put service credentials in browser code.

No application caller changes are needed for verified website flows.

## Deployed metadata verification

Catalog-only reads confirmed PostgreSQL 17.6, all eight functions SECURITY DEFINER owned by postgres, all granting EXECUTE to PUBLIC; the seven-argument brief additionally grants anon/authenticated explicitly. All eight are effectively executable by anon, authenticated and service_role. lead_stage has all table privileges for anon/authenticated/service_role, no column ACLs, and no security_invoker option. service_role has BYPASSRLS and SELECT on dialed_submissions and lead_drafts, preserving the view's legitimate internal behavior under security_invoker.

No business RPC, customer-row query, live form or HTTP exposure probe was executed. This establishes unauthorized permissions, not exploitation.

## Verification and operational limits

- `node --test test/internal-lead-access.test.js`: synthetic network mocks verify unauthorized list/today/accuracy calls fail before any fetch, and authorized calls to lead_stage/day_summary/identity_health use service-role headers.
- Forward SQL contains catalog-only assertions; missing objects, inherited unwanted privileges or missing service view prerequisites abort the transaction.
- After applying, execute `scripts/sql/verify-internal-lead-access.sql` via execute_sql. It runs in a read-only transaction and checks effective privileges, column grants and the view option without selecting customer rows or invoking business RPCs.
- Then run Supabase get_advisors(type=security); expect targeted anonymous-function and lead_stage SECURITY DEFINER findings to disappear. Report unrelated remaining findings separately.
- No local Supabase CLI, psql or Docker was available; the SQL has not been executed against a local fixture. Fresh deployed metadata verifies exact signatures and compatibility. No production permission changes were made by the preparation task.
- lock_timeout=5s and statement_timeout=30s bound lock waits. A failed transaction leaves the prior permissions intact; do not silently retry without reviewing the failure.

Manual SQL lives with the repository's existing scripts/sql runbooks. Supabase apply_migration records production migration history. No CLI-generated migration filename was fabricated because the CLI was unavailable.

## Rollback

`scripts/sql/rollback-internal-lead-access.sql` restores the exact observed exposed ACLs and removes the newly set view option. It does not alter customer rows or function bodies. Reopening these grants is unsafe and requires separate explicit approval. Prefer fixing a legitimate external caller's server credentials over rolling back containment.

Future functions in public still inherit existing default privileges; this targeted change does not change schema-wide defaults. Future function recreation or explicit grants must preserve these restrictions. Broader default-privilege hardening requires a separate caller review.

References: https://supabase.com/docs/guides/database/functions and https://supabase.com/docs/guides/database/postgres/row-level-security. Current docs reviewed. Changelog markdown fetch unavailable (web content-type rejection and local DNS restriction).
