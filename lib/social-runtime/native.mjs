import {createHmac,randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DateTime} from 'luxon';
import {Store,cronAuthorized} from './store.mjs';
import {restore,snapshot} from './snapshot.mjs';
import {openDB,settings,setSetting,event,nowISO} from './src/db.js';
import {createApp} from './src/server.js';
import {publishDue,verifyDeliveries,syncMetrics,queueAdminJob} from './src/worker.js';
import {generateDrafts} from './src/generator.js';
import {reviewAutonomousDrafts} from './src/autonomy.js';
import {refreshFeeds,fetchPublic} from './src/research.js';

import {searchCatalogue,importCatalogueImage,attachNextImage,imageCandidate} from './website-images.mjs';

const SITE='https://www.dialedbyhenry.com';
const error=(message,status=503)=>Object.assign(new Error(message),{status});
export function recoverInterrupted(db){
  const changed=db.prepare("UPDATE posts SET status='uncertain',error='A server run ended before delivery was confirmed. Check X before resolving.',updated_at=? WHERE status='publishing'").run(nowISO()).changes;
  if(changed){setSetting(db,'paused',true);event(db,'error','Publishing paused after an interrupted send. No automatic resend will occur.');}
  db.prepare("UPDATE jobs SET status='failed',error='Server run interrupted. Review results before retrying.',updated_at=? WHERE status='running'").run(nowISO());
}
function prune(db){
  db.prepare('DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT 1500)').run();
  db.prepare('DELETE FROM oauth WHERE expires_at<?').run(Date.now());
  db.prepare('DELETE FROM admin_handoffs WHERE expires_at<?').run(Date.now());
  db.prepare("DELETE FROM sources WHERE kind='feed' AND verified=0 AND fetched_at<? AND NOT EXISTS (SELECT 1 FROM posts p,json_each(p.source_ids) s WHERE s.value=sources.id)").run(new Date(Date.now()-60*86400000).toISOString());
}
export function nextRun(db,config){
  const s=settings(db),now=Date.now(),candidates=[now+3600000];
  if(db.prepare("SELECT 1 FROM jobs WHERE status='queued'").get())candidates.push(now);
  if(!s.paused){
    const post=db.prepare("SELECT scheduled_at FROM posts WHERE status='scheduled' ORDER BY scheduled_at LIMIT 1").get();
    if(post)candidates.push(Date.parse(post.scheduled_at));
  }
  const verification=db.prepare("SELECT next_check FROM post_verifications WHERE status='pending' ORDER BY next_check LIMIT 1").get();
  if(verification)candidates.push(Date.parse(verification.next_check));
  if(s.autoSiteImages!==false&&imageCandidate(db))candidates.push(now+60000);
  if(config.openaiKey&&(s.autoGenerate||s.autonomy==='autonomous'))candidates.push(now+60000);
  return new Date(Math.max(now+45000,Math.min(...candidates.filter(Number.isFinite)))).toISOString();
}
export async function invoke(handler,config,path,method='POST',body,headers={}){
  const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);
  req.url=path;req.method=method;req.headers={host:new URL(config.appUrl).host,'content-type':'application/json',authorization:'Bearer '+config.bridgeSecret,...headers};req.socket={remoteAddress:'127.0.0.1'};
  let status=200,output='';const responseHeaders={};
  const res={headersSent:false,setHeader(k,v){responseHeaders[k]=v;},writeHead(code,h={}){status=code;Object.assign(responseHeaders,h);this.headersSent=true;},end(data){if(data)output+=String(data);this.headersSent=true;}};
  await handler(req,res);
  return {status,headers:responseHeaders,body:output};
}
export async function withRuntime({env=process.env,store=new Store(env),readOnly=false,fetcher=fetch,started=Date.now()},task){
  const owner=randomUUID();
  let row=readOnly?await store.read(true):await store.claim(owner);
  if(!row)throw error('Publishing is completing another request. Try again in a moment.',409);
  const db=openDB(':memory:'),dataDir=mkdtempSync(join(tmpdir(),'dialed-social-'));
  let app,checkpointFailed=false,allowResume=false;
  try{
    restore(db,row.state);setSetting(db,'paused',row.paused);
    if(!readOnly)recoverInterrupted(db);
    setSetting(db,'workerHeartbeat',row.scheduler_heartbeat||null);setSetting(db,'lastPublishSweep',row.last_run_at||null);
    const secret=env.SOCIAL_ENCRYPTION_KEY||createHmac('sha256',env.SUPABASE_SERVICE_ROLE_KEY||store.key).update('dialed-social-encryption-v1').digest('hex');
    if(!/^[a-f0-9]{64}$/i.test(secret))throw error('Social encryption key must be 64 hexadecimal characters.');
    const config={dataDir,production:true,appUrl:SITE,adminUrl:SITE+'/admin/#social',secret,bridgeSecret:createHmac('sha256',secret).update('admin-bridge').digest('hex'),adminPassword:'unused-native-admin-auth',seedDrafts:false,model:env.OPENAI_MODEL||'gpt-4.1-mini',openaiKey:env.OPENAI_API_KEY||'',xClientId:env.X_CLIENT_ID||'',xClientSecret:env.X_CLIENT_SECRET||'',leadSecret:'',callbackUrl:SITE+'/api/leads-admin?action=social-x-callback',connectUrl:SITE+'/api/leads-admin?action=social-x-start',oauthCookiePath:'/api/leads-admin',requestTimeout:32000,reviewLimit:1,readMedia:media=>store.media(media)};
    const knownMedia=new Set(db.prepare('SELECT id FROM media').all().map(r=>r.id));
    const checkpoint=async()=>{
      if(readOnly)throw error('Read-only publishing request attempted a write.');
      if(checkpointFailed)throw error('Publishing storage lease was lost. No further provider requests are allowed.');
      // Persist image bytes before any snapshot can reference them, including error checkpoints.
      for(const media of db.prepare('SELECT * FROM media').all())if(!knownMedia.has(media.id)){await store.upload(media,readFileSync(join(dataDir,'media',media.filename)));knownMedia.add(media.id);}
      prune(db);
      const paused=settings(db).paused;
      try{
        const saved=await store.save(owner,snapshot(db),nextRun(db,config),paused?true:allowResume?false:null,row.control_version);
        if(!saved)throw error('Publishing storage lease expired.');
        // Pause wins over an in-flight resume. Never adopt the newer version to retry a resume.
        if(saved.control_version!==row.control_version)allowResume=false;
        row={...row,...saved};setSetting(db,'paused',saved.paused);
      }catch(e){checkpointFailed=true;throw e;}
    };
    const guardedFetch=async(url,options={})=>{
      await checkpoint();
      const remaining=40000-(Date.now()-started);
      if(remaining<1500)throw error('Run time limit reached before contacting the provider.');
      const u=new URL(url);
      if(!['https://api.x.com','https://api.openai.com'].includes(u.origin))throw error('Unexpected provider destination.');
      // This check runs immediately before the non-idempotent create-post request.
      if(u.pathname==='/2/tweets'&&options.method==='POST'&&settings(db).paused)throw error('Publishing was paused before the send.',409);
      return fetcher(url,{...options,redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(remaining),...(options.signal?[options.signal]:[])])});
    };
    config.beforePublish=async()=>{await checkpoint();if(settings(db).paused)throw error('Publishing was paused before the send.',409);};
    app=createApp(config,{db,fetcher:guardedFetch,worker:false});
    const context={db,app,config,checkpoint,fetcher:guardedFetch,store,row,started,requestResume(){allowResume=true;}};
    let result;
    try{result=await task(context);}
    catch(e){if(!readOnly&&!checkpointFailed)await checkpoint();throw e;}
    if(!readOnly){
      await checkpoint();
    }
    return result;
  }finally{
    db.close();rmSync(dataDir,{recursive:true,force:true});
    if(!readOnly)await store.release(owner).catch(()=>{});
  }
}
export async function admin(input,options={}){
  const store=options.store||new Store(options.env);
  if(input.action==='pause'||(input.action==='workspace'&&input.operation==='settings'&&input.payload?.paused===true)){
    await store.pause();if(input.action==='pause')return {ok:true};
  }
  // Resume always takes the identity-verifying route; no alternate settings bypass.
  if(input.action==='workspace'&&input.operation==='settings'&&input.payload&&'paused' in input.payload){
    if(input.payload.paused===false)throw error('Use Resume publishing after verifying the connected account.',400);
    input={...input,payload:{...input.payload}};delete input.payload.paused;
  }
  const readOnly=input.action==='status'||(input.action==='workspace'&&['state','link','catalog'].includes(input.operation));
  return withRuntime({...options,store,readOnly},async ctx=>{
    if(input.action==='workspace'&&input.operation==='catalog')return searchCatalogue(ctx,input.payload);
    if(input.action==='workspace'&&input.operation==='catalog-import')return importCatalogueImage(ctx,input.payload,options.imageFetcher);
    if(input.action==='resume')ctx.requestResume();
    const r=await invoke(ctx.app.handler,ctx.config,'/api/admin-bridge','POST',input);
    const data=JSON.parse(r.body);
    if(r.status>=400)throw error(data.error||'Publishing request failed.',r.status);
    return data;
  });
}
export async function oauth(action,query,cookie,options={}){
  return withRuntime(options,async ctx=>{
    const params=new URLSearchParams();for(const key of ['ticket','code','state','error'])if(typeof query[key]==='string')params.set(key,query[key]);
    return invoke(ctx.app.handler,ctx.config,(action==='social-x-start'?'/auth/x/admin':'/auth/x/callback')+'?'+params,'GET',undefined,{cookie:cookie||''});
  });
}
async function runOne(ctx){
  const {db,app,config,fetcher,checkpoint}=ctx,s=settings(db),x=app.x;
  if(x.account()&&db.prepare("SELECT 1 FROM post_verifications WHERE status='pending' AND next_check<=?").get(nowISO())){await verifyDeliveries(db,x);return 'verify';}
  if(!s.paused&&x.account()&&db.prepare("SELECT 1 FROM posts WHERE status='scheduled' AND scheduled_at<=?").get(nowISO())){await publishDue(db,x);return 'publish';}
  const job=db.prepare("SELECT * FROM jobs WHERE status='queued' ORDER BY updated_at LIMIT 1").get();
  if(job){
    const [,operation,day]=job.key.split(':');
    db.prepare("UPDATE jobs SET status='running' WHERE key=?").run(job.key);await checkpoint();
    try{
      if(operation==='generate')await generateDrafts(db,config,day,fetcher);
      else if(operation==='refresh'){
        // One feed per invocation. Job timestamp stays fixed until every feed is visited.
        const pending=db.prepare("SELECT 1 FROM feeds WHERE enabled=1 AND (checked_at IS NULL OR checked_at<?)").get(job.updated_at);
        if(pending){await refreshFeeds(db,url=>fetchPublic(url,0,{signal:AbortSignal.timeout(25000)}),{limit:1});
          if(db.prepare("SELECT 1 FROM feeds WHERE enabled=1 AND (checked_at IS NULL OR checked_at<?)").get(job.updated_at)){db.prepare("UPDATE jobs SET status='queued' WHERE key=?").run(job.key);return 'research';}}
      }else throw error('Unknown queued operation.');
      db.prepare("UPDATE jobs SET status='complete',updated_at=?,error=NULL WHERE key=?").run(nowISO(),job.key);event(db,'background',operation==='generate'?'Requested draft batch is ready.':'Research refresh finished.');
    }catch(e){db.prepare("UPDATE jobs SET status='failed',updated_at=?,error=? WHERE key=?").run(nowISO(),e.message,job.key);event(db,'error',e.message);}
    return 'job';
  }
  if(await attachNextImage(ctx))return 'image';
  if(config.openaiKey&&s.autonomy==='autonomous'&&db.prepare("SELECT 1 FROM posts p LEFT JOIN editorial_reviews r ON r.post_id=p.id WHERE p.status='draft' AND p.ai_generated=1 AND p.scheduled_at>? AND r.post_id IS NULL").get(new Date(Date.now()+60000).toISOString())){await reviewAutonomousDrafts(db,config,fetcher);return 'review';}
  if(config.openaiKey&&s.autoGenerate){
    const time=DateTime.now().setZone(s.timezone),day=time.plus({days:1}).toISODate();
    const last=db.prepare('SELECT * FROM jobs WHERE key=?').get('admin:generate:'+day);
    if(time.hour>=18&&!db.prepare('SELECT id FROM posts WHERE batch_date=?').get(day)&&(!last||Date.now()-Date.parse(last.updated_at)>3600000)){queueAdminJob(db,'generate',day);return 'queue-drafts';}
    const feed=db.prepare("SELECT 1 FROM feeds WHERE enabled=1 AND (checked_at IS NULL OR checked_at<?)").get(new Date(Date.now()-6*3600000).toISOString());
    if(feed){await refreshFeeds(db,url=>fetchPublic(url,0,{signal:AbortSignal.timeout(25000)}),{limit:1});return 'research';}
  }
  if(x.account()&&Date.now()-Date.parse(s.lastNativeMetrics||'2000-01-01')>86400000){setSetting(db,'lastNativeMetrics',nowISO());try{await syncMetrics(db,x);}catch(e){event(db,'error',e.message);}return 'metrics';}
  return 'idle';
}
export async function tick(authorization,options={}){
  const started=Date.now();
  if(typeof authorization!=='string'||!/^Bearer [a-f0-9]{64}$/.test(authorization))throw error('Unauthorized',401);
  const store=options.store||new Store(options.env),meta=await store.read();
  if(!cronAuthorized(authorization,meta.scheduler_secret_hash))throw error('Unauthorized',401);
  await store.heartbeat();
  if(Date.parse(meta.next_run_at)>Date.now())return {ok:true,status:'idle'};
  try{return await withRuntime({...options,store,started},async ctx=>{
    setSetting(ctx.db,'workerHeartbeat',nowISO());
    const status=await runOne(ctx);setSetting(ctx.db,'lastPublishSweep',nowISO());
    return {ok:true,status};
  });}catch(e){if(e.status===409)return {ok:true,status:'busy'};throw e;}
}
