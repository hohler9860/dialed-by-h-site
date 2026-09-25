import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {admin,oauth,tick,withRuntime} from '../native.mjs';
import {createPost} from '../src/editorial.js';
import {nowISO,setSetting} from '../src/db.js';
import {publishDue,verifyDeliveries} from '../src/worker.js';
const token='a'.repeat(64);
class MemoryStore {
  key='test-server-only-key';writes=0;heartbeats=0;mediaFiles=new Map();
  row={state:{},paused:true,control_version:0,lease_owner:null,lease_until:null,next_run_at:new Date(0).toISOString(),scheduler_secret_hash:createHash('sha256').update(token).digest('hex')};
  async read(){return structuredClone(this.row);}
  async claim(owner){if(this.row.lease_owner)return null;this.row.lease_owner=owner;return this.read();}
  async save(owner,state,next,pause,version){
    assert.equal(owner,this.row.lease_owner,'expired lease');
    if(pause===true&&!this.row.paused){this.row.paused=true;this.row.control_version++;}
    if(pause===false&&version===this.row.control_version)this.row.paused=false;
    this.row.state=structuredClone(state);this.row.next_run_at=next;this.row.last_run_at=nowISO();this.writes++;
    return {paused:this.row.paused,control_version:this.row.control_version};
  }
  async release(owner){if(this.row.lease_owner===owner)this.row.lease_owner=null;}
  async pause(){this.row.paused=true;this.row.control_version++;}
  async heartbeat(){this.heartbeats++;this.row.scheduler_heartbeat=nowISO();}
  async upload(media,data){this.mediaFiles.set(media.filename,data);}
  async media(media){return this.mediaFiles.get(media.filename);}
}
const options=store=>({store,env:{},fetcher:async()=>{throw Error('Unexpected network request');}});
async function connected(store,prepare=()=>{}){
  await withRuntime(options(store),async({db,app})=>{
    app.x.save({user:{id:'42',username:'dialedbyh'},access_token:'secret-access',refresh_token:'secret-refresh',expires_at:Date.now()+3600000});
    setSetting(db,'xAccountId','42');prepare(db);
  });
}
async function due(store){
  await connected(store,db=>{const p=createPost(db,{body:'Ask for photographs of the actual case edges before comparing two listings. A reference number alone does not tell you the condition.',category:'Buyer advice',scheduledAt:new Date(Date.now()-60000).toISOString()});db.prepare("UPDATE posts SET status='scheduled',reviewed_at=? WHERE id=?").run(nowISO(),p.id);});
  store.row.paused=false;
}
test('Cold invocations persist encrypted credentials and drafts; read-only state never acquires a writer lease',async()=>{
  const store=new MemoryStore();
  await admin({action:'workspace',operation:'integrations',payload:{openaiKey:'sk-private-example',xClientId:'example-client',xClientSecret:'example-secret'}},options(store));
  await admin({action:'workspace',operation:'create',payload:{body:'Compare condition before comparing prices.',category:'Buyer advice'}},options(store));
  const writes=store.writes;store.row.lease_owner='another-invocation';
  const state=await admin({action:'workspace',operation:'state'},options(store));
  assert.equal(state.posts.length,1);assert.equal(state.connections.ai,true);assert.match(state.connections.callback,/leads-admin\?action=social-x-callback/);assert.equal(store.writes,writes);
  assert.equal(JSON.stringify(store.row.state).includes('sk-private-example'),false);assert.equal(JSON.stringify(state).includes('example-secret'),false);
  await assert.rejects(()=>admin({action:'connect'},options(store)),/another request/);
});
test('Saved send intent precedes X request and accepted delivery survives a cold start without resending',async()=>{
  const store=new MemoryStore();await due(store);let sends=0;
  const fetcher=async(url)=>{
    if(url.endsWith('/users/me'))return Response.json({data:{id:'42',username:'dialedbyh'}});
    if(url.endsWith('/tweets')){assert.equal(store.row.state.tables.posts[0].status,'publishing');sends++;return Response.json({data:{id:'12345'}});}
    if(url.includes('/tweets/12345'))return Response.json({data:{id:'12345',author_id:'42',text:store.row.state.tables.posts[0].body}});
    throw Error('Unexpected request');
  };
  await withRuntime({...options(store),fetcher},ctx=>publishDue(ctx.db,ctx.app.x));
  assert.equal(store.row.state.tables.posts[0].status,'posted');
  await withRuntime({...options(store),fetcher},async ctx=>{await verifyDeliveries(ctx.db,ctx.app.x);await publishDue(ctx.db,ctx.app.x);});
  assert.equal(sends,1);assert.equal(store.row.state.tables.post_verifications[0].status,'verified');
});
test('Crash after send checkpoint is reconciled as uncertain on next invocation, never retried',async()=>{
  const store=new MemoryStore();await due(store);
  await withRuntime(options(store),async ctx=>{ctx.db.prepare("UPDATE posts SET status='publishing'").run();await ctx.checkpoint();});
  await withRuntime(options(store),ctx=>publishDue(ctx.db,ctx.app.x));
  assert.equal(store.row.paused,true);assert.equal(store.row.state.tables.posts[0].status,'uncertain');
});
test('Lost lease blocks provider writes before contacting X',async()=>{
  const store=new MemoryStore();await due(store);let calls=0;
  await assert.rejects(()=>withRuntime({...options(store),fetcher:async()=>{calls++;return Response.json({});}},async ctx=>{store.row.lease_owner='new-owner';await publishDue(ctx.db,ctx.app.x);}),/lease/);
  assert.equal(calls,0);
});
test('A concurrent pause wins over a resume after the identity response',async()=>{
  const store=new MemoryStore();await connected(store);
  await admin({action:'resume'},{...options(store),fetcher:async()=>{await store.pause();return Response.json({data:{id:'42',username:'dialedbyh'}});}});
  assert.equal(store.row.paused,true);
  await assert.rejects(()=>admin({action:'workspace',operation:'settings',payload:{paused:false}},options(store)),/Use Resume/);
});
test('Pause arriving during identity check prevents the create-post request',async()=>{
  const store=new MemoryStore();await due(store);let writes=0;
  await withRuntime({...options(store),fetcher:async url=>{if(url.endsWith('/users/me')){await store.pause();return Response.json({data:{id:'42',username:'dialedbyh'}});}writes++;throw Error('Unexpected send');}},ctx=>publishDue(ctx.db,ctx.app.x));
  assert.equal(writes,0);assert.equal(store.row.paused,true);
});
test('OAuth ticket and PKCE survive separate Vercel invocations, bind browser and reject reuse',async()=>{
  const store=new MemoryStore();await admin({action:'workspace',operation:'integrations',payload:{xClientId:'test'}},options(store));
  const link=await admin({action:'connect'},options(store)),ticket=new URL(link.url).searchParams.get('ticket');
  const first=await oauth('social-x-start',{ticket},'',options(store));assert.equal(first.status,303);assert.match(first.headers['Set-Cookie'],/Path=\/api\/leads-admin;/);
  const state=new URL(first.headers.Location).searchParams.get('state');assert.equal(new URL(first.headers.Location).searchParams.get('redirect_uri'),'https://www.dialedbyhenry.com/api/leads-admin?action=social-x-callback');
  assert.equal((await oauth('social-x-start',{ticket},'',options(store))).status,401);
  assert.equal((await oauth('social-x-callback',{state,code:'example'},'dialed_x_link=wrong',options(store))).status,401);
  const completed=await oauth('social-x-callback',{state,code:'example'},first.headers['Set-Cookie'].split(';')[0],{...options(store),fetcher:async url=>Response.json(url.endsWith('/token')?{access_token:'private',expires_in:7200}:{data:{id:'42',username:'dialedbyh'}})});
  assert.equal(completed.status,303);assert.equal((await admin({action:'status'},options(store))).account.id,'42');
});
test('Private media is persisted outside the snapshot and read by the server',async()=>{
  const store=new MemoryStore(),data=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40)]);
  const result=await admin({action:'workspace',operation:'upload',payload:{data:data.toString('base64'),alt:'Watch',rights:'Owned photograph'}},options(store));
  assert.ok(result.id);assert.equal(store.mediaFiles.size,1);assert.equal(JSON.stringify(store.row.state).includes(data.toString('base64')),false);
  await withRuntime({...options(store),readOnly:true},async ctx=>assert.deepEqual(await ctx.config.readMedia(ctx.db.prepare('SELECT * FROM media').get()),data));
});
test('Scheduler requires its own credential, records heartbeat, and idle ticks avoid loading full engine state',async()=>{
  const store=new MemoryStore();store.row.next_run_at=new Date(Date.now()+60000).toISOString();
  await assert.rejects(()=>tick('Bearer wrong',options(store)),/Unauthorized/);await assert.rejects(()=>tick('Bearer '+'b'.repeat(64),options(store)),/Unauthorized/);
  assert.equal(store.heartbeats,0);assert.deepEqual(await tick('Bearer '+token,options(store)),{ok:true,status:'idle'});assert.equal(store.writes,0);assert.equal(store.heartbeats,1);
});
