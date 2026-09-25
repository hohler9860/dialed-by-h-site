import sharp from 'sharp';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {id,nowISO,event,settings,transaction} from './src/db.js';

const caches=new Map(), MAX_BYTES=8*1024*1024;
const fail=message=>Object.assign(new Error(message),{status:400});
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function safeImage(value,origin){
  try{const u=new URL(value);return u.origin===new URL(origin).origin&&u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/storage\/v1\/object\/public\/pieces\/[a-f0-9-]+\/[a-zA-Z0-9_.-]+\.(webp|png|jpe?g)$/i.test(u.pathname)?u.href:null;}catch{return null;}
}
export async function catalogue(store){
  const cached=caches.get(store.url);if(cached&&cached.until>Date.now())return cached.rows;
  const rows=[],deadline=Date.now()+12000;
  for(let page=0;page<20;page++){
    const remaining=deadline-Date.now();if(remaining<=0)throw Error('Watch catalogue timed out. Try again.');
    const batch=await store.request('/rest/v1/pieces?select=id,brand,model,ref,images&order=id&limit=1000&offset='+page*1000,{timeoutMs:Math.min(6000,remaining)});
    if(!Array.isArray(batch))throw Error('Watch catalogue is unavailable.');
    for(const row of batch){
      const image=Array.isArray(row.images)?row.images.map(v=>safeImage(v,store.url)).find(Boolean):null;
      if(image)rows.push({id:row.id,brand:row.brand||'',model:row.model||'',reference:row.ref||'',image});
    }
    if(batch.length<1000){caches.set(store.url,{rows,until:Date.now()+180000});return rows;}
  }
  throw Error('Watch catalogue exceeded its paging limit.');
}
export async function searchCatalogue(ctx,input={}){
  const rows=await catalogue(ctx.store),terms=normalize(String(input.query||'').slice(0,160)).split(' ').filter(Boolean);
  const matches=rows.filter(r=>terms.every(t=>normalize(r.brand+' '+r.model+' '+r.reference).includes(t)));
  const page=Math.min(Math.max(0,Math.floor(Number(input.page)||0)),Math.max(0,Math.ceil(matches.length/24)-1));
  const usage=ctx.db.prepare("SELECT c.source_url,COUNT(p.id) uses,MAX(p.published_at) last_used FROM media_catalog c LEFT JOIN posts p ON p.media_id=c.media_id AND p.status IN ('posted','scheduled','publishing','uncertain') GROUP BY c.source_url").all();
  return {total:rows.length,matched:matches.length,page,pageSize:24,items:matches.slice(page*24,(page+1)*24).map(r=>({...r,...usage.find(u=>u.source_url===r.image)}))};
}
export async function imageBytes(url,fetcher=fetch){
  const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Website photograph could not be downloaded.');
  if(Number(response.headers.get('content-length'))>MAX_BYTES)throw fail('Website photograph is too large.');
  const reader=response.body.getReader(),parts=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES)throw fail('Website photograph is too large.');parts.push(value);}}finally{await reader.cancel();}
  const source=Buffer.concat(parts),options={limitInputPixels:25000000,failOn:'error'};
  const meta=await sharp(source,options).metadata();
  if(!['webp','png','jpeg'].includes(meta.format)||meta.pages>1)throw fail('Use a still JPEG, PNG or WebP photograph.');
  const data=await sharp(source,options).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).png().toBuffer();
  if(data.length>5*1024*1024)throw fail('Converted photograph exceeds the upload limit.');
  return data;
}
export async function importCatalogueImage(ctx,input={},fetcher=fetch){
  if(typeof input.pieceId!=='string'||input.pieceId.length>80)throw fail('Choose a watch from the website catalogue.');
  const piece=(await catalogue(ctx.store)).find(p=>p.id===input.pieceId);
  if(!piece)throw fail('This watch no longer has an eligible catalogue photograph.');
  const existing=ctx.db.prepare('SELECT m.id,m.alt,c.source_url FROM media m JOIN media_catalog c ON c.media_id=m.id WHERE c.source_url=?').get(piece.image);
  if(existing)return existing;
  const data=await imageBytes(piece.image,fetcher),mediaId=id(),filename=mediaId+'.png';
  const alt=[piece.brand,piece.model,piece.reference].filter(Boolean).join(' ')+' — website catalogue photograph.';
  mkdirSync(join(ctx.config.dataDir,'media'),{recursive:true,mode:0o700});
  writeFileSync(join(ctx.config.dataDir,'media',filename),data,{mode:0o600});
  transaction(ctx.db,()=>{
    ctx.db.prepare('INSERT INTO media VALUES (?,?,?,?,?,?)').run(mediaId,filename,'image/png',alt,'Website catalogue photograph reused at the site owner’s request. Source: '+piece.image,nowISO());
    ctx.db.prepare('INSERT INTO media_catalog VALUES (?,?,?,?,?,?)').run(mediaId,piece.id,piece.image,piece.brand,piece.model,piece.reference);
  });
  return {id:mediaId,alt,source_url:piece.image};
}
// Require the complete reference, one unambiguous catalogue entry, and its brand.
// A family name or a base reference shared by dial/bracelet variants is insufficient.
export function matchCatalogue(body,rows){
  const text=' '+normalize(body)+' ';
  const matches=rows.filter(r=>{
    if(!r.reference||normalize(r.reference).length<4)return false;
    const literal=String(r.reference).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    return new RegExp('(?<![a-z0-9/.-])'+literal+'(?![a-z0-9/-]|\\.[a-z0-9])','i').test(body);
  });
  if(matches.length!==1)return {reason:matches.length?'Multiple catalogue watches match; choose the photograph manually.':'No unique exact reference; left text-only.'};
  const piece=matches[0];
  if(!piece.brand||!text.includes(' '+normalize(piece.brand)+' '))return {reason:'Reference found without its brand; choose the photograph manually.'};
  return {piece};
}
export function imageCandidate(db){
  return db.prepare("SELECT p.* FROM posts p LEFT JOIN post_image_checks c ON c.post_id=p.id LEFT JOIN editorial_reviews r ON r.post_id=p.id WHERE p.status='draft' AND p.ai_generated=1 AND p.media_id IS NULL AND (r.post_id IS NULL OR (p.editorial_note LIKE 'n8n · %' AND r.body_hash!='human_edit')) AND (c.post_id IS NULL OR c.version!=p.version) ORDER BY p.created_at LIMIT 1").get();
}
export async function attachNextImage(ctx,fetcher=fetch){
  const {db}=ctx;if(settings(db).autoSiteImages===false)return false;
  const post=imageCandidate(db);if(!post)return false;
  let reason,media;
  try{
    const match=matchCatalogue(post.body,await catalogue(ctx.store));reason=match.reason;
    if(match.piece){
      const used=db.prepare("SELECT 1 FROM posts p JOIN media_catalog c ON c.media_id=p.media_id WHERE c.source_url=? AND (p.status IN ('scheduled','publishing','uncertain') OR (p.status='posted' AND p.published_at>?) OR (p.status='draft' AND p.updated_at>?)) LIMIT 1").get(match.piece.image,new Date(Date.now()-14*86400000).toISOString(),new Date(Date.now()-14*86400000).toISOString());
      if(used)reason='Matching photograph used or reserved in the last 14 days; left text-only.';
      else media=await importCatalogueImage(ctx,{pieceId:match.piece.id},fetcher);
    }
  }catch(e){reason='Catalogue image unavailable: '+e.message;}
  transaction(db,()=>{
    if(media)db.prepare('UPDATE posts SET media_id=?,version=version+1,updated_at=? WHERE id=?').run(media.id,nowISO(),post.id);
    db.prepare('INSERT OR REPLACE INTO post_image_checks VALUES (?,?,?,?,?)').run(post.id,post.version+(media?1:0),media?'attached':'text-only',reason||'Exact reference matched. Catalogue photograph is illustrative, not proof of stock or condition.',nowISO());
    event(db,'image',reason||'Website catalogue photograph attached by exact reference.',post.id);
  });
  return true;
}
