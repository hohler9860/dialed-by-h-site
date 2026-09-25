import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDB,id,nowISO,settings,setSetting,acquire,release } from '../src/db.js';
import { createPost,quality,approve,lengthOf,datesFor,similarity } from '../src/editorial.js';
import { publishDue,syncMetrics } from '../src/worker.js';
import { encrypt,decrypt,sessionToken,validSession } from '../src/security.js';
import { parseFeed,publicAddress } from '../src/research.js';
import { generateDrafts } from '../src/generator.js';
import { XClient,XError } from '../src/x-client.js';

const fixture=t=>{const db=openDB(':memory:');t.after(()=>db.close());return db;};
function due(db,text='The best watch is the one that fits the way you actually spend your week.') {
  const p=createPost(db,{body:text,category:'Opinion',scheduledAt:new Date(Date.now()-60000).toISOString()});
  db.prepare("UPDATE posts SET status='scheduled',reviewed_at=? WHERE id=?").run(nowISO(),p.id);setSetting(db,'paused',false);return p;
}
function fakeX(publish=async()=> '1234567890123456789') {return {account:()=>({user:{id:'42'}}),accessToken:async()=> 'token',ensureIdentity:async()=>({id:'42'}),publish,upload:async()=> '123'};}
test('X weighted length handles URLs, emoji and Unicode',()=> {
  assert.equal(lengthOf('https://example.com/very-long-address'),23);
  assert.equal(lengthOf('⌚'),2);assert.equal(lengthOf('a'.repeat(280)),280);
  assert.ok(similarity('Buying watches with confidence','Buying watches with confidence!')>.9);
});
test('Scheduling observes Eastern daylight saving transitions',()=> {
  const s={timezone:'America/New_York',slots:['08:30','11:30','14:30','17:30','20:30']};
  assert.match(datesFor('2026-07-01',s)[0],/12:30:00.000Z/);assert.match(datesFor('2026-12-01',s)[0],/13:30:00.000Z/);
  assert.throws(()=>datesFor('2026-03-08',{...s,slots:['02:30']}),/does not exist/);
});
test('Approval requires a future slot, current version, factual sources and verified evidence',t=>{
  const db=fixture(t),p=createPost(db,{body:'This reference was introduced in 2020.',category:'Discovery',factual:true,scheduledAt:new Date(Date.now()+3600000).toISOString()});
  assert.throws(()=>approve(db,p.id,1),/source/);
  const sid=id();db.prepare('INSERT INTO sources VALUES (?,?,?,?,?,?,?,?)').run(sid,'Reference documentation','https://example.com','Details','manual',null,nowISO(),0);
  db.prepare('UPDATE posts SET source_ids=? WHERE id=?').run(JSON.stringify([sid]),p.id);assert.throws(()=>approve(db,p.id,1),/Verify/);
  db.prepare('UPDATE sources SET verified=1 WHERE id=?').run(sid);assert.throws(()=>approve(db,p.id,0),/changed/);
  approve(db,p.id,1);assert.equal(db.prepare('SELECT status FROM posts WHERE id=?').get(p.id).status,'scheduled');
});
test('Duplicate posts and unsupported price claims are blocked',t=> {
  const db=fixture(t);createPost(db,{body:'A smaller watch often feels better to me.',category:'Opinion'});
  const duplicate=createPost(db,{body:'A smaller watch often feels better to me!',category:'Opinion'});assert.ok(quality(db,duplicate).errors.some(x=>x.includes('similar')));
  const price=createPost(db,{body:'This watch costs $5000 today.',category:'Buyer advice'});assert.ok(quality(db,price).errors.some(x=>x.includes('price')));
});
test('Only approved posts can publish, and a confirmed post is never sent twice',async t=>{
  const db=fixture(t);let calls=0;const x=fakeX(async()=>{calls++;return '1234567890123456789';});
  createPost(db,{body:'A draft should never be sent.',category:'Opinion'});setSetting(db,'paused',false);
  assert.equal((await publishDue(db,x)).status,'idle');const p=due(db);
  assert.equal((await publishDue(db,x)).status,'posted');await publishDue(db,x);assert.equal(calls,1);
  assert.equal(db.prepare('SELECT x_id FROM posts WHERE id=?').get(p.id).x_id,'1234567890123456789');
});
test('A network timeout pauses publishing and requires human reconciliation',async t=>{
  const db=fixture(t),p=due(db);let calls=0;const x=fakeX(async()=>{calls++;throw new Error('timeout');});
  assert.equal((await publishDue(db,x)).status,'uncertain');assert.equal(settings(db).paused,true);
  assert.equal(db.prepare('SELECT status FROM posts WHERE id=?').get(p.id).status,'uncertain');await publishDue(db,x);assert.equal(calls,1);
});
test('429 retries are bounded, definite rejections fail, and 5xx remains uncertain',async t=>{
  for(const [code,expected] of [[429,'rate_limited'],[403,'failed'],[503,'uncertain']]) {
    const db=fixture(t);due(db);assert.equal((await publishDue(db,fakeX(async()=>{throw new XError(code,Date.now()+60000);}))).status,expected);
  }
});
test('Interrupted publishing is never silently retried',async t=>{
  const db=fixture(t),p=due(db);db.prepare("UPDATE posts SET status='publishing',updated_at=? WHERE id=?").run(new Date(Date.now()-20*60000).toISOString(),p.id);
  await publishDue(db,fakeX());assert.equal(db.prepare('SELECT status FROM posts WHERE id=?').get(p.id).status,'uncertain');
});
test('Missed slots expire; monthly budget blocks before the external request',async t=>{
  const db=fixture(t),p=due(db);db.prepare('UPDATE posts SET scheduled_at=? WHERE id=?').run(new Date(Date.now()-31*60000).toISOString(),p.id);
  let called=false;await publishDue(db,fakeX(async()=>{called=true;}));assert.equal(called,false);assert.equal(db.prepare('SELECT status FROM posts WHERE id=?').get(p.id).status,'expired');
  due(db,'Do you choose the bracelet first, or the dial?');setSetting(db,'monthlyXBudget',0);
  assert.equal((await publishDue(db,fakeX(async()=>{called=true;}))).status,'error');assert.equal(called,false);
});
test('Daily cap and spacing hold even if queue is manipulated',async t=>{
  const db=fixture(t);const p=due(db);db.prepare("UPDATE posts SET status='posted',published_at=? WHERE id=?").run(nowISO(),p.id);
  due(db,'My next purchase starts with trying the case on.');assert.equal((await publishDue(db,fakeX())).status,'spacing');
  setSetting(db,'dailyMax',1);assert.equal((await publishDue(db,fakeX())).status,'daily_cap');
});
test('Concurrent workers cannot both create a post',async t=>{
  const db=fixture(t);due(db);let resolvePublish,calls=0;
  const x=fakeX(()=>{calls++;return new Promise(r=>resolvePublish=r);});
  const first=publishDue(db,x);await new Promise(r=>setImmediate(r));assert.equal((await publishDue(db,x)).status,'busy');resolvePublish('1234567890123456789');await first;assert.equal(calls,1);
});
test('Encryption rejects tampering; session tokens expire and reject modification',()=>{
  const key='a'.repeat(64),secret={access_token:'private'};const encrypted=encrypt(secret,key);
  assert.ok(!encrypted.includes('private'));assert.deepEqual(decrypt(encrypted,key),secret);assert.throws(()=>decrypt(encrypted,'b'.repeat(64)));
  const token=sessionToken(key);assert.equal(validSession(token,key),true);assert.equal(validSession(token+'x',key),false);
});
test('Research rejects private IPs, parses RSS and Atom, and blocks entity declarations',()=>{
  for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','::1','::ffff:127.0.0.1','fc00::1']) assert.equal(publicAddress(ip),false,ip);
  assert.equal(publicAddress('8.8.8.8'),true);
  const rss='<rss><channel><item><title>A watch</title><link>https://example.com/watch</link><description><![CDATA[<p>A &amp; B</p>]]></description></item></channel></rss>';
  assert.equal(parseFeed(rss)[0].excerpt,'A & B');
  assert.equal(parseFeed('<feed><entry><title>A</title><link href="https://example.com/a"/><summary>B</summary></entry></feed>')[0].url,'https://example.com/a');
  assert.throws(()=>parseFeed('<!DOCTYPE a><rss/>'),/declarations/);
});
test('Structured generation persists a review-only batch and prevents repeat runs',async t=>{
  const db=fixture(t),posts=['Opinion','Buyer advice','Discovery','Dealer perspective','Sourcing'].map((category,i)=>({body:['Which case shape would you try next?','Start a shortlist with your daily routine.','A detail you only notice in person can change your mind.','I prefer three deliberate choices to an endless list.','Tell me what you are looking for and I can help narrow the search.'][i],category,sourceIds:[],factual:false,note:'Review the proposed opinion.'}));
  const fetcher=async()=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({posts})}]}]}),{status:200});
  const result=await generateDrafts(db,{openaiKey:'test',model:'test'},'2099-01-01',fetcher);assert.equal(result.length,5);assert.ok(result.every(p=>p.status==='draft'));
  await assert.rejects(()=>generateDrafts(db,{openaiKey:'test'},'2099-01-01',fetcher),/already/);
});
test('An invented source ID makes generation atomic: no partial batch is saved',async t=>{
  const db=fixture(t),posts=['Opinion','Buyer advice','Discovery','Dealer perspective','Sourcing'].map((category,i)=>({body:`Useful angle ${i}`,category,sourceIds:i===3?['invented']:[],factual:false,note:''}));
  const fetcher=async()=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({posts})}]}]}));
  await assert.rejects(()=>generateDrafts(db,{openaiKey:'test',model:'test'},'2099-01-01',fetcher),/sources/);assert.equal(db.prepare('SELECT COUNT(*) n FROM posts').get().n,0);
});
test('X OAuth state is session-bound, credentials encrypted, refresh serialized, and create is not retried',async t=>{
  const db=fixture(t),config={secret:'a'.repeat(64),xClientId:'client',xClientSecret:'secret',appUrl:'https://poster.example.com'};
  let tokens=0,creates=0;const fetcher=async(url,options)=>{
    if(url.endsWith('/oauth2/token')) {tokens++;return new Response(JSON.stringify({access_token:'new',refresh_token:'refresh',expires_in:7200}));}
    if(url.endsWith('/tweets')) {creates++;return new Response('{}',{status:500});}
    return new Response(JSON.stringify({data:{id:'42',username:'dialedbyh'}}));
  };
  const x=new XClient(db,config,fetcher),url=new URL(x.authorize('session'));
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');await assert.rejects(()=>x.callback('code',url.searchParams.get('state'),'wrong'),/session/);
  await x.callback('code',url.searchParams.get('state'),'session');assert.equal(x.account().user.username,'dialedbyh');
  x.save({...x.account(),expires_at:0});await Promise.all([x.accessToken(),x.accessToken()]);assert.equal(tokens,2);
  await assert.rejects(()=>x.publish({body:'A proposed post',ai_generated:1}),/500/);assert.equal(creates,1);
});
test('SQLite state survives reopening and leases prevent conflicting work',t=>{
  const dir=mkdtempSync(join(tmpdir(),'dialed-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'db.sqlite');let db=openDB(path);
  const p=createPost(db,{body:'Persistence matters.',category:'Opinion'});assert.equal(acquire(db,'job','one'),true);assert.equal(acquire(db,'job','two'),false);release(db,'job','one');assert.equal(acquire(db,'job','two'),true);
  db.close();db=openDB(path);assert.equal(db.prepare('SELECT body FROM posts WHERE id=?').get(p.id).body,'Persistence matters.');db.close();
});
