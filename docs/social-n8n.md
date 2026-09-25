# Daily social drafts in n8n

The separate `Social: daily watch drafts and schedule` workflow reuses the existing OpenRouter funded credential and HTTP/code-node pattern from `Worker: classify`. It never modifies or calls the catalogue worker.

Drafts use GPT-5.4 Mini and independent review uses GPT-5.4 Nano through OpenRouter. The cheaper Gemma/Gemini trial failed the accuracy benchmark; Nano correctly held unsupported specifications and sourcing promises.

It runs at 18:05 America/New_York (DST aware), reserving tomorrow's batch before any model call. The manual trigger uses the same duplicate checks. An optional `day` on the reserve request can target a date within the next seven days for a controlled test or advance batch; omitting it always means tomorrow. The website assigns its configured five daily slots. The website remains the only X publisher; n8n never receives X credentials.

## Data and credentials

`POST /api/leads-admin` with `action: social-workflow` accepts only `begin`, `commit`, and `fail`. A distinct HMAC-derived bearer stored as an encrypted n8n Header Auth credential authenticates this route. It cannot use admin operations, resume publishing or read account tokens. Regenerating the server seed requires rotating this credential.

The context contains only selected labels from the anonymous public catalogue, text of delivery-verified published posts, and the fixed buyer-authority brief. No private source notes, unpublished drafts, client details, lead records, wholesale data or website secrets are supplied to OpenRouter. The model sees eight catalogue labels per batch, not the whole database. Labels do not establish availability, condition, authenticity or watch specifications.

`scripts/build-social-n8n.mjs` regenerates `scripts/n8n-social-drafts.json`. Replace `DBH_SOCIAL_CREDENTIAL_ID` with the installed Header Auth credential ID when importing. The export contains credential references only. The OpenRouter credential belongs to the existing account; no additional server or subscription is required.

## Controls and failure behavior

- Website settings enable/disable n8n drafting; native OpenAI auto-generation is disabled when n8n is enabled.
- One five-post batch per day, one per category. At most two bounded attempts per day; concurrent runs and duplicate deliveries are skipped.
- AI spend is reserved before contacting providers, capped at $1/month. Exact reported costs replace the reserve only when both expected models report valid amounts. Failed or unknown-cost calls keep the reserve. X charges remain separate.
- Provider requests are not automatically retried. The idempotent website import can retry twice.
- The independent reviewer checks claims, voice, unsupported experiences, originality and sourcing promises. The server also enforces the existing text, URL, duplicate, source and spacing rules.
- Named-watch factual, technical, price, time-sensitive and outcome claims remain for human review even if the model approves them. AI review is not proof of truth.
- Review mode saves drafts with planned times. Autonomous mode schedules only eligible new drafts. Neither mode changes the publisher's pause flag. Existing held drafts and human edits require manual approval.
- Errors stop the run and appear in n8n and the Social drafting panel. A crashed invocation displays `interrupted` after ten minutes. A manual retry may use the second daily attempt; no automatic infinite retry.
- The existing photo worker may attach an unambiguous exact-reference catalogue photo to an untouched review draft. Ambiguous matches and recently used images remain text-only. Automatic approval can result in a text-only scheduled post; do not assume every slot includes a photo.

## Operations

Open the workflow from Social > Queue or Connections & settings. Choose **Execute workflow** to prepare tomorrow early. Another run for an existing batch skips model calls. Change daily posting times in the website; already-created drafts retain their times. Pause publishing on the website to stop future sends; disabling n8n drafting stops new generation and does not remove existing approved posts.

Validate with `npm run test:social` and `npm run build`. A live test must confirm the n8n execution, five imported drafts, intended dates/times, cost, and unchanged publisher pause/mode. Do not use a public post as a drafting test.
