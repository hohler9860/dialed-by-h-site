import { createCipheriv, createDecipheriv, randomBytes, createHmac, timingSafeEqual, scryptSync } from 'node:crypto';
export function encrypt(value, key) {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),data].map(v=>v.toString('base64url')).join('.');
}
export function decrypt(value,key) {
  const [iv,tag,data]=value.split('.').map(v=>Buffer.from(v,'base64url'));
  const decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv); decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8'));
}
export function equal(a,b) {
  const aa=Buffer.from(String(a)),bb=Buffer.from(String(b));
  return aa.length===bb.length && timingSafeEqual(aa,bb);
}
export function passwordMatch(candidate,password,key) {
  return timingSafeEqual(scryptSync(candidate,key,32),scryptSync(password,key,32));
}
export function sessionToken(key) {
  const payload=Buffer.from(JSON.stringify({expires:Date.now()+12*3600000,nonce:randomBytes(16).toString('hex')})).toString('base64url');
  return payload+'.'+createHmac('sha256',key).update(payload).digest('base64url');
}
export function validSession(token,key) {
  try { const [payload,sig]=token.split('.'); return equal(sig,createHmac('sha256',key).update(payload).digest('base64url')) && JSON.parse(Buffer.from(payload,'base64url')).expires>Date.now(); } catch { return false; }
}
export function cookie(req,name) { return (req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)||''; }
export function safeUrl(value,{optional=false}={}) {
  if (optional && !value) return null;
  let u; try {u=new URL(value);} catch {throw new Error('Enter a valid HTTPS URL.');}
  if(u.protocol!=='https:' || u.username || u.password) throw new Error('Use HTTPS URLs without embedded credentials.');
  return u.href;
}
