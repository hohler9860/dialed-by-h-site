#!/usr/bin/env node
// NTQ scan — pulls client watch requests out of the local iMessage and
// WhatsApp databases so they can be turned into dealer copy-paste NTQ lines.
//
// Runs ONLY on Henry's Mac (the message stores live there; Vercel never sees
// them). Requires Full Disk Access for the terminal running it.
//
// Usage:
//   node scripts/ntq/scan-messages.js [days]        # default 14
//
// Output: candidate inbound messages grouped by contact, printed to stdout.
// The intended workflow is to run this inside Claude Code and have it read
// the candidates, compose the NTQ lines, and insert rows into dbh_ntq
// (Supabase creds are in .env.local). The script itself writes nothing.

const { execFileSync } = require("child_process");
const os = require("os");
const path = require("path");

const DAYS = Math.max(1, Number(process.argv[2]) || 14);

const CHAT_DB = path.join(os.homedir(), "Library/Messages/chat.db");
const WA_DB = path.join(
    os.homedir(),
    "Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite"
);

// One place to tune what counts as a watch-request signal.
const KEYWORDS = [
    "looking for", "iso ", "ntq", "do you have", "you got", "can you get",
    "can you find", "can you source", "source", "price on", "quote",
    "rolex", "patek", "audemars", "vacheron", "cartier", "omega", "tudor",
    "daytona", "submariner", "datejust", "gmt", "nautilus", "aquanaut",
    "royal oak", "day-date", "day date", "santos", "tank", "speedmaster",
    "box and papers", "full set", "watch",
];

function likeClause(col) {
    return "(" + KEYWORDS.map((k) => `lower(${col}) LIKE '%${k}%'`).join(" OR ") + ")";
}

function q(db, sql) {
    try {
        const out = execFileSync("sqlite3", ["-readonly", "-separator", "\x1f", db, sql], {
            encoding: "utf8",
            maxBuffer: 64 * 1024 * 1024,
        });
        return out.split("\n").filter(Boolean).map((l) => l.split("\x1f"));
    } catch (e) {
        console.error(`!! could not read ${db}: ${e.message.split("\n")[0]}`);
        console.error("   (missing Full Disk Access for this terminal is the usual cause)");
        return [];
    }
}

// ── iMessage ────────────────────────────────────────────────────────────────
// Apple epoch (2001-01-01) in nanoseconds. Comparing datetime() to datetime()
// on purpose: comparing the raw integer against strftime('%s') silently fails
// because SQLite ranks any TEXT above any INTEGER.
const imsg = q(
    CHAT_DB,
    `SELECT datetime(m.date/1000000000 + 978307200,'unixepoch','localtime'),
            coalesce(h.id,'unknown'),
            replace(replace(m.text, char(10), ' / '), char(13), '')
     FROM message m
     LEFT JOIN handle h ON m.handle_id = h.ROWID
     WHERE datetime(m.date/1000000000 + 978307200,'unixepoch') > datetime('now','-${DAYS} days')
       AND m.is_from_me = 0
       AND m.text IS NOT NULL
       AND ${likeClause("m.text")}
     ORDER BY h.id, m.date;`
);

// ── WhatsApp ────────────────────────────────────────────────────────────────
// ZSESSIONTYPE 0 = individual chats. Groups are skipped deliberately: dealer
// groups are supply, not client demand.
const wa = q(
    WA_DB,
    `SELECT datetime(m.ZMESSAGEDATE+978307200,'unixepoch','localtime'),
            coalesce(s.ZPARTNERNAME, s.ZCONTACTJID),
            replace(replace(m.ZTEXT, char(10), ' / '), char(13), '')
     FROM ZWAMESSAGE m
     JOIN ZWACHATSESSION s ON m.ZCHATSESSION = s.Z_PK
     WHERE s.ZSESSIONTYPE = 0
       AND m.ZISFROMME = 0
       AND datetime(m.ZMESSAGEDATE+978307200,'unixepoch') > datetime('now','-${DAYS} days')
       AND m.ZTEXT IS NOT NULL
       AND ${likeClause("m.ZTEXT")}
     ORDER BY s.ZPARTNERNAME, m.ZMESSAGEDATE;`
);

function print(label, rows) {
    console.log(`\n════ ${label}: ${rows.length} candidate message(s), last ${DAYS} days ════`);
    let current = null;
    for (const [dt, contact, text] of rows) {
        if (contact !== current) {
            current = contact;
            console.log(`\n── ${contact}`);
        }
        console.log(`  ${dt}  ${text.slice(0, 400)}`);
    }
}

print("iMessage", imsg);
print("WhatsApp DMs", wa);

console.log(`
Next step (for Claude Code):
  1. For each contact above, decide if it is a real client want.
  2. Pull thread context where the request references an earlier photo.
  3. Compose the NTQ line in real dealer WTB dialect (learned from the
     "ONLY WTB & NTQ" and "RWB WTB" groups — study them again if unsure):
       - NEVER include a price, budget, or client detail.
       - Openers: "NTQ" / "wtb" / "Need" / "Looking for".
       - Completeness: "complete" / "full set" / "naked" (watch only) /
         "slider" — not "box and papers" or "B&P".
       - Condition: new / BNIB / mint / preowned. Year floors as "2018+".
       - A budget constraint is expressed ONLY as "for price point"
         (meaning an older year is fine to hit a number).
       - Compressed descriptors: "silver stick jubilee", "choc Roman",
         "green ombre oyster", nicknames (pepsi, bruce, hulk).
       - Real examples: "Ntq new complete set 126334 green ombre oyster",
         "Need mint complete 228235 choc Roman",
         "wtb 5712r mint like new complete 2022+",
         "NTQ 116618ln 2010 ONLY".
  4. Insert into dbh_ntq via Supabase REST using SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
     from .env.local — skip contacts that already have an open row.
  5. Email + site requests arrive via inquiries@mail.dialedbyhenry.com and are
     already in dialed_submissions; check those separately.`);
