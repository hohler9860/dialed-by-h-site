import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
export const nowISO = () => new Date().toISOString();
export const id = () => randomUUID();
export function openDB(path) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS posts(
      id TEXT PRIMARY KEY, body TEXT NOT NULL, category TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
      scheduled_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, reviewed_at TEXT,
      source_ids TEXT NOT NULL DEFAULT '[]', editorial_note TEXT NOT NULL DEFAULT '', ai_generated INTEGER NOT NULL DEFAULT 0,
      factual INTEGER NOT NULL DEFAULT 0, media_id TEXT, x_id TEXT UNIQUE, published_at TEXT,
      error TEXT, attempts INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1,
      metrics TEXT NOT NULL DEFAULT '{}', metrics_at TEXT, batch_date TEXT
    );
    CREATE INDEX IF NOT EXISTS posts_due ON posts(status,scheduled_at);
    CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT UNIQUE, excerpt TEXT NOT NULL,
      kind TEXT NOT NULL, published_at TEXT, fetched_at TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS feeds(id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT UNIQUE NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1, checked_at TEXT, error TEXT);
    CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY, filename TEXT NOT NULL, mime TEXT NOT NULL,
      alt TEXT NOT NULL, rights TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS media_catalog(media_id TEXT PRIMARY KEY REFERENCES media(id), piece_id TEXT NOT NULL,
      source_url TEXT UNIQUE NOT NULL, brand TEXT NOT NULL, model TEXT NOT NULL, reference TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS post_image_checks(post_id TEXT PRIMARY KEY REFERENCES posts(id),version INTEGER NOT NULL,
      status TEXT NOT NULL,reason TEXT NOT NULL,checked_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS leads(id TEXT PRIMARY KEY, name TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '',
      watch TEXT NOT NULL DEFAULT '', budget TEXT NOT NULL DEFAULT '', stage TEXT NOT NULL DEFAULT 'new',
      post_id TEXT REFERENCES posts(id), notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      external_id TEXT UNIQUE);
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, message TEXT NOT NULL,
      post_id TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS credentials(name TEXT PRIMARY KEY, encrypted TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth(state TEXT PRIMARY KEY, verifier TEXT NOT NULL, session TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_handoffs(token_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs(key TEXT PRIMARY KEY, status TEXT NOT NULL, updated_at TEXT NOT NULL, error TEXT);
    CREATE TABLE IF NOT EXISTS locks(name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS spend(id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, amount REAL NOT NULL,
      created_at TEXT NOT NULL, note TEXT);
    CREATE TABLE IF NOT EXISTS post_verifications(post_id TEXT PRIMARY KEY REFERENCES posts(id),
      expected_author TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', checked_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0, next_check TEXT, error TEXT);
    CREATE TABLE IF NOT EXISTS draft_batches(day TEXT PRIMARY KEY, run_id TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL, updated_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 1,
      sources_json TEXT NOT NULL, post_ids TEXT NOT NULL DEFAULT '[]', cost REAL NOT NULL DEFAULT 0, error TEXT);
    CREATE TABLE IF NOT EXISTS editorial_reviews(post_id TEXT PRIMARY KEY REFERENCES posts(id),
      version INTEGER NOT NULL, body_hash TEXT NOT NULL, approved INTEGER NOT NULL, reasons TEXT NOT NULL, created_at TEXT NOT NULL);
  `);
  const defaults = { paused: true, autoGenerate: false, autonomy: 'review', timezone: 'America/New_York',
    slots: ['08:30','11:30','14:30','17:30','20:30'], handle: 'dialedbyh',
    sourceUrl: 'https://www.dialedbyhenry.com/source', dailyMax: 5,
    monthlyXBudget: 20, generationDailyMax: 3,
    voice: 'Henry at Dialed by H. Knowledgeable watch concierge, direct, specific, conversational. Have a clear point of view. Explain tradeoffs for buyers. No corporate language, invented client stories, hype, guaranteed investments, or generic engagement bait. No hashtags by default. One purpose and at most one CTA per post.' };
  for (const [key,value] of Object.entries(defaults)) db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run(key,JSON.stringify(value));
  return db;
}
export function settings(db) { return Object.fromEntries(db.prepare('SELECT * FROM settings').all().map(r=>[r.key,JSON.parse(r.value)])); }
export function setSetting(db,key,value) { db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(key,JSON.stringify(value)); }
export function event(db,type,message,postId=null) { db.prepare('INSERT INTO events(type,message,post_id,created_at) VALUES (?,?,?,?)').run(type,message,postId,nowISO()); }
export function transaction(db, fn) { db.exec('BEGIN IMMEDIATE'); try { const result=fn(); db.exec('COMMIT'); return result; } catch(e) { db.exec('ROLLBACK'); throw e; } }
export function acquire(db,name,owner,ms=180000) {
  return transaction(db,()=> {
    db.prepare('DELETE FROM locks WHERE expires_at < ?').run(Date.now());
    return db.prepare('INSERT OR IGNORE INTO locks VALUES (?,?,?)').run(name,owner,Date.now()+ms).changes===1;
  });
}
export function release(db,name,owner) { db.prepare('DELETE FROM locks WHERE name=? AND owner=?').run(name,owner); }
