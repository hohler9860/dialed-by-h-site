import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac,createHash,randomBytes } from 'node:crypto';
import { DateTime } from 'luxon';
import { configFromEnv } from './config.js';
import { openDB, settings, setSetting, id, nowISO, event, transaction } from './db.js';
import { encrypt,decrypt,equal,passwordMatch,sessionToken,validSession,cookie,safeUrl } from './security.js';
import { categories,createPost,approve,quality,seedDrafts } from './editorial.js';
import { XClient } from './x-client.js';
import { generateDrafts } from './generator.js';
import { refreshFeeds } from './research.js';
import { startWorker,syncMetrics,monthSpend,queueAdminJob } from './worker.js';
import { bridgeAction } from './admin-bridge.js';
import { workspaceRoute } from './workspace-routes.js';

const publicDir=resolve(dirname(fileURLToPath(import.meta.url)),'../public');
const mutable=['draft','scheduled','failed','expired'];
function fail(message,status=400) {return Object.assign(new Error(message),{status});}
async function readJSON(req,max=8000000) {
  if(!req.headers['content-type']?.startsWith('application/json')) throw fail('Send application/json.',415);
  const chunks=[];let bytes=0;for await(const chunk of req) {bytes+=chunk.length;if(bytes>max) throw fail('Request too large.',413);chunks.push(chunk);}
  try {return JSON.parse(Buffer.concat(chunks).toString());} catch {throw fail('Invalid JSON.');}
}
const str=(v,max=2000)=>typeof v==='string'?v.trim().slice(0,max):'';
const json=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
function loadIntegrations(db,config) {const row=db.prepare("SELECT encrypted FROM credentials WHERE name='integrations'").get();if(row) Object.assign(config,decrypt(row.encrypted,config.secret));}
function leadInput(db,input) {
  if(!str(input.name,200)) throw fail('A name or account handle is required.');
  if(input.postId && !db.prepare('SELECT id FROM posts WHERE id=?').get(input.postId)) throw fail('Unknown source post.');
  const stage=input.stage||'new';if(!['new','qualified','sourcing','won','lost'].includes(stage)) throw fail('Invalid lead stage.');
  return [str(input.name,200),str(input.contact,300),str(input.watch,300),str(input.budget,100),stage,input.postId||null,str(input.notes,5000)];
}
export function createApp(config,{db=openDB(join(config.dataDir,'content.db')),fetcher=fetch,worker=true}={}) {
  loadIntegrations(db,config);if(config.seedDrafts!==false)seedDrafts(db);
  if(!db.prepare("SELECT key FROM settings WHERE key='feedsInitialized'").get()) {
    for(const [name,url] of [['Fratello','https://www.fratellowatches.com/feed/'],['Monochrome','https://monochrome-watches.com/feed/']]) db.prepare('INSERT OR IGNORE INTO feeds(id,name,url) VALUES (?,?,?)').run(id(),name,url);
    setSetting(db,'feedsInitialized',true);
  }
  const x=new XClient(db,config,fetcher),loginAttempts=new Map();
  const csrf=token=>createHmac('sha256',config.secret).update('csrf:'+token).digest('hex');
  const local=!config.production&&!config.adminPassword;
  const cookieOptions=`; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${config.production?'; Secure':''}`;
  const handler=async(req,res)=> {
    let bridged=false,bridgeBody;
    const body=async(max)=>bridged?bridgeBody:readJSON(req,max);
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      if(req.headers.host!==new URL(config.appUrl).host) throw fail('Unrecognized host.',403);
      if(req.headers.origin && req.headers.origin!==config.appUrl) throw fail('Cross-origin requests are not allowed.',403);
      let url=new URL(req.url,config.appUrl),path=url.pathname;
      if(path==='/healthz') return json(res,{ok:true});
      if(path==='/api/admin-bridge'&&req.method==='POST') {
        if(!config.bridgeSecret||config.bridgeSecret.length<32||!equal(req.headers.authorization||'',`Bearer ${config.bridgeSecret}`)) throw fail('Unauthorized.',401);
        const input=await readJSON(req,4300000);
        if(input.action!=='workspace') return json(res,await bridgeAction(db,x,config,input));
        const route=workspaceRoute(input.operation,input.id);
        bridgeBody=input.payload||{};if(typeof bridgeBody!=='object'||Array.isArray(bridgeBody)) throw fail('Invalid workspace payload.');
        if(['generate','refresh'].includes(input.operation)) {
          if(input.operation==='generate'&&!config.openaiKey) throw fail('Connect the drafting API first.');
          return json(res,queueAdminJob(db,input.operation,bridgeBody.day),202);
        }
        bridged=true;req.method=route.method;url=new URL(route.path,config.appUrl);path=url.pathname;
      }
      if(path==='/auth/x/admin'&&req.method==='GET') {
        const hash=createHash('sha256').update(url.searchParams.get('ticket')||'').digest('hex');
        const ticket=db.prepare('DELETE FROM admin_handoffs WHERE token_hash=? AND expires_at>=? RETURNING token_hash').get(hash,Date.now());
        if(!ticket) throw fail('This connection link expired or was already used. Start again from website admin.',401);
        const nonce=randomBytes(32).toString('base64url'),destination=x.authorize(nonce);
        res.setHeader('Set-Cookie',`dialed_x_link=${nonce}; HttpOnly; SameSite=Lax; Path=${config.oauthCookiePath||'/auth/x/'}; Max-Age=600${config.production?'; Secure':''}`);
        res.writeHead(303,{Location:destination});return res.end();
      }
      const linkNonce=cookie(req,'dialed_x_link');
      if(path==='/auth/x/callback'&&req.method==='GET'&&linkNonce) {
        const row=db.prepare('SELECT session FROM oauth WHERE state=?').get(url.searchParams.get('state')||'');
        if(!row||!equal(row.session,linkNonce)) throw fail('X connection does not belong to this browser. Restart from admin.',401);
        res.setHeader('Set-Cookie',`dialed_x_link=; HttpOnly; SameSite=Lax; Path=${config.oauthCookiePath||'/auth/x/'}; Max-Age=0${config.production?'; Secure':''}`);
        const back=new URL(config.adminUrl||'https://www.dialedbyhenry.com/admin/#social');
        try {
          if(url.searchParams.has('error')) {db.prepare('DELETE FROM oauth WHERE state=?').run(url.searchParams.get('state'));throw new Error('X authorization was cancelled.');}
          await x.callback(url.searchParams.get('code'),url.searchParams.get('state'),linkNonce);
        } catch(error) {event(db,'error',error.message);back.searchParams.set('social_connection','failed');}
        res.writeHead(303,{Location:back.href});return res.end();
      }
      if(path==='/api/leads/webhook' && req.method==='POST') {
        if(!config.leadSecret || !equal(req.headers.authorization||'',`Bearer ${config.leadSecret}`)) throw fail('Unauthorized.',401);
        const input=await readJSON(req,20000);const externalId=str(input.externalId,200);
        if(!externalId) throw fail('externalId is required for duplicate prevention.');
        const old=db.prepare('SELECT id FROM leads WHERE external_id=?').get(externalId);if(old) return json(res,{id:old.id,duplicate:true});
        const leadId=id(),values=leadInput(db,input),stamp=nowISO();
        db.prepare('INSERT INTO leads VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(leadId,...values,stamp,stamp,externalId);
        event(db,'lead','New attributed lead received.');return json(res,{id:leadId},201);
      }
      let token=cookie(req,'dialed_session'),authenticated=validSession(token,config.secret);
      if(path==='/api/session' && req.method==='GET') {
        if(local&&!authenticated) {token=sessionToken(config.secret);res.setHeader('Set-Cookie','dialed_session='+token+cookieOptions);authenticated=true;}
        return json(res,{authenticated,csrf:authenticated?csrf(token):null,local});
      }
      if(path==='/api/login' && req.method==='POST') {
        const key=req.socket.remoteAddress,record=loginAttempts.get(key)||{at:Date.now(),count:0};
        if(Date.now()-record.at>15*60000) {record.count=0;record.at=Date.now();}
        if(record.count>=10) throw fail('Too many login attempts. Try again in 15 minutes.',429);
        record.count++;loginAttempts.set(key,record);
        const body=await readJSON(req,1000);
        if(!config.adminPassword||!passwordMatch(str(body.password,1000),config.adminPassword,config.secret)) throw fail('Incorrect password.',401);
        token=sessionToken(config.secret);res.setHeader('Set-Cookie','dialed_session='+token+cookieOptions);
        loginAttempts.delete(key);return json(res,{csrf:csrf(token)});
      }
      if(!bridged&&(path.startsWith('/api/')||path.startsWith('/auth/')||path.startsWith('/media/'))) {
        if(!authenticated) throw fail('Sign in to continue.',401);
        if(!['GET','HEAD'].includes(req.method) && !equal(req.headers['x-csrf-token']||'',csrf(token))) throw fail('Refresh the page and try again.',403);
      }
      if(path==='/api/logout' && req.method==='POST') {res.setHeader('Set-Cookie','dialed_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return json(res,{ok:true});}
      if(path==='/auth/x/callback' && req.method==='GET') {
        if(url.searchParams.has('error')) throw fail('X connection was cancelled. Return to the dashboard to try again.');
        await x.callback(url.searchParams.get('code'),url.searchParams.get('state'),token);
        res.writeHead(303,{Location:'/#settings'});return res.end();
      }
      if(path==='/api/x/connect' && req.method==='POST') return json(res,{url:x.authorize(token)});
      if(path==='/api/x/disconnect' && req.method==='POST') {db.prepare("DELETE FROM credentials WHERE name='x'").run();setSetting(db,'paused',true);event(db,'account','X disconnected and publishing paused.');return json(res,{ok:true});}
      if(path==='/api/state' && req.method==='GET') {
        const posts=db.prepare('SELECT * FROM posts ORDER BY COALESCE(scheduled_at,created_at) DESC LIMIT 500').all().map(p=>({...p,quality:quality(db,p),metrics:JSON.parse(p.metrics),sourceIds:JSON.parse(p.source_ids)}));
        const account=x.account();
        return json(res,{settings:settings(db),posts,categories,sources:db.prepare('SELECT * FROM sources ORDER BY fetched_at DESC LIMIT 200').all(),
          feeds:db.prepare('SELECT * FROM feeds ORDER BY name').all(),leads:bridged?[]:db.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT 500').all(),
          events:db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 80').all(),jobs:db.prepare('SELECT * FROM jobs ORDER BY updated_at DESC LIMIT 20').all(),
          media:db.prepare('SELECT id,alt,rights FROM media').all(),
          connections:{x:account?.user||null,xConfigured:!!config.xClientId,ai:!!config.openaiKey,model:config.model,webhook:!!config.leadSecret,callback:config.callbackUrl||config.appUrl+'/auth/x/callback',local},
          xEstimatedSpend:monthSpend(db),nextDay:DateTime.now().setZone(settings(db).timezone).plus({days:1}).toISODate()});
      }
      if(path==='/api/settings' && req.method==='PATCH') {
        const input=await body(15000),old=settings(db),updates={};
        if('paused' in input) {if(typeof input.paused!=='boolean') throw fail('Invalid pause setting.');if(!input.paused&&!x.account()) throw fail('Connect @dialedbyh before resuming publishing.');if(!input.paused&&db.prepare("SELECT id FROM posts WHERE status='uncertain' LIMIT 1").get()) throw fail('Resolve uncertain posts before resuming.');if(!input.paused&&db.prepare("SELECT post_id FROM post_verifications WHERE status!='verified' LIMIT 1").get()) throw fail('Verify outstanding deliveries before resuming.');updates.paused=input.paused;}
        if('autoGenerate' in input) {if(typeof input.autoGenerate!=='boolean') throw fail('Invalid drafting setting.');if(input.autoGenerate&&!config.openaiKey) throw fail('Connect the drafting API first.');updates.autoGenerate=input.autoGenerate;}
        if('sourceUrl' in input) updates.sourceUrl=safeUrl(input.sourceUrl);
        if('voice' in input) {if(!str(input.voice)) throw fail('Voice guidance cannot be empty.');updates.voice=str(input.voice,5000);}
        if('monthlyXBudget' in input) {if(!Number.isFinite(input.monthlyXBudget)||input.monthlyXBudget<1||input.monthlyXBudget>500) throw fail('Choose an X estimate limit between $1 and $500.');updates.monthlyXBudget=input.monthlyXBudget;}
        if('slots' in input) {
          if(!Array.isArray(input.slots)||input.slots.length!==5||input.slots.some(t=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw fail('Provide five valid daily times.');
          const slots=[...input.slots].sort(),mins=slots.map(t=>Number(t.slice(0,2))*60+Number(t.slice(3)));
          if(mins.some((v,i)=>i&&v-mins[i-1]<75)||1440-mins[4]+mins[0]<75) throw fail('Leave at least 75 minutes between slots, including overnight.');updates.slots=slots;
        }
        transaction(db,()=>{for(const [k,v] of Object.entries(updates)) setSetting(db,k,v);});
        if(old.paused!==updates.paused&&'paused' in updates) event(db,'publishing',updates.paused?'Publishing paused. An in-flight X request may still complete.':'Publishing resumed for approved posts.');
        return json(res,{ok:true});
      }
      if(path==='/api/integrations' && req.method==='POST') {
        const input=await body(12000),allowed=['openaiKey','model','xClientId','xClientSecret','leadSecret'];
        const stored=db.prepare("SELECT encrypted FROM credentials WHERE name='integrations'").get();const values=stored?decrypt(stored.encrypted,config.secret):{};
        for(const key of allowed) if(str(input[key],5000)) values[key]=str(input[key],5000);
        if(values.model&&!/^[a-zA-Z0-9._-]{1,100}$/.test(values.model)) throw fail('Invalid model name.');
        if(values.leadSecret && values.leadSecret.length<32) throw fail('Use at least 32 characters for the lead webhook secret.');
        db.prepare("INSERT OR REPLACE INTO credentials VALUES ('integrations',?)").run(encrypt(values,config.secret));Object.assign(config,values);
        event(db,'settings','Integration credentials updated.');return json(res,{ok:true});
      }
      if(path==='/api/posts' && req.method==='POST') return json(res,createPost(db,await body(15000)),201);
      const match=path.match(/^\/api\/posts\/([a-f0-9-]+)(?:\/(approve|reject|unschedule|resolve|link))?$/);
      if(match) {
        const post=db.prepare('SELECT * FROM posts WHERE id=?').get(match[1]);if(!post) throw fail('Post not found.',404);
        if(req.method==='GET'&&match[2]==='link') {
          const link=new URL(settings(db).sourceUrl);link.searchParams.set('utm_source','x');link.searchParams.set('utm_medium','organic_social');link.searchParams.set('utm_campaign','watch_concierge');link.searchParams.set('utm_content',post.id);return json(res,{url:link.href});
        }
        if(req.method==='PATCH'&&!match[2]) {
          if(!mutable.includes(post.status)) throw fail('This post cannot be edited.');const input=await body(20000);
          if(input.version!==post.version) throw fail('Draft changed. Reload it before saving.',409);
          if(!str(input.body,4000)||!categories.includes(input.category)) throw fail('Provide post text and a category.');
          if(!Array.isArray(input.sourceIds)||input.sourceIds.length>5||input.sourceIds.some(s=>!db.prepare('SELECT id FROM sources WHERE id=?').get(s))) throw fail('Invalid sources.');
          if(input.scheduledAt&&!Number.isFinite(Date.parse(input.scheduledAt))) throw fail('Invalid schedule.');
          if(input.mediaId&&!db.prepare('SELECT id FROM media WHERE id=?').get(input.mediaId)) throw fail('Unknown image.');
          db.prepare("UPDATE posts SET body=?,category=?,scheduled_at=?,source_ids=?,factual=?,editorial_note=?,media_id=?,status='draft',reviewed_at=NULL,error=NULL,updated_at=?,version=version+1 WHERE id=?")
            .run(str(input.body,4000),input.category,input.scheduledAt?new Date(input.scheduledAt).toISOString():null,JSON.stringify(input.sourceIds),input.factual?1:0,str(input.note,3000),input.mediaId||null,nowISO(),post.id);
          db.prepare('INSERT OR REPLACE INTO editorial_reviews VALUES (?,?,?,0,?,?)').run(post.id,post.version+1,'human_edit',JSON.stringify(['Edited in admin; manual approval required.']),nowISO());
          return json(res,{ok:true});
        }
        if(req.method==='POST'&&match[2]) {
          const input=await body(5000);
          if(match[2]==='approve') approve(db,post.id,input.version);
          else if(match[2]==='reject'||match[2]==='unschedule') {
            if(!mutable.includes(post.status)) throw fail('This post cannot be changed.');
            if(input.version!==post.version) throw fail('Draft changed. Reload it first.',409);
            db.prepare('UPDATE posts SET status=?,reviewed_at=NULL,updated_at=?,version=version+1,editorial_note=? WHERE id=?')
              .run(match[2]==='reject'?'rejected':'draft',nowISO(),input.reason?str(input.reason,3000):post.editorial_note,post.id);
          } else if(match[2]==='resolve') {
            if(post.status!=='uncertain'||input.checked!==true) throw fail('Check the X account before resolving this post.');
            if(input.xId) {
              if(!/^\d{1,30}$/.test(input.xId)) throw fail('Provide a valid numeric X post ID.');
              const result=await x.request(`/tweets/${input.xId}?tweet.fields=author_id,created_at`);
              if(result.data?.author_id!==x.account()?.user.id || !result.data?.created_at) throw fail('That post does not belong to the connected account.');
              db.prepare("UPDATE posts SET status='posted',x_id=?,published_at=?,updated_at=?,error=NULL WHERE id=?").run(input.xId,result.data.created_at,nowISO(),post.id);
              db.prepare("INSERT OR REPLACE INTO post_verifications(post_id,expected_author,status,next_check) VALUES (?,?,'pending',?)").run(post.id,x.account().user.id,nowISO());
            } else db.prepare("UPDATE posts SET status='draft',reviewed_at=NULL,error=NULL,updated_at=?,version=version+1 WHERE id=?").run(nowISO(),post.id);
            event(db,'resolved','User reconciled an uncertain publish. Publishing remains paused.',post.id);
          } else throw fail('Unknown action.',404);
          return json(res,{ok:true});
        }
      }
      if(path==='/api/generate' && req.method==='POST') {
        const input=await body(1000);const drafts=await generateDrafts(db,config,input.day,fetcher);return json(res,{created:drafts.length},201);
      }
      if(path==='/api/research/refresh' && req.method==='POST') return json(res,await refreshFeeds(db));
      if(path==='/api/feeds' && req.method==='POST') {
        const input=await body(3000);if(db.prepare('SELECT COUNT(*) n FROM feeds').get().n>=8) throw fail('Keep up to eight focused feeds.');
        const name=str(input.name,100);if(!name) throw fail('Name the feed.');db.prepare('INSERT INTO feeds(id,name,url) VALUES (?,?,?)').run(id(),name,safeUrl(input.url));return json(res,{ok:true},201);
      }
      const feedMatch=path.match(/^\/api\/feeds\/([a-f0-9-]+)$/);
      if(feedMatch&&req.method==='DELETE') {db.prepare('DELETE FROM feeds WHERE id=?').run(feedMatch[1]);return json(res,{ok:true});}
      if(path==='/api/sources'&&req.method==='POST') {
        const input=await body(15000);if(!str(input.title,300)||!str(input.excerpt,8000)) throw fail('Add a title and research notes.');
        db.prepare('INSERT INTO sources VALUES (?,?,?,?,?,?,?,?)').run(id(),str(input.title,300),safeUrl(input.url,{optional:true}),str(input.excerpt,8000),input.url?'manual':'first_party',null,nowISO(),input.verified===true?1:0);return json(res,{ok:true},201);
      }
      const sourceMatch=path.match(/^\/api\/sources\/([a-f0-9-]+)$/);
      if(sourceMatch&&req.method==='PATCH') {const input=await body(1000);if(typeof input.verified!=='boolean') throw fail('Invalid verification.');
        db.prepare('UPDATE sources SET verified=?,fetched_at=? WHERE id=?').run(input.verified?1:0,nowISO(),sourceMatch[1]);return json(res,{ok:true});}
      if(path==='/api/media'&&req.method==='POST') {
        const input=await body();if(!str(input.alt,1000)||!str(input.rights,500)||typeof input.data!=='string') throw fail('Add image, alt text and usage-rights confirmation.');
        const image=Buffer.from(input.data,'base64');let ext,mime;
        if(image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {ext='png';mime='image/png';}
        else if(image[0]===255&&image[1]===216&&image[2]===255) {ext='jpg';mime='image/jpeg';}
        else throw fail('Upload a JPEG or PNG image.');
        if(image.length>5*1024*1024||image.length<30) throw fail('Image must be under 5 MB.');
        const mediaId=id(),filename=`${mediaId}.${ext}`;mkdirSync(join(config.dataDir,'media'),{recursive:true,mode:0o700});writeFileSync(join(config.dataDir,'media',filename),image,{mode:0o600});
        db.prepare('INSERT INTO media VALUES (?,?,?,?,?,?)').run(mediaId,filename,mime,str(input.alt,1000),str(input.rights,500),nowISO());return json(res,{id:mediaId},201);
      }
      const mediaMatch=path.match(/^\/media\/([a-f0-9-]+)$/);
      if(mediaMatch&&req.method==='GET') {const media=db.prepare('SELECT * FROM media WHERE id=?').get(mediaMatch[1]);if(!media) throw fail('Image not found.',404);res.writeHead(200,{'Content-Type':media.mime});return res.end(readFileSync(join(config.dataDir,'media',media.filename)));}
      if(path==='/api/metrics/sync'&&req.method==='POST') return json(res,await syncMetrics(db,x));
      if(path==='/api/leads'&&req.method==='POST') {const input=await body(12000),leadId=id(),stamp=nowISO();db.prepare('INSERT INTO leads VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(leadId,...leadInput(db,input),stamp,stamp,null);return json(res,{id:leadId},201);}
      const leadMatch=path.match(/^\/api\/leads\/([a-f0-9-]+)$/);
      if(leadMatch&&req.method==='PATCH') {const input=await body(12000);db.prepare('UPDATE leads SET name=?,contact=?,watch=?,budget=?,stage=?,post_id=?,notes=?,updated_at=? WHERE id=?').run(...leadInput(db,input),nowISO(),leadMatch[1]);return json(res,{ok:true});}
      if(req.method==='GET' && ['/brand/logo-dark.png','/brand/DepartureMono-Regular.otf','/brand/TikTokSans.ttf'].includes(path)) {
        const type=path.endsWith('.png')?'image/png':path.endsWith('.otf')?'font/otf':'font/ttf';
        res.writeHead(200,{'Content-Type':type,'Cache-Control':'public, max-age=86400'});return res.end(readFileSync(join(publicDir,path.slice(1))));
      }
      if(req.method==='GET' && ['/', '/app.js','/style.css','/favicon.svg'].includes(path)) {
        const filename=path==='/'?'index.html':path.slice(1),type=filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':filename.endsWith('.svg')?'image/svg+xml':'text/html';
        res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});return res.end(readFileSync(join(publicDir,filename)));
      }
      throw fail('Not found.',404);
    } catch(e) {
      // Never return raw external response bodies, request headers or stored secrets.
      const message=e.code?.startsWith('SQLITE')?'This item already exists or could not be saved.':e.message||'Request failed.';
      if(!res.headersSent) json(res,{error:message},e.status&&e.status>=400&&e.status<600?e.status:400);else res.end();
    }
  };
  const server=http.createServer(handler);
  server.requestTimeout=120000;server.headersTimeout=15000;
  const stop=worker?startWorker(db,x,config):()=>{};
  return {server,handler,db,x,stop};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const config=configFromEnv(),app=createApp(config);
  app.server.listen(config.port,config.host,()=>console.log(`Dialed Content Desk is running at ${config.appUrl}. Publishing state is controlled in the dashboard.`));
  const shutdown=async()=>{setTimeout(()=>process.exit(0),30000).unref();await app.stop();app.server.close(()=>{app.db.close();process.exit(0);});};
  process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
}
