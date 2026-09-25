# Social publishing on the existing website

Admin → Social uses this site's Vercel deployment and existing Supabase project. There is no separate publisher host, Postiz service, or `SOCIAL_POSTER_URL` connection to configure. Node 24 is required. The `/api/leads-admin` function serves the authenticated controls, X OAuth flow, and scheduler. No additional Vercel function is added.

## Connect X and drafting

1. Open `https://www.dialedbyhenry.com/admin/#social` and select **Connections & settings**.
2. In an X developer app, enable OAuth 2.0 user authentication with read/write access and set this exact callback URL:
   `https://www.dialedbyhenry.com/api/leads-admin?action=social-x-callback`
3. Save the app's OAuth client ID and client secret in the admin. Save an OpenAI API key to enable drafting. Leave saved credential inputs blank to keep their values. Provider usage is separate from website hosting.
4. Choose **Connect @dialedbyh** and authorize on X. The callback must return that handle and the originally pinned numeric account ID. An account mismatch fails closed.
5. Review the proposed content, choose future slots, and approve it. Start in review mode. Autonomous mode generates drafts and independently checks them, holding weak or unsupported posts. Publishing remains paused until **Resume publishing** verifies the connected account.

No X credentials, AI key, or tokens are sent back in dashboard responses. The code uses existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ADMIN_PASSWORD` server variables. Credentials use AES-GCM with a domain-separated key derived from the service-role key. An optional `SOCIAL_ENCRYPTION_KEY` can provide a dedicated 64-hex key; set it before connecting accounts. Changing either effective encryption key later requires migrating encrypted credentials or reconnecting accounts, not silently replacing it.

## Execution and durability

The `social_publisher_runtime` migration creates a service-role-only singleton table, fenced lease RPCs, a private media bucket, and an initially disabled `social-publisher-tick` cron job. Anonymous and authenticated browser roles have no grants on the table or RPCs. The RLS advisor's “enabled without policies” informational entry is intentional: only the bypass-RLS service role can access this state.

Supabase pg_cron calls the existing Vercel endpoint once per minute via pg_net. Its separate bearer credential is stored in Vault; only its SHA-256 hash is in runtime metadata. Enable the named cron job only after deployment checks pass. Existing website cron jobs are unchanged. A paused, healthy worker still reports its heartbeat. Scheduling normally runs within a minute of the chosen time, not at an exact second. Runs lost during a database restart are picked up by later ticks. Slots more than 30 minutes late expire for review.

Each invocation restores the queue into an in-memory SQLite rules engine. Its snapshot is persisted in Postgres, never on Vercel's ephemeral filesystem. Private images are saved to Supabase Storage. A 120-second fenced lease serializes writers; pause is a separate atomic control and wins against an in-flight resume. Provider operations are bounded by a 40-second work deadline under the existing 60-second Vercel limit. Research processes one feed at a time; draft generation is queued and awaited by a later tick. Nothing relies on an unawaited background promise.

Before provider calls, the server durably saves intent and checks the lease. X identity is checked before publishing. An accepted X post ID is saved and a separate readback verifies author and text. If a server dies or X times out after a possible send, the post becomes **uncertain**, publishing pauses, and it is never automatically resent. The admin must inspect X and reconcile it. A pause cannot recall a request X has already received.

Queue state is capped at 8 MiB. Old unreferenced feed extracts and excess event logs are pruned; authored drafts, published records, and first-party source notes are retained. Monitor storage growth and archive deliberately before the cap is reached. This single-account publisher uses a serialized snapshot to preserve its tested editorial engine; it is not a multi-tenant social platform.

## Limits and operations

- Five daily posts maximum, with at least 75 minutes between published posts. Quality checks may produce fewer.
- Spend estimates are conservative guardrails, not provider invoices or guaranteed bills. Existing Vercel/Supabase usage limits still apply.
- Three draft-generation attempts per day; independent editorial checks have their own daily cap. Failed requests remain visible. No blind create-post retries on network failures or 5xx responses.
- Manual edits invalidate approval. First-person experience requires Henry's evidence. Price, availability, unsupported claims, and explicit HOLD notes need human review.
- Reddit is not connected. Website-form lead attribution is not yet connected; the existing Leads tab remains the source for website inquiries. No external failure alerts are configured; worker health and errors are visible in Social.
- To stop posting immediately, use **Pause publishing**. To stop all scheduled work, disable only the `social-publisher-tick` cron job in Supabase. Keep data and other jobs intact.
- Back up Postgres state and private media together. Restored in-flight posts must be reconciled against X before resuming. Do not restore an old snapshot over an active queue.

## Verification

Run `npm run test:social` with Node 24. Tests cover OAuth tickets and PKCE across cold starts, credential redaction, durable draft/media saves, lease failure before provider calls, concurrent pause, ambiguous sends, account pinning, text readback, editorial holds, and duplicate prevention. No tests publish real X posts.

Production checks must separately confirm authenticated status/state, unauthorized rejection, cron heartbeat, and paused state. X posting is not proven until the user authorizes the account and an approved live post is accepted and read back.

The standalone private repository remains an earlier implementation and local preview source. Production runs the engine under `lib/social-runtime` in this website repository. `scripts/preview-social.mjs` is an optional read-only view of that earlier local data, not the production scheduler.
