# Inquiry analytics

Private report: `/admin/analytics` (existing admin login), linked from the admin header. No Vercel Pro upgrade or new third-party analytics account is required.

## Measurement

- Browser events: `page_view`, `form_open`, `form_attempt`, `form_error`, `whatsapp_click`.
- Successful inquiries are counted from actual `dialed_submissions` rows with validated attribution. The public event endpoint rejects `form_submit`; browser thank-you UI is not proof of a saved inquiry.
- Each rendered form gets one random form ID. Retries preserve it. Completion pairs form IDs with successful submissions within the reporting window; repeated attempts do not inflate the opened-form count.
- Both homepage forms and the shared fallback modal implementation attach attribution. Actual WhatsApp link clicks are captured through delegated listeners; automatic error fallback navigation is not counted as a user click.
- First arrival in a tab session supplies UTM source/medium/campaign/content, landing path and an allowlisted referral host. Session IDs expire after 30 minutes of inactivity. No cross-device or persistent-person identification.
- Campaign URL example: `https://www.dialedbyhenry.com/source?utm_source=instagram&utm_medium=social&utm_campaign=bio`. Use short non-personal campaign labels. Do not put customer names or contact details in UTM parameters.

The report uses rolling 7/30/90-day windows and shows sources/campaigns and action pages. Sessions are not Vercel unique visitors. Direct/unknown is missing attribution, not necessarily typed traffic. A WhatsApp click is not proof of a message, and a saved inquiry is neither a qualified lead nor a sale. Forms without a completion may still be in progress. Historical inquiries are not backfilled.

## Architecture and security

Reuse `/api/submit-form?action=track` for event ingestion and `?action=analytics&days=30` for the authenticated report, avoiding another Vercel Hobby function. The frontend schema allowlists keys and strips query strings, field values and WhatsApp message text; the server independently repeats validation. Max body 4 KB. Server timestamps. UUID event IDs provide retry deduplication.

Production-only event writes, exact Origin checking, JSON content type, per-IP HMAC-derived rate-limit keys (120/10 minutes), a global 6,000/hour cap, bounded database timeouts, and fail-closed event ingestion. Measurement failures do not block navigation or form submissions. Like all client analytics, events can be blocked or spoofed and must not be used as financial evidence.

`inquiry_events` has RLS and no client grants. Its reporting RPC is SECURITY INVOKER and granted only to service_role. The admin API returns aggregates with `private, no-store`. No frontend service key. Browser Do Not Track and Global Privacy Control disable this new measurement and its attribution. The privacy page explains it. Raw events expire after 90 days via a daily pg_cron job; attribution stays with the existing inquiry record.

## Release and verification

Apply the additive migration before deploying the application. Existing submissions remain compatible when attribution is null. Run `node --test tests/inquiry-tracking.test.js` and `npm run build`. Verify no anon/authenticated table or function privileges, then check production event delivery and the admin report. Do not submit synthetic inquiries on production because existing submission flows send notifications.

Rollback application changes independently; retain the additive column/table until deciding retention. Stopping tracking does not require deleting customer inquiry records. Production smoke-test events should use a uniquely identified QA session and be removed by exact session ID after verification.
