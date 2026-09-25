# Social publishing integration

This branch adds **Social** to the existing website admin. It uses the existing admin password and `/api/leads-admin` endpoint. It does not add a Vercel function, change Supabase data, or run a long-lived worker inside a serverless request.

The publisher source is in `/Users/henryohler/Desktop/dialed-x-poster`. Its README contains account setup, deployment, backups, operational limits, and autonomous editorial behavior. This branch and the publisher have been tested locally; neither has been deployed for this integration, and no live post has been sent.

## Hosting configuration

1. Deploy the publisher as one always-running Node 24.13+ service with persistent storage, HTTPS, and the included restart policy. A sleeping laptop or ephemeral serverless filesystem cannot provide unattended scheduling. Container files are supplied but have not been runtime-tested here.
2. Set its `APP_URL`, `APP_SECRET`, `ADMIN_PASSWORD`, and `ADMIN_BRIDGE_SECRET`. Use a random bridge secret of at least 32 characters.
3. On the website deployment set `SOCIAL_POSTER_URL` to that HTTPS origin and `SOCIAL_POSTER_SECRET` to the matching bridge secret. Do not expose these values in frontend configuration or commit them.
4. Use the publisher's private settings page to configure the X app and drafting API. Authorize **@dialedbyh** with OAuth. The first connection pins its immutable numeric account ID; all later connections and publish requests must match.
5. Deploy this branch through the normal reviewed website release process. Open **Admin → Social**. Without service configuration the tab reports that setup is incomplete; it never substitutes sample operational status.
6. Verify account identity. Check a real approved post and confirm the resulting X link and readback. Then choose the desired editorial mode and resume publishing. Up to five daily slots are available; editorial holds or outages can reduce the number actually published.
7. Configure external uptime/worker monitoring, billing limits, persistent backups, and a restore check. The admin reports heartbeats and failures, but email/SMS alerts are not connected.

## Account and delivery evidence

The Social tab shows the authenticated X username, numeric account ID, last identity check, last worker heartbeat, next scheduled post, queue status, and recent activity. The worker verifies `/users/me` before publishing. A returned X post ID is initially **accepted**, then a separate read fetch checks its author and text before displaying **verified**. An ambiguous write pauses for reconciliation. Failed readback is retried three times and then pauses without reposting.

Website status refreshes every 30 seconds while visible. The hosted publisher runs independently of the website or laptop. All queue mutations require existing website admin authentication followed by service-to-service authentication. The browser cannot choose the service URL, send arbitrary actions, or access provider tokens. Rate estimates are local guardrails, not an invoice.

## Controls and limitations

- Pause/resume, account verification, editorial mode, draft editing, approval/rejection, and delivery rechecks are in the website admin.
- Initial provider credentials, supporting source edits, images, detailed performance, and ambiguous-write reconciliation remain in the linked publisher workspace.
- Review mode is the default. Autonomous mode enables automatic drafting and a separate editorial assessment; paused publishing stays paused until explicitly resumed. Human edits require manual approval.
- Existing sourcing-form attribution is not changed by this branch. The publisher includes an attribution adapter example; automatic website lead attribution still needs integration.
- Reddit is an honest setup-status panel. Reddit API approval, commercial-use approval, account selection, and community permissions remain prerequisites; a Reddit API connector has not been implemented or tested.
- Live OAuth, publishing, AI drafting, hosted callback/TLS, and a live website-to-worker connection have not been tested without credentials/hosting.
- The standalone publisher has now been visually reviewed at desktop and phone widths using the same brand assets. The Social tab inherits this admin’s existing design tokens; its deployed integration still needs visual verification after connection.

## Validation

```sh
node --test test/social-admin*.test.js
node --check scripts/social-admin.js
node --check api/leads-admin.js
```

Publisher validation: `npm test` and `npm run check` in its checkout. Tests use synthetic accounts and mocked upstream responses; they do not publish external content.

## Design reference

`admin/index.html` is the authoritative admin theme: cream `#FBFAF4`, TikTok Sans, Departure Mono, black selected tabs, square buttons and fields, thin dividers, and compact tables. `assets/social-admin.css` extends those shared tokens and existing `.btn`, `.ctl`, `.count`, and `.pill` classes. It does not load the public website’s global uppercase stylesheet. Public homepage appearance was inspected live; its Archivo display type is separate from the admin’s TikTok Sans and is intentionally not substituted into existing admin screens.

Postiz can be integrated server-side while these native admin components remain the user interface. This branch does not embed or restyle Postiz itself, and a Postiz connector is not yet configured.
