import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.js';

async function fixture(t,overrides={}) {
  const dataDir=mkdtempSync(join(tmpdir(),'dialed-api-'));
  const config={dataDir,production:false,host:'127.0.0.1',port:0,appUrl:'http://127.0.0.1',secret:'a'.repeat(64),adminPassword:'',openaiKey:'',model:'test',xClientId:'',xClientSecret:'',leadSecret:'test-webhook',...overrides};
  const app=createApp(config,{worker:false});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));config.appUrl=`http://127.0.0.1:${app.server.address().port}`;
  t.after(async()=>{await new Promise(r=>app.server.close(r));app.db.close();rmSync(dataDir,{recursive:true,force:true});});
  const response=await fetch(config.appUrl+'/api/session');const session=await response.json();const cookie=response.headers.get('set-cookie')?.split(';')[0]||'';
  async function call(path,method='GET',data,extraHeaders={}) {
    const r=await fetch(config.appUrl+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':session.csrf||'',...extraHeaders},body:data===undefined?undefined:JSON.stringify(data)});
    return {status:r.status,body:await r.json(),headers:r.headers};
  }
  return {app,config,call,session};
}
test('Local dashboard boots with safe defaults, hides secrets, rejects CSRF and cross-origin mutation',async t=>{
  const {call,session,config}=await fixture(t);assert.equal(session.authenticated,true);
  const r=await call('/api/state');assert.equal(r.status,200);assert.equal(r.body.settings.paused,true);assert.equal(r.body.posts.length,5);assert.equal(r.body.feeds.length,2);
  assert.equal((await call('/api/settings','PATCH',{paused:false})).status,400);
  assert.equal((await call('/api/settings','PATCH',{paused:true},{'X-CSRF-Token':''})).status,403);
  assert.equal((await call('/api/settings','PATCH',{paused:true},{Origin:'https://attacker.example'})).status,403);
  const unauthenticated=await fetch(config.appUrl+'/api/state');assert.equal(unauthenticated.status,401);
});
test('Draft save, approval, edit invalidation and optimistic version checks work end to end',async t=>{
  const {call}=await fixture(t);const state=(await call('/api/state')).body;const post=state.posts[0];
  assert.equal((await call(`/api/posts/${post.id}/approve`,'POST',{version:post.version})).status,200);
  let current=(await call('/api/state')).body.posts.find(p=>p.id===post.id);assert.equal(current.status,'scheduled');
  const edit={body:'Would you buy a watch without ever trying the same model on your wrist?',category:'Opinion',scheduledAt:current.scheduled_at,sourceIds:[],factual:false,note:'Updated opinion',version:current.version};
  assert.equal((await call(`/api/posts/${post.id}`,'PATCH',edit)).status,200);
  current=(await call('/api/state')).body.posts.find(p=>p.id===post.id);assert.equal(current.status,'draft');assert.equal(current.reviewed_at,null);
  assert.equal((await call(`/api/posts/${post.id}`,'PATCH',edit)).status,409);
  assert.equal((await call(`/api/posts/${post.id}/approve`,'POST',{version:post.version})).status,400);
});
test('Sources, manual leads, stage updates and webhook attribution persist with duplicate protection',async t=>{
  const {call,config}=await fixture(t);
  assert.equal((await call('/api/sources','POST',{title:'My observation',excerpt:'I prefer a compact watch for everyday wear.',verified:true})).status,201);
  const post=(await call('/api/state')).body.posts[0];
  const input={name:'Test buyer',contact:'test@example.invalid',watch:'Watch shortlist',budget:'To discuss',stage:'new',postId:post.id,notes:'Synthetic test data'};
  const lead=await call('/api/leads','POST',input);assert.equal(lead.status,201);
  assert.equal((await call('/api/leads/'+lead.body.id,'PATCH',{...input,stage:'qualified'})).status,200);
  assert.equal((await call('/api/leads/webhook','POST',{...input,externalId:'test-1'})).status,401);
  const headers={Authorization:'Bearer '+config.leadSecret};const first=await call('/api/leads/webhook','POST',{...input,externalId:'test-1'},headers);
  const repeat=await call('/api/leads/webhook','POST',{...input,externalId:'test-1'},headers);
  assert.equal(first.status,201);assert.equal(repeat.body.duplicate,true);assert.equal(first.body.id,repeat.body.id);
  const link=await call(`/api/posts/${post.id}/link`);assert.equal(link.status,400);assert.match(link.body.error,/Links are disabled/);
});
test('Credential inputs are encrypted, redacted, and never present in state responses',async t=>{
  const {call,app}=await fixture(t);const secret='sk-test-not-a-real-key';
  assert.equal((await call('/api/integrations','POST',{openaiKey:secret,xClientId:'test-id',xClientSecret:'test-secret'})).status,200);
  const state=(await call('/api/state')).body;assert.equal(state.connections.ai,true);assert.equal(state.connections.xConfigured,true);
  assert.equal(JSON.stringify(state).includes(secret),false);assert.equal(app.db.prepare("SELECT encrypted FROM credentials WHERE name='integrations'").get().encrypted.includes(secret),false);
});
test('Password-protected mode requires a login, rejects wrong passwords, and issues an HttpOnly session',async t=>{
  const {call,session}=await fixture(t,{adminPassword:'a-long-enough-password'});assert.equal(session.authenticated,false);
  assert.equal((await call('/api/state')).status,401);assert.equal((await call('/api/login','POST',{password:'incorrect'})).status,401);
  const result=await call('/api/login','POST',{password:'a-long-enough-password'});assert.equal(result.status,200);assert.match(result.headers.get('set-cookie'),/HttpOnly/);assert.ok(result.body.csrf);
});

