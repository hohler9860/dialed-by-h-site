# Off-Catalog Journal — Setup Checklist

This doc covers what you need to do after merging `feat/off-catalog-journal` to ship the new journal to production.

## 1. Set the admin password env var in Vercel

The journal admin (`/admin/journal/`) is gated by a single password stored as `ADMIN_PASSWORD`.

1. Open https://vercel.com/ → `dialed-by-h-site` → Settings → Environment Variables
2. Add a new variable:
   - **Key**: `ADMIN_PASSWORD`
   - **Value**: a long random string (e.g. `1Password → Generate Password → 24 chars`)
   - **Environment**: Production, Preview, Development (all three)
3. Save and redeploy (or wait for the next push to trigger a redeploy).

**Do not** commit this password to git. It only lives in Vercel and your password manager.

## 2. Pick the password and bookmark the admin URL

Your admin lives at:

```
https://dialedbyhenry.com/admin/journal/
```

First login: paste the `ADMIN_PASSWORD` you just set. The session lasts until you close the tab.

## 3. Migrate the 2 old Substack posts (manual)

There are 2 posts on the old Substack:

- **What Rolex Is (Probably) Dropping at Watches and Wonders 2026** (published 2026-03-03)
- **First Entry** (published 2026-02-09)

For each:

1. Open the post on Substack, copy the title, subtitle, hero image URL, and body.
2. Go to `/admin/journal/edit.html` (or click "New Article" from the admin dashboard).
3. Paste the title, subtitle, upload the hero image, paste paragraphs into Editor.js blocks.
4. Set the category (e.g. "Predictions" or "Journal").
5. Hit **Publish**.
6. Hit **Email Test (to me)** to verify the broadcast email looks right.
7. Hit **Email Subscribers** to push it to the list (or skip if you don't want to email old posts).

## 4. Decide what to do with the dead Substack files

- `journal.html` — old Substack-feed page. Already 301-redirects to `/journal/` via `vercel.json`. Safe to leave; safe to delete.
- `api/substack-feed.js` — old RSS proxy. No longer called by anything. Safe to delete.

Tell Claude "delete these two files" if you want to clean up. I left them in place because the redirect handles the user-facing URL fine without deletion.

## 5. Verify the subscribe flow

Test your own confirm + unsubscribe flow before announcing:

1. Subscribe with your own email on `/journal/`
2. Check your inbox for the confirmation email
3. Click the confirm link → should redirect to `/journal/?confirmed=1` with a "Confirmed. You're on the list." banner
4. Publish a test article, hit **Email Subscribers**
5. In the email, click "Unsubscribe" → should redirect to `/journal/?unsubscribed=1`

## 6. What this replaced

- Old Substack RSS pull (`/api/substack-feed.js`) → killed
- Old `/journal.html` Substack-mirror page → 301'd to new journal
- `dialedbyh.substack.com` → can stay live for now (acts as backup archive), but stop posting there
- Email subscribers from the old "Private List" form (`dialed_submissions` where `submission_type='JOIN_LIST'`) are a **separate** list from journal subscribers. Roman's Gray Market Magazine treats news subscribers and customer list separately too; keeping them split is correct.

## 7. Routes added

| Route | Purpose |
|---|---|
| `/journal/` | Off-Catalog index (cards + masthead + subscribe form) |
| `/journal/:slug` | Server-rendered article page (SEO-optimized) |
| `/admin/journal/` | Article list + login |
| `/admin/journal/edit.html` | Substack-style editor |
| `/api/journal-list` | GET published articles (public) |
| `/api/journal-get?slug=X` | GET single article (public) |
| `/api/journal-subscribe` | POST email, send confirmation (public) |
| `/api/journal-confirm?token=X` | GET confirm subscription (public) |
| `/api/journal-unsubscribe?token=X` | GET unsubscribe (public) |
| `/api/journal-admin` | Auth-protected CRUD (admin only) |
| `/api/journal-article-render?slug=X` | Server-side renderer (called by Vercel rewrite) |
| `/api/journal-broadcast` | Auth-protected — send article to subscribers |

## 8. Database tables added

- `journal_articles` — every article (drafts + published)
- `journal_subscribers` — double-opt-in email list with unsubscribe tokens
- `journal-images` storage bucket — for hero + inline images
