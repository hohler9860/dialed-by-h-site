// Local, read-only preview of the real admin document. Never deployed as an API.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const site=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const poster=resolve(site,'../dialed-x-poster');
const moduleAt=name=>import(pathToFileURL(resolve(poster,'src',name)).href);
const [{socialStatus},{settings},{categories,quality},{XClient},{decrypt}]=await Promise.all(['admin-bridge.js','db.js','editorial.js','x-client.js','security.js'].map(moduleAt));
const db=new DatabaseSync(resolve(poster,'data/content.db'),{readOnly:true});
const config={secret:readFileSync(resolve(poster,'data/.encryption-key'),'utf8').trim(),appUrl:'http://127.0.0.1:4317',model:'gpt-4.1-mini'};
const stored=db.prepare("SELECT encrypted FROM credentials WHERE name='integrations'").get();
if(stored)Object.assign(config,decrypt(stored.encrypted,config.secret));
const x=new XClient(db,config);
const port=Number(process.env.PREVIEW_PORT||4318),origin=`http://127.0.0.1:${port}`;
const auth=`window.dialedAdmin={isAuthed:()=>true,clearToken:()=>{},adminFetchTo:async(url,action,args)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Local-Preview':'read-only'},body:JSON.stringify({action,...args})});const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}};`;
const files=new Set(['/assets/social-admin.css','/scripts/social-admin.js','/fonts/DepartureMono-Regular.otf','/fonts/TikTokSans.ttf','/images/logo-dark.png']);
const types={'.css':'text/css','.js':'text/javascript','.otf':'font/otf','.ttf':'font/ttf','.png':'image/png'};
function workspace(){return {
 settings:settings(db),categories,posts:db.prepare('SELECT * FROM posts ORDER BY COALESCE(scheduled_at,created_at) DESC LIMIT 500').all().map(p=>({...p,quality:quality(db,p),metrics:JSON.parse(p.metrics),sourceIds:JSON.parse(p.source_ids)})),
 sources:db.prepare('SELECT * FROM sources ORDER BY fetched_at DESC LIMIT 200').all(),feeds:db.prepare('SELECT * FROM feeds ORDER BY name').all(),jobs:db.prepare('SELECT * FROM jobs ORDER BY updated_at DESC LIMIT 20').all(),media:db.prepare('SELECT id,alt,rights FROM media').all(),
 connections:{x:x.account()?.user||null,xConfigured:!!config.xClientId,ai:!!config.openaiKey,model:config.model,callback:config.appUrl+'/auth/x/callback'},nextDay:new Date(Date.now()+86400000).toISOString().slice(0,10)
};}
http.createServer(async(req,res)=>{
 const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 try{
  if(req.headers.host!==new URL(origin).host||(req.headers.origin&&req.headers.origin!==origin))return json(403,{error:'Local preview only.'});
  const path=new URL(req.url,origin).pathname;
  if(path==='/api/leads-admin'&&req.method==='POST'){
   if(req.headers['x-local-preview']!=='read-only')return json(403,{error:'Read-only preview.'});
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>20000)return json(413,{error:'Too large.'});}
   const input=JSON.parse(raw);
   if(input.action==='social-status')return json(200,{...socialStatus(db,x,config),preview:true});
   if(input.action==='social-workspace'&&input.operation==='state')return json(200,workspace());
   return json(403,{error:'This preview is read-only. No publishing or account changes were made.'});
  }
  if(req.method!=='GET')return json(403,{error:'Read-only preview.'});
  if(path==='/'){res.writeHead(302,{Location:'/admin/#social'});return res.end();}
  if(path==='/admin/'||path==='/admin/index.html'){
   let html=readFileSync(resolve(site,'admin/index.html'),'utf8');
   html=html.replace(/<button data-tab="(?!social)[^"]+"/g,'$& disabled title="Only Social is connected in this local preview"');
   html=html.replace('<script src="/scripts/admin-auth.js"></script>','<script src="/scripts/admin-auth.js"></script><script>if(location.hash!=="#social")location.hash="social";</script>');
   res.writeHead(200,{'Content-Type':'text/html'});return res.end(html);
  }
  if(path==='/scripts/admin-auth.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(auth);}
  if(files.has(path)){res.writeHead(200,{'Content-Type':types[extname(path)]});return res.end(readFileSync(resolve(site,'.'+path)));}
  json(404,{error:'Not part of this preview.'});
 }catch(error){json(400,{error:error.message});}
}).listen(port,'127.0.0.1',()=>console.log(`Existing admin preview: ${origin}/admin/#social (read-only)`));