test('Website bridge requires its own secret, even for a logged-in local admin',async t=>{
  const {call,config}=await fixture(t,{bridgeSecret:'bridge-secret-'.repeat(4)});
  assert.equal((await call('/api/admin-bridge','POST',{action:'status'})).status,401);
  const headers={Authorization:'Bearer '+config.bridgeSecret,'X-CSRF-Token':''};
  const result=await call('/api/admin-bridge','POST',{action:'status'},headers);
  assert.equal(result.status,200);assert.equal(result.body.configured,true);assert.equal(result.body.account,null);
  assert.equal(JSON.stringify(result.body).includes(config.bridgeSecret),false);
  assert.equal((await call('/api/admin-bridge','POST',{action:'resume'},headers)).status,400);
  assert.equal((await call('/api/admin-bridge','POST',{action:'mode',mode:'autonomous'},headers)).status,400);
});

test('Native workspace authenticates, validates operations, saves drafts, redacts keys and queues slow work',async t=>{
  const {call,config}=await fixture(t,{bridgeSecret:'b'.repeat(40),adminPassword:'protected-local-admin'});
  const headers={Authorization:'Bearer '+config.bridgeSecret};
  const bridge=(operation,payload={},id)=>call('/api/admin-bridge','POST',{action:'workspace',operation,payload,id},headers);
  assert.equal((await call('/api/admin-bridge','POST',{action:'workspace',operation:'state'})).status,401);
  assert.equal((await bridge('logout')).status,400);
  assert.equal((await bridge('edit',{},'../../settings')).status,400);
  assert.equal((await bridge('settings',{slots:['01:00']})).status,400);
  assert.equal((await bridge('integrations',{openaiKey:'test-secret-key'})).status,200);
  const state=await bridge('state');assert.equal(state.status,200);assert.equal(state.body.connections.ai,true);assert.equal(JSON.stringify(state.body).includes('test-secret-key'),false);
  const post=state.body.posts[0];
  assert.equal((await bridge('edit',{...post,body:'What detail makes you keep a watch for years?',scheduledAt:post.scheduled_at,version:post.version,sourceIds:[],factual:false},post.id)).status,200);
  assert.equal((await bridge('edit',{version:post.version},post.id)).status,409);
  const current=(await bridge('state')).body.posts.find(p=>p.id===post.id);assert.equal(current.status,'draft');assert.equal(current.version,post.version+1);
  assert.equal((await bridge('generate',{day:'2099-01-20'})).status,202);
  assert.equal((await bridge('refresh')).status,202);
  assert.equal((await bridge('state')).body.jobs.filter(j=>j.status==='queued').length,2);
  assert.equal((await call('/api/state')).status,401);
});

test('Admin OAuth tickets expire, are single-use and bind the callback without granting a service login',async t=>{
  const {call,config,app}=await fixture(t,{bridgeSecret:'c'.repeat(40),adminPassword:'protected-local-admin',xClientId:'mock-client',adminUrl:'https://www.dialedbyhenry.com/admin/#social'});
  const mint=async()=> (await call('/api/admin-bridge','POST',{action:'connect'},{Authorization:'Bearer '+config.bridgeSecret})).body.url;
  const expired=await mint();app.db.prepare('UPDATE admin_handoffs SET expires_at=0').run();
  assert.equal((await fetch(expired,{redirect:'manual'})).status,401);
  const ticket=await mint();const start=await fetch(ticket,{redirect:'manual'});assert.equal(start.status,303);
  assert.equal((await fetch(ticket,{redirect:'manual'})).status,401);
  const cookie=start.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.doesNotMatch(cookie,/dialed_session/);
  const state=new URL(start.headers.get('location')).searchParams.get('state');
  const callback=config.appUrl+'/auth/x/callback?state='+state+'&code=mock';
  assert.equal((await fetch(callback,{redirect:'manual',headers:{Cookie:'dialed_x_link=wrong'}})).status,401);
  app.x.fetch=async url=>new Response(JSON.stringify(url.includes('/oauth2/token')?{access_token:'secret-x-token',refresh_token:'secret-refresh',expires_in:7200}:{data:{id:'12345',username:'dialedbyh'}}));
  const done=await fetch(callback,{redirect:'manual',headers:{Cookie:cookie.split(';')[0]}});
  assert.equal(done.status,303);assert.equal(done.headers.get('location'),config.adminUrl);
  assert.equal(app.x.account().user.id,'12345');
  assert.equal((await fetch(config.appUrl+'/api/state',{headers:{Cookie:cookie.split(';')[0]}})).status,401);
  assert.equal((await fetch(callback,{redirect:'manual',headers:{Cookie:cookie.split(';')[0]}})).status,401);
  const cancelStart=await fetch(await mint(),{redirect:'manual'}),cancelState=new URL(cancelStart.headers.get('location')).searchParams.get('state');
  const cancelled=await fetch(config.appUrl+'/auth/x/callback?error=access_denied&state='+cancelState,{redirect:'manual',headers:{Cookie:cancelStart.headers.get('set-cookie').split(';')[0]}});
  assert.equal(cancelled.status,303);assert.match(cancelled.headers.get('location'),/social_connection=failed/);
});
