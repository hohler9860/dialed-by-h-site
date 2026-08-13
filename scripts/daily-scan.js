#!/usr/bin/env node
/**
 * The 8am scan behind the admin Today page. Runs the three channel
 * reconcilers in sequence so waiting_on_henry / hunting_board / day_summary
 * are computed from this morning's conversations, not last week's.
 *
 * Scheduled by launchd (com.dialedbyh.daily-scan, 8:00 local time) and safe
 * to run by hand:  node scripts/daily-scan.js
 *
 * One failing channel must not silence the others, so each script runs to
 * completion and failures are reported at the end.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const SCRIPTS = [
  'imessage-reconcile.js',
  'whatsapp-reconcile.js',
  'email-reconcile.js',
];

console.log(`\n=== daily scan ${new Date().toISOString()} ===`);
const failed = [];
for (const s of SCRIPTS) {
  console.log(`\n--- ${s} ---`);
  const r = spawnSync(process.execPath, [path.join(__dirname, s)],
    { stdio: 'inherit', timeout: 10 * 60 * 1000 });
  if (r.status !== 0) failed.push(`${s} (exit ${r.status})`);
}

if (failed.length) {
  console.error(`\nFAILED: ${failed.join(', ')}`);
  process.exit(1);
}
console.log('\nAll channels reconciled.');
