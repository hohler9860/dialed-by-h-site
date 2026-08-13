#!/usr/bin/env node
/**
 * Work out where each REAL lead's WhatsApp conversation stands, the same way
 * imessage-reconcile.js does for iMessage.
 *
 * PRIVACY, same design as the iMessage script:
 *   - Lead phone numbers are fetched FIRST and the SQLite query is restricted
 *     to those numbers, so personal conversations are never read.
 *   - Only REAL leads (lead_class) are considered.
 *   - Only 1:1 chats (ZSESSIONTYPE = 0); dealer groups are never touched here.
 *   - ChatStorage.sqlite is opened read-only and never written to.
 *
 * Timestamps are only ever advanced, never rolled back: last_outreach_at and
 * client_replied_at are the max across channels, so a fresher iMessage or
 * email timestamp is never overwritten by an older WhatsApp one.
 *
 * Usage:  node scripts/whatsapp-reconcile.js [--dry-run]
 * Needs:  Full Disk Access for the process running it, .env.local for
 *         SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DRY = process.argv.includes('--dry-run');
const WA_DB = path.join(os.homedir(),
  'Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite');

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
  const body = await r.text();
  return body ? JSON.parse(body) : null;
};

const key = (s) => String(s || '').replace(/\D/g, '').slice(-10);
// WhatsApp epoch: seconds since 2001-01-01 (Apple epoch, seconds not nanos).
const APPLE_EPOCH = Date.UTC(2001, 0, 1);
const when = (d) => new Date(APPLE_EPOCH + Number(d) * 1000);

(async () => {
  // 1. WHO WE ARE ALLOWED TO LOOK AT.
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

  if (!fs.existsSync(WA_DB)) { console.error('No WhatsApp DB at ' + WA_DB); process.exit(1); }

  // WhatsApp increasingly hides numbers behind @lid chat identifiers (saved
  // contacts especially), and those chats carry no phone digits at all — so a
  // lead like Emily could message TODAY and never match. The address book
  // table maps lid → phone. Read it (contacts only, never messages), keep
  // ONLY rows whose phone belongs to a lead, and register each lead under the
  // last-10 of its lid as an extra lookup key.
  const CONTACTS_DB = path.join(os.homedir(),
    'Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ContactsV2.sqlite');
  if (fs.existsSync(CONTACTS_DB)) {
    try {
      const o = execFileSync('sqlite3', ['-json', '-readonly', CONTACTS_DB,
        'SELECT ZLID AS lid, ZPHONENUMBER AS phone FROM ZWAADDRESSBOOKCONTACT ' +
        'WHERE ZLID IS NOT NULL AND ZPHONENUMBER IS NOT NULL;'],
        { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
      let lids = 0;
      for (const p of (o.trim() ? JSON.parse(o) : [])) {
        const leadArr = byPhone.get(key(p.phone));
        if (!leadArr) continue;                    // not a lead: discard immediately
        const lk = key(p.lid);
        if (lk.length === 10 && !byPhone.has(lk)) { byPhone.set(lk, leadArr); lids++; }
      }
      if (lids) console.log(`${lids} lead number${lids === 1 ? '' : 's'} resolved behind @lid identifiers`);
    } catch (e) { /* contacts db unreadable: lid chats simply stay unmatched */ }
  }

  // The address book only covers SAVED contacts. Unsaved chats (most inbound
  // WhatsApp leads) are also behind @lid, but their display name IS the phone
  // number — wrapped in Unicode directional isolates and non-breaking spaces,
  // which is why SQL LIKE never finds them. Read the 1:1 session list (chat
  // metadata only, no message content), strip every non-digit from the display
  // name in JS, and register matching leads under their lid key as well.
  try {
    const o = execFileSync('sqlite3', ['-json', '-readonly', WA_DB,
      'SELECT ZCONTACTJID AS jid, ZPARTNERNAME AS name FROM ZWACHATSESSION ' +
      "WHERE ZSESSIONTYPE = 0 AND ZCONTACTJID LIKE '%@lid';"],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    let named = 0;
    for (const s of (o.trim() ? JSON.parse(o) : [])) {
      const leadArr = byPhone.get(key(s.name));
      if (!leadArr) continue;                      // display name is not a lead number
      const lk = key(s.jid.split('@')[0]);
      if (lk.length === 10 && !byPhone.has(lk)) { byPhone.set(lk, leadArr); named++; }
    }
    if (named) console.log(`${named} lead number${named === 1 ? '' : 's'} matched by chat display name`);
  } catch (e) { /* session list unreadable: those chats stay unmatched */ }

  const safe = [...byPhone.keys()].filter(k => /^[0-9]{10}$/.test(k));
  if (!safe.length) { console.log('nothing to look up'); return; }
  const inList = safe.map(k => `'${k}'`).join(',');

  // JID looks like 12073297504@s.whatsapp.net — digits before the @ are the
  // number. Compare on the last 10 digits, same normalisation as the leads.
  // ZSESSIONTYPE = 0 keeps this to 1:1 chats; groups are 1.
  // ZMESSAGETYPE = 0 keeps it to real text messages; system rows carry JIDs
  // and media placeholders in ZTEXT otherwise.
  const sql = `
    SELECT substr(substr(s.ZCONTACTJID, 1, instr(s.ZCONTACTJID, '@') - 1), -10) AS k,
           m.ZISFROMME AS mine,
           MAX(m.ZMESSAGEDATE) AS d
      FROM ZWAMESSAGE m
      JOIN ZWACHATSESSION s ON s.Z_PK = m.ZCHATSESSION
     WHERE s.ZSESSIONTYPE = 0
       AND substr(substr(s.ZCONTACTJID, 1, instr(s.ZCONTACTJID, '@') - 1), -10) IN (${inList})
     GROUP BY k, m.ZISFROMME;`;

  let rows;
  try {
    const out = execFileSync('sqlite3', ['-json', '-readonly', WA_DB, sql],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    rows = out.trim() ? JSON.parse(out) : [];
  } catch (e) {
    const msg = String(e.stderr || e.message);
    if (/authorization denied|unable to open|not authorized/i.test(msg)) {
      console.error('\nCannot read ChatStorage.sqlite: Full Disk Access is not granted to this process.');
      process.exit(2);
    }
    console.error(msg);
    process.exit(1);
  }

  // 2. Timestamp advances only.
  const updates = [];
  for (const k of new Set(rows.map(r => r.k))) {
    const out = rows.find(r => r.k === k && r.mine === 1);
    const inb = rows.find(r => r.k === k && r.mine === 0);
    for (const lead of (byPhone.get(k) || [])) {
      const patch = {};
      const oNew = out ? when(out.d).toISOString() : null;
      if (oNew && (!lead.last_outreach_at || oNew > lead.last_outreach_at)) patch.last_outreach_at = oNew;
      const iNew = inb ? when(inb.d).toISOString() : null;
      if (iNew && (!lead.client_replied_at || iNew > lead.client_replied_at)) patch.client_replied_at = iNew;
      if (Object.keys(patch).length) updates.push({ lead, patch });
    }
  }
  const matched = [...new Set(rows.map(r => r.k))].filter(k => byPhone.has(k));
  console.log(`\n${matched.length} of those numbers appear in WhatsApp`);
  console.log(`${updates.length} leads to update\n`);
  for (const u of updates) {
    console.log(`  ${u.lead.full_name.padEnd(24)} ` +
      (u.patch.last_outreach_at  ? 'you replied '  + u.patch.last_outreach_at.slice(0, 10) + '  ' : '') +
      (u.patch.client_replied_at ? 'they replied ' + u.patch.client_replied_at.slice(0, 10) : ''));
  }

  // 3. Recent thread for the matched leads, last 12 each, same as iMessage.
  let threadRows = [];
  if (matched.length) {
    const tIn = matched.map(k => "'" + k + "'").join(',');
    const tSql =
      "SELECT substr(substr(s.ZCONTACTJID, 1, instr(s.ZCONTACTJID, '@') - 1), -10) AS k, " +
      "       m.ZISFROMME AS mine, m.ZMESSAGEDATE AS d, m.ZTEXT AS body " +
      "  FROM ZWAMESSAGE m " +
      "  JOIN ZWACHATSESSION s ON s.Z_PK = m.ZCHATSESSION " +
      " WHERE s.ZSESSIONTYPE = 0 AND m.ZMESSAGETYPE = 0 " +
      "   AND substr(substr(s.ZCONTACTJID, 1, instr(s.ZCONTACTJID, '@') - 1), -10) IN (" + tIn + ") " +
      "   AND m.ZTEXT IS NOT NULL AND m.ZTEXT <> '' " +
      " ORDER BY m.ZMESSAGEDATE DESC LIMIT 800;";
    try {
      const o = execFileSync('sqlite3', ['-json', '-readonly', WA_DB, tSql],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
      threadRows = o.trim() ? JSON.parse(o) : [];
    } catch (e) { console.error('thread read failed: ' + String(e.stderr || e.message)); }
  }

  const perLead = new Map();
  for (const r of threadRows) {
    if (!r.body) continue;
    for (const lead of (byPhone.get(r.k) || [])) {
      const arr = perLead.get(lead.id) || [];
      if (arr.length >= 12) continue;
      arr.push({ submission_id: lead.id, channel: 'WHATSAPP',
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
