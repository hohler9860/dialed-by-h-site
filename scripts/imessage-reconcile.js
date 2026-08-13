#!/usr/bin/env node
/**
 * Work out which leads Henry has actually replied to on iMessage.
 *
 * The server cannot see iMessage, so `claim_followups` only knows about
 * outreach logged by hand in the admin. Henry answers from his phone, which is
 * why 36 of 38 real leads read as "never contacted" and no follow-up clock ever
 * starts.
 *
 * PRIVACY, and this is the whole design rather than a footnote:
 *   - The lead phone numbers are fetched FIRST, and the SQLite query is
 *     restricted to those handles. Personal conversations are never part of
 *     the query, so they are never read.
 *   - Only REAL leads are considered. PERSONAL contacts (Henry's friends,
 *     Shamik and the like) are excluded by lead_class, so a friend who also
 *     enquired is not swept in.
 *   - Message bodies ARE read and stored now, but only for numbers that match
 *     a REAL lead, so the query never touches a personal conversation. Henry
 *     asked for this: he cannot tell where a conversation stands from
 *     timestamps alone. Earlier versions read direction and timestamp only.
 *   - chat.db is opened read-only (mode=ro) and never written to.
 *
 * Usage:  node scripts/imessage-reconcile.js [--dry-run]
 * Needs:  Full Disk Access for the terminal app (Ghostty), and .env.local for
 *         SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DRY = process.argv.includes('--dry-run');
const CHAT_DB = path.join(os.homedir(), 'Library/Messages/chat.db');

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
if (!SB_URL || !SB_KEY) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const sb = async (p, init = {}) => {
  const r = await fetch(`${SB_URL}/rest/v1/${p}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', apikey: SB_KEY,
               Authorization: `Bearer ${SB_KEY}`, ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  // return=minimal answers 201 with an empty body, which JSON.parse chokes on.
  const body = await r.text();
  return body ? JSON.parse(body) : null;
};

// Last 10 digits: enough to match +1 917..., 917..., (917) ... as the same person.
const key = (s) => String(s || '').replace(/\D/g, '').slice(-10);

(async () => {
  // 1. WHO WE ARE ALLOWED TO LOOK AT. Everything downstream is bounded by this.
  const leads = await sb('dialed_submissions?select=id,full_name,phone,lead_class,'
    + 'last_outreach_at,client_replied_at&lead_class=eq.REAL&phone=not.is.null');
  // A phone number can map to SEVERAL lead rows (the form and the WhatsApp
  // pipeline both create submissions), so the map holds arrays: every copy of
  // a duplicated lead gets its timestamps advanced, not just the last one in.
  const byPhone = new Map();
  for (const l of leads) {
    const k = key(l.phone);
    if (k.length === 10) (byPhone.get(k) || byPhone.set(k, []).get(k)).push(l);
  }
  console.log(`${leads.length} real leads, ${byPhone.size} with a usable phone number`);
  if (!byPhone.size) return;

  if (!fs.existsSync(CHAT_DB)) { console.error('No chat.db at ' + CHAT_DB); process.exit(1); }

  // 2. Ask SQLite only about those numbers. The sqlite3 CLI cannot take bind
  //    parameters from argv, so the values are inlined, which is safe only
  //    because key() strips everything that is not a digit and each value is
  //    re-checked here. Anything that is not exactly ten digits is dropped
  //    rather than trusted.
  const keys = [...byPhone.keys()];
  const safe = keys.filter(k => /^[0-9]{10}$/.test(k));
  if (safe.length !== keys.length) {
    console.log(`skipped ${keys.length - safe.length} phone numbers that were not 10 digits`);
  }
  if (!safe.length) { console.log('nothing to look up'); return; }
  const inList = safe.map(k => `'${k}'`).join(',');

  // Only the handle, the direction and the timestamp. The `text` column is
  // deliberately never selected, so no message content is read.
  //
  // Joined through the chat rather than message.handle_id, because 4,706 of
  // Henry's own sent messages have handle_id = 0. Keying on that field found
  // inbound fine and missed most outbound, so people he had held whole
  // conversations with still read as never answered.
  //
  // Restricted to chats with exactly one participant: a group thread would
  // otherwise credit every member with the conversation, and it keeps group
  // chats out of this entirely.
  const digits = "replace(replace(replace(replace(replace(h.id,'+',''),'-',''),' ',''),'(',''),')','')";
  const sql = `
    SELECT substr(${digits}, -10) AS k,
           m.is_from_me           AS mine,
           MAX(m.date)            AS d
      FROM message m
      JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
      JOIN chat_handle_join  chj ON chj.chat_id    = cmj.chat_id
      JOIN handle h              ON h.ROWID        = chj.handle_id
     WHERE substr(${digits}, -10) IN (${inList})
       AND (SELECT COUNT(*) FROM chat_handle_join x WHERE x.chat_id = cmj.chat_id) = 1
     GROUP BY k, m.is_from_me;`;

  let rows;
  try {
    const out = execFileSync('sqlite3', ['-json', '-readonly', CHAT_DB, sql],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    rows = out.trim() ? JSON.parse(out) : [];
  } catch (e) {
    const msg = String(e.stderr || e.message);
    if (/authorization denied|unable to open|not authorized/i.test(msg)) {
      console.error('\nCannot read chat.db: Full Disk Access is not granted to this terminal.');
      console.error('Grant it to Ghostty, then quit and reopen it:');
      console.error('  open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFilesAccess"\n');
      process.exit(2);
    }
    console.error(msg);
    process.exit(1);
  }

  // 3. Apple epoch: nanoseconds since 2001-01-01. Older rows are in seconds.
  const APPLE_EPOCH = Date.UTC(2001, 0, 1);
  const when = (d) => new Date(APPLE_EPOCH + (Number(d) > 1e12 ? Number(d) / 1e6 : Number(d) * 1000));

  const updates = [];
  for (const k of new Set(rows.map(r => r.k))) {
    const out = rows.find(r => r.k === k && r.mine === 1);
    const inb = rows.find(r => r.k === k && r.mine === 0);
    for (const lead of (byPhone.get(k) || [])) {
      const patch = {};
      // Advance-only: another channel (WhatsApp, email) may hold a fresher
      // timestamp, and an older iMessage one must never roll it back.
      const oNew = out ? when(out.d).toISOString() : null;
      if (oNew && (!lead.last_outreach_at || oNew > lead.last_outreach_at))   patch.last_outreach_at  = oNew;
      const iNew = inb ? when(inb.d).toISOString() : null;
      if (iNew && (!lead.client_replied_at || iNew > lead.client_replied_at)) patch.client_replied_at = iNew;
      if (Object.keys(patch).length) updates.push({ lead, patch });
    }
  }

  console.log(`\n${rows.length ? new Set(rows.map(r => r.k)).size : 0} of those numbers appear in Messages`);
  console.log(`${updates.length} leads to update\n`);
  for (const u of updates) {
    console.log(`  ${u.lead.full_name.padEnd(24)} ` +
      (u.patch.last_outreach_at  ? 'you replied '   + u.patch.last_outreach_at.slice(0, 10) + '  ' : '') +
      (u.patch.client_replied_at ? 'they replied '  + u.patch.client_replied_at.slice(0, 10) : ''));
  }

  // Recent messages for the leads that actually have a thread, so the admin can
  // show where the conversation stands. Same boundary as everything above: the
  // IN list is the lead phone numbers and nothing else.
  const matched = [...new Set(rows.map(r => r.k))].filter(k => byPhone.has(k));
  let threadRows = [];
  if (matched.length) {
    // Plain concatenation rather than a nested template literal: the SQL
    // already contains backticks-free but brace-heavy expressions and nesting
    // them silently produced a literal "${digits}" in the query.
    const tIn = matched.map(k => "'" + k + "'").join(',');
    const tSql =
      "SELECT substr(" + digits + ", -10) AS k, m.is_from_me AS mine, " +
      "       m.date AS d, m.text AS body " +
      "  FROM message m " +
      "  JOIN chat_message_join cmj ON cmj.message_id = m.ROWID " +
      "  JOIN chat_handle_join  chj ON chj.chat_id    = cmj.chat_id " +
      "  JOIN handle h              ON h.ROWID        = chj.handle_id " +
      " WHERE substr(" + digits + ", -10) IN (" + tIn + ") " +
      "   AND (SELECT COUNT(*) FROM chat_handle_join x WHERE x.chat_id = cmj.chat_id) = 1 " +
      "   AND m.text IS NOT NULL AND m.text <> '' " +
      " ORDER BY m.date DESC LIMIT 800;";
    try {
      const o = execFileSync('sqlite3', ['-json', '-readonly', CHAT_DB, tSql],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
      threadRows = o.trim() ? JSON.parse(o) : [];
    } catch (e) { console.error('thread read failed: ' + String(e.stderr || e.message)); }
  }

  // Last 12 each per lead: enough to see where things stand without hoarding
  // the whole history.
  const perLead = new Map();
  for (const r of threadRows) {
    if (!r.body) continue;
    for (const lead of (byPhone.get(r.k) || [])) {
      const arr = perLead.get(lead.id) || [];
      if (arr.length >= 12) continue;
      arr.push({ submission_id: lead.id, channel: 'IMESSAGE',
                 from_me: r.mine === 1, body: String(r.body).slice(0, 1200),
                 sent_at: when(r.d).toISOString() });
      perLead.set(lead.id, arr);
    }
  }
  const toStore = [...perLead.values()].flat();
  console.log(`${toStore.length} messages to store across ${perLead.size} threads`);

  if (DRY) { console.log('\n--dry-run, nothing written'); return; }
  for (const u of updates) {
    await sb(`dialed_submissions?id=eq.${u.lead.id}`,
      { method: 'PATCH', body: JSON.stringify(u.patch) });
  }
  if (toStore.length) {
    // Upsert on the natural key so re-running does not duplicate the thread.
    for (let i = 0; i < toStore.length; i += 200) {
      await sb('lead_thread?on_conflict=submission_id,channel,sent_at,from_me', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(toStore.slice(i, i + 200)),
      });
    }
  }
  console.log(`\nUpdated ${updates.length} leads, stored ${toStore.length} messages.`);
})().catch(e => { console.error(e.message); process.exit(1); });
