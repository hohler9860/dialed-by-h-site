import test from 'node:test';
import assert from 'node:assert/strict';
import { openDB,settings,setSetting,nowISO } from '../src/db.js';
import { createPost } from '../src/editorial.js';
import { XClient } from '../src/x-client.js';
import { publishDue,verifyDeliveries } from '../src/worker.js';
import { reviewAutonomousDrafts } from '../src/autonomy.js';
import { bridgeAction,socialStatus } from '../src/admin-bridge.js';
const fixture=t=>{const db=openDB(':memory:');t.after(()=>db.close());return db;};
const config={secret:'a'.repeat(64),openaiKey:'test-private-key',model:'test',appUrl:'https://poster.example.com'};
const client=(db,data)=>{const x=new XClient(db,config,async()=>new Response(JSON.stringify({data})));x.save({user:{id:'42',username:'dialedbyh'},access_token:'private-access-token',expires_at:Date.now()+3600000});setSetting(db,'xAccountId','42');return x;};
const draft=(db,body='Which case shape would you choose for everyday wear?')=>{
  const p=createPost(db,{body,category:'Opinion',scheduledAt:new Date(Date.now()+3600000).toISOString()});
  db.prepare('UPDATE posts SET ai_generated=1 WHERE id=?').run(p.id);return p;
};
const verdict=data=>async()=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(data)}]}]}));
test('Each publish checks the immutable account ID, even if the returned handle matches',async t=>{
  const db=fixture(t),x=client(db,{id:'99',username:'dialedbyh'}),p=draft(db);let sends=0;
  x.publish=async()=>{sends++;return '123';};setSetting(db,'paused',false);
  db.prepare("UPDATE posts SET status='scheduled',reviewed_at=?,scheduled_at=? WHERE id=?").run(nowISO(),new Date(Date.now()-1000).toISOString(),p.id);
  assert.equal((await publishDue(db,x)).status,'failed');assert.equal(sends,0);assert.equal(settings(db).paused,true);
});
test('Readback compares authors and text, expands links, decodes entities and removes only confirmed picture URLs',async t=>{
  const db=fixture(t),post={x_id:'123',body:'Watches & bracelets https://example.com/source',media_id:'photo'};
  const data={id:'123',author_id:'42',text:'Watches &amp; bracelets https://t.co/link https://t.co/photo',entities:{urls:[{url:'https://t.co/link',expanded_url:'https://example.com/source'},{url:'https://t.co/photo',expanded_url:'https://x.com/dialedbyh/status/123/photo/1'}]}};
  const x=client(db,data);await x.verifyPost(post,'42');
  await assert.rejects(()=>x.verifyPost(post,'99'),/author/);
  await assert.rejects(()=>x.verifyPost({...post,body:'Different text'},'42'),/differs/);
  await assert.rejects(()=>x.verifyPost({...post,media_id:null},'42'),/differs/);
});
test('Verified delivery is separate from API acceptance; failed verification pauses without reposting',async t=>{
  const db=fixture(t),p=draft(db),x=client(db,{id:'42',username:'dialedbyh'});let sends=0;
  x.publish=async()=>{sends++;return '123';};x.verifyPost=async()=>{throw new Error('Not found yet');};
  setSetting(db,'paused',false);db.prepare("UPDATE posts SET status='scheduled',reviewed_at=?,scheduled_at=? WHERE id=?").run(nowISO(),new Date(Date.now()-1000).toISOString(),p.id);
  await publishDue(db,x);assert.equal(db.prepare('SELECT status FROM post_verifications').get().status,'pending');
  for(let i=0;i<3;i++){db.prepare('UPDATE post_verifications SET next_check=?').run(nowISO());await verifyDeliveries(db,x);}
  assert.equal(db.prepare('SELECT status FROM post_verifications').get().status,'unverified');assert.equal(settings(db).paused,true);assert.equal(sends,1);
  await assert.rejects(()=>bridgeAction(db,x,config,{action:'resume'}),/outstanding/);
  await bridgeAction(db,x,config,{action:'recheck',id:p.id});
  await assert.rejects(()=>bridgeAction(db,x,config,{action:'resume'}),/outstanding/);
  x.verifyPost=async()=>({id:'123'});await verifyDeliveries(db,x);
  assert.equal(db.prepare('SELECT status FROM post_verifications').get().status,'verified');assert.equal(sends,1);
});
test('Autonomy schedules only accepted evergreen drafts and holds unsupported timely claims',async t=>{
  const db=fixture(t);setSetting(db,'autonomy','autonomous');const p=draft(db);
  assert.deepEqual(await reviewAutonomousDrafts(db,config,verdict({approved:true,timeSensitive:false,reasons:[]})),{scheduled:1,held:0});
  assert.equal(db.prepare('SELECT status FROM posts WHERE id=?').get(p.id).status,'scheduled');
  const timely=draft(db,'This watch is currently available.');let calls=0;
  const result=await reviewAutonomousDrafts(db,config,async()=>{calls++;throw new Error('must not request');});
  assert.equal(result.held,1);assert.equal(calls,0);assert.equal(db.prepare('SELECT status FROM posts WHERE id=?').get(timely.id).status,'draft');
});
test('Editorial outages fail closed; held drafts are not repeatedly submitted',async t=>{
  const db=fixture(t);setSetting(db,'autonomy','autonomous');draft(db);let calls=0;
  const fetcher=async()=>{calls++;throw new Error('Provider offline');};
  assert.equal((await reviewAutonomousDrafts(db,config,fetcher)).held,1);
  await reviewAutonomousDrafts(db,config,fetcher);assert.equal(calls,1);
});
test('Human edits and switching to review during an in-flight assessment prevent automatic approval',async t=>{
  const db=fixture(t),x=client(db,{id:'42',username:'dialedbyh'});setSetting(db,'autonomy','autonomous');const p=draft(db);
  const response=verdict({approved:true,timeSensitive:false,reasons:[]});
  await reviewAutonomousDrafts(db,config,async()=>{await bridgeAction(db,x,config,{action:'edit',id:p.id,version:p.version,body:'Would you choose a leather strap for your next watch?',scheduledAt:p.scheduled_at});return response();});
  assert.equal(db.prepare('SELECT status FROM posts WHERE id=?').get(p.id).status,'draft');
  let calls=0;await reviewAutonomousDrafts(db,config,async()=>{calls++;return response();});assert.equal(calls,0);
  const second=draft(db,'A dial can change character when viewed in daylight.');
  await reviewAutonomousDrafts(db,config,async()=>{setSetting(db,'autonomy','review');return response();});
  assert.equal(db.prepare('SELECT status FROM posts WHERE id=?').get(second.id).status,'draft');
});
test('Website status exposes proof and connection health but never access tokens or lead contact data',async t=>{
  const db=fixture(t),x=client(db,{id:'42',username:'dialedbyh'});
  const state=socialStatus(db,x,config);assert.equal(state.account.id,'42');assert.equal(state.worker.healthy,false);assert.equal(state.reddit.connected,false);
  assert.equal(JSON.stringify(state).includes('private-access-token'),false);assert.equal(JSON.stringify(state).includes(config.openaiKey),false);
  await bridgeAction(db,x,config,{action:'mode',mode:'autonomous'});assert.equal(settings(db).paused,true);assert.equal(settings(db).autoGenerate,true);
  await assert.rejects(()=>bridgeAction(db,x,{...config,openaiKey:''},{action:'mode',mode:'autonomous'}),/Connect/);
});

test('Explicit evidence holds cannot be overridden by an automatic approval verdict',async t=>{
  const db=fixture(t),p=draft(db);setSetting(db,'autonomy','autonomous');
  db.prepare('UPDATE posts SET editorial_note=? WHERE id=?').run('HOLD: Henry has not confirmed this first-hand experience.',p.id);
  let calls=0;
  const result=await reviewAutonomousDrafts(db,config,async()=>{calls++;return verdict({approved:true,reasons:[],timeSensitive:false})();});
  assert.deepEqual(result,{scheduled:0,held:1});assert.equal(calls,0);
  assert.equal(db.prepare('SELECT status FROM posts WHERE id=?').get(p.id).status,'draft');
});
