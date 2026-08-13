#!/usr/bin/env node
/**
 * The scan behind the admin Today page. Runs the three channel reconcilers in
 * sequence so waiting_on_henry / hunting_board / day_summary are computed
 * from this morning's conversations, not last week's.
 *
 * Scheduled by launchd (com.dialedbyh.daily-scan, every 2h from 8:00 to
 * 22:00 local) and safe to run by hand:  node scripts/daily-scan.js
 *
 * launchd fires missed jobs the moment the Mac wakes, which is routinely
 * BEFORE Wi-Fi is back — the 8am run used to die on the first fetch. So:
 * wait for the network first, and give each script a second try.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRIPTS = [
  'imessage-reconcile.js',
  'whatsapp-reconcile.js',
  'email-reconcile.js',
];

// ── env (for the network probe target) ──────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Up to 5 minutes for Wi-Fi to come back after wake. Probing Supabase itself
// (not a generic host) so "network up" means the host the scripts need.
async function waitForNetwork() {
  const target = process.env.SUPABASE_URL || 'https://www.apple.com';
  for (let i = 0; i < 30; i++) {
    try {
      await fetch(target, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      if (i) console.log(`network up after ${i * 10}s`);
      return true;
    } catch { await sleep(10000); }
  }
  return false;
}

(async () => {
  console.log(`\n=== daily scan ${new Date().toISOString()} ===`);
  if (!(await waitForNetwork())) {
    console.error('No network after 5 minutes; giving up until the next run.');
    process.exit(1);
  }

  const failed = [];
  for (const s of SCRIPTS) {
    console.log(`\n--- ${s} ---`);
    const run = () => spawnSync(process.execPath, [path.join(__dirname, s)],
      { stdio: 'inherit', timeout: 10 * 60 * 1000 });
    let r = run();
    if (r.status !== 0 && r.status !== 2) {   // exit 2 = missing permission, retrying won't help
      console.log(`retrying ${s} in 30s...`);
      await sleep(30000);
      r = run();
    }
    if (r.status !== 0) failed.push(`${s} (exit ${r.status})`);
  }

  if (failed.length) {
    console.error(`\nFAILED: ${failed.join(', ')}`);
    process.exit(1);
  }
  console.log('\nAll channels reconciled.');
})();
