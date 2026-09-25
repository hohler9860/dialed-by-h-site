import { mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

export function configFromEnv(env = process.env) {
  const dataDir = resolve(env.DATA_DIR || './data');
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  chmodSync(dataDir, 0o700);
  const production = env.NODE_ENV === 'production';
  const host = env.HOST || '127.0.0.1';
  const port = Number(env.PORT || 4317);
  const appUrl = new URL(env.APP_URL || `http://127.0.0.1:${port}`).origin;
  if (production && (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 16 || !env.APP_SECRET || !appUrl.startsWith('https://'))) {
    throw new Error('Production requires HTTPS APP_URL, ADMIN_PASSWORD (16+ characters), and APP_SECRET (64 hex characters).');
  }
  if (!production && !['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('Development must bind to loopback. Use production mode for hosting.');
  const keyFile = resolve(dataDir, '.encryption-key');
  let secret = env.APP_SECRET;
  if (!secret) {
    if (!existsSync(keyFile)) writeFileSync(keyFile, randomBytes(32).toString('hex'), { mode: 0o600 });
    secret = readFileSync(keyFile, 'utf8').trim();
  }
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw new Error('APP_SECRET must be exactly 64 hex characters.');
  const adminUrl=new URL(env.WEBSITE_ADMIN_URL||'https://www.dialedbyhenry.com/admin/#social');
  if(adminUrl.protocol!=='https:'||adminUrl.username||adminUrl.password) throw new Error('WEBSITE_ADMIN_URL must be an HTTPS admin URL.');
  return { dataDir, production, host, port, appUrl, secret, adminUrl:adminUrl.href, adminPassword: env.ADMIN_PASSWORD || '',
    openaiKey: env.OPENAI_API_KEY || '', model: env.OPENAI_MODEL || 'gpt-4.1-mini',
    xClientId: env.X_CLIENT_ID || '', xClientSecret: env.X_CLIENT_SECRET || '', leadSecret: env.LEAD_WEBHOOK_SECRET || '', bridgeSecret: env.ADMIN_BRIDGE_SECRET || '' };
}
