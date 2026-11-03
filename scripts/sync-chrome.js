#!/usr/bin/env node
// Writes the shared chrome from lib/brand-chrome.js into every static page,
// between its <!--dbh:x--> markers. Run it after changing the nav or footer:
//   node scripts/sync-chrome.js
const fs = require('fs');
const path = require('path');
const chrome = require('../lib/brand-chrome');
const root = path.join(__dirname, '..');

// page -> nav label to underline (null when the page is not in the nav)
const PAGES = {
    'about/index.html': 'About',
    'process/index.html': 'Process',
    'buy/index.html': 'Sourcing Catalogue',
    'journal/index.html': 'Journal',
    'boston.html': null,
    'buy-rolex-boston.html': null,
    'sell-rolex-boston.html': null,
    'rolex-dealer-boston.html': null,
    'patek-philippe-boston.html': null,
    'privacy.html': null,
    'trivia/index.html': null,
    '404.html': null,
};

for (const [file, active] of Object.entries(PAGES)) {
    const p = path.join(root, file);
    let html = fs.readFileSync(p, 'utf8');
    const blocks = {
        head: chrome.headAssets() + '\n' + chrome.pixel(),
        header: chrome.header(active),
        footer: chrome.footer() + '\n' + chrome.floats(),
        scripts: chrome.scripts(),
    };
    for (const [name, body] of Object.entries(blocks)) {
        const re = new RegExp(`<!--dbh:${name}-->[\\s\\S]*?<!--/dbh:${name}-->`);
        if (!re.test(html)) throw new Error(`${file}: missing dbh:${name} markers`);
        html = html.replace(re, () => `<!--dbh:${name}-->\n${body}\n<!--/dbh:${name}-->`);
    }
    fs.writeFileSync(p, html);
    console.log('synced', file);
}
