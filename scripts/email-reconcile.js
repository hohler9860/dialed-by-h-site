#!/usr/bin/env node
/**
 * Work out where each REAL lead's email conversation stands, completing the
 * channel set next to imessage-reconcile.js and whatsapp-reconcile.js.
 *
 * Reads Gmail over IMAP with an app password. Same boundary as the other two:
 * lead email addresses are fetched FIRST and only those addresses are ever
 * searched, so no other mail is read.
 *
 * Timestamps only ever advance, never roll back, so a fresher iMessage or
 * WhatsApp timestamp is never overwritten by an older email one.
 *
 * Usage:  node scripts/email-reconcile.js [--dry-run]
 * Needs:  .env.local with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *         GMAIL_USER and GMAIL_APP_PASSWORD (myaccount.google.com/apppasswords).
 *         Exits 0 with a notice if the Gmail vars are missing, so the daily
 *         runner keeps going until they are set up.
 */

const fs = require('fs');
const path = require('path');

const DRY = process.argv.includes('--dry-run');

// ── env ──────────────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD;
if (!SB_URL || !SB_KEY) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!GMAIL_USER || !GMAIL_PASS) {
  console.log('GMAIL_USER / GMAIL_APP_PASSWORD not set in .env.local — skipping email reconcile.');
  console.log('Create one at https://myaccount.google.com/apppasswords and add both vars.');
  process.exit(0);
}

const sb = async (p, init = {}) => {
  const r = await fetch(`${SB_URL}/rest/v1/${p}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', apikey: SB_KEY,
               Authorization: `Bearer ${SB_KEY}`, ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  const body = await r.text();
  return body ? JSON.parse(body) : null;
};

(async () => {
  const { ImapFlow } = require('imapflow');
  const { simpleParser } = require('mailparser');

  // 1. WHO WE ARE ALLOWED TO LOOK AT.
  const leads = await sb('dialed_submissions?select=id,full_name,email,lead_class,'
    + 'last_outreach_at,client_replied_at&lead_class=eq.REAL&email=not.is.null');
  const usable = leads.filter(l => /@/.test(l.email || ''));
  console.log(`${leads.length} real leads, ${usable.length} with a usable email`);
  if (!usable.length) return;

  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true, logger: false,
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  });
  await client.connect();

  const updates = [];
  const toStore = [];
  const lock = await client.getMailboxLock('[Gmail]/All Mail');
  try {
    for (const lead of usable) {
      const addr = lead.email.trim().toLowerCase();
      // Everything to or from this lead, most recent last.
      const uids = await client.search({ or: [{ from: addr }, { to: addr }] }, { uid: true });
      if (!uids || !uids.length) continue;

      // Envelopes for direction + dates; bodies only for the last 6.
      const recent = uids.slice(-30);
      const msgs = [];
      for await (const m of client.fetch(recent, { envelope: true, uid: true }, { uid: true })) {
        const fromMe = (m.envelope.from || []).some(a =>
          String(a.address || '').toLowerCase() === GMAIL_USER.toLowerCase());
        msgs.push({ uid: m.uid, fromMe, date: m.envelope.date });
      }
      msgs.sort((a, b) => new Date(a.date) - new Date(b.date));

      const lastOut = msgs.filter(m => m.fromMe).at(-1);
      const lastIn  = msgs.filter(m => !m.fromMe).at(-1);
      const patch = {};
      const oNew = lastOut ? new Date(lastOut.date).toISOString() : null;
      if (oNew && (!lead.last_outreach_at || oNew > lead.last_outreach_at)) patch.last_outreach_at = oNew;
      const iNew = lastIn ? new Date(lastIn.date).toISOString() : null;
      if (iNew && (!lead.client_replied_at || iNew > lead.client_replied_at)) patch.client_replied_at = iNew;
      if (Object.keys(patch).length) updates.push({ lead, patch });

      for (const m of msgs.slice(-6)) {
        const dl = await client.download(String(m.uid), undefined, { uid: true });
        if (!dl || !dl.content) continue;
        const parsed = await simpleParser(dl.content);
        let text = (parsed.text || '').trim();
        // Keep the new content, not the quoted history under it.
        text = text.split(/\r?\n(?:>|On .{10,80} wrote:)/)[0].trim();
        if (!text) continue;
        toStore.push({ submission_id: lead.id, channel: 'EMAIL',
                       from_me: m.fromMe, body: text.slice(0, 1200),
                       sent_at: new Date(m.date).toISOString() });
      }
      console.log(`  ${lead.full_name.padEnd(24)} ${msgs.length} emails` +
        (lastOut ? `, you last ${new Date(lastOut.date).toISOString().slice(0, 10)}` : '') +
        (lastIn  ? `, them last ${new Date(lastIn.date).toISOString().slice(0, 10)}` : ''));
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }

  console.log(`\n${updates.length} leads to update, ${toStore.length} messages to store`);
  if (DRY) { console.log('--dry-run, nothing written'); return; }
  for (const u of updates) {
    await sb(`dialed_submissions?id=eq.${u.lead.id}`,
      { method: 'PATCH', body: JSON.stringify(u.patch) });
  }
  if (toStore.length) {
    for (let i = 0; i < toStore.length; i += 200) {
      await sb('lead_thread?on_conflict=submission_id,channel,sent_at,from_me', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(toStore.slice(i, i + 200)),
      });
    }
  }
  console.log(`Updated ${updates.length} leads, stored ${toStore.length} messages.`);
})().catch(e => { console.error(e.message); process.exit(1); });
