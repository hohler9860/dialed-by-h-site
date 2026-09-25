import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDB,nowISO} from '../src/db.js';
import {createPost} from '../src/editorial.js';
import {snapshot,restore} from '../snapshot.mjs';
import {safeImage,matchCatalogue,searchCatalogue,importCatalogueImage,attachNextImage,imageBytes} from '../website-images.mjs';
const origin='https://project.supabase.co';
const photo=origin+'/storage/v1/object/public/pieces/abc-123/0.webp';
const piece={id:'watch',brand:'Rolex',model:'GMT-Master II',reference:'126710BLNR',image:photo};
const raw={...piece,ref:piece.reference,images:[photo]};
function context(t,rows=[raw]){const db=openDB(':memory:'),dataDir=mkdtempSync(join(tmpdir(),'catalog-test-'));t.after(()=>{db.close();rmSync(dataDir,{recursive:true,force:true});});return {db,config:{dataDir},store:{url:origin,request:async()=>rows}};}
const imageFetch=async()=>new Response(await sharp({create:{width:30,height:40,channels:4,background:'#111111'}}).webp().toBuffer());
test('Asset URLs stay within the existing public pieces bucket',()=>{
 assert.equal(safeImage(photo,origin),photo);
 for(const url of ['http://127.0.0.1/a.png',photo+'?x=y',photo.replace('/pieces/','/private/'),photo.replace('project.supabase.co','attacker.example'),photo.replace('https://','https://user:pass@')])assert.equal(safeImage(url,origin),null);
});
test('Matching requires one complete reference and its brand; never a generic Rolex picture',()=>{
 assert.equal(matchCatalogue('Rolex 126710BLNR: inspect the clasp.',[piece]).piece.id,'watch');
 for(const text of ['Rolex GMT-Master II','Some two-tone Rolex','126710BLNR is great','Rolex 126710BLNRXYZ','Rolex 126710BLNR-001','Rolex 126710BLNR/1','Rolex 126710BLNR.001'])assert.equal(matchCatalogue(text,[piece]).piece,undefined);
 assert.equal(matchCatalogue('Rolex 126710BLNR.',[piece]).piece.id,'watch');
 assert.equal(matchCatalogue('Rolex 126710BLNR',[piece,{...piece,id:'dial-variant'}]).piece,undefined);
 assert.equal(matchCatalogue('Rolex 126710BLNR versus 126506',[piece,{...piece,reference:'126506'}]).piece,undefined);
});
test('Catalogue search, real WebP conversion, private import deduplication and cold restore',async t=>{
 const ctx=context(t);const results=await searchCatalogue(ctx,{query:'Rolex BLNR'});assert.equal(results.matched,1);assert.equal(results.items[0].reference,'126710BLNR');
 let calls=0;const fetcher=async(url,options)=>{assert.equal(url,photo);assert.equal(options.redirect,'error');assert.equal(options.headers,undefined);calls++;return imageFetch();};
 const media=await importCatalogueImage(ctx,{pieceId:'watch'},fetcher);
 assert.equal((await importCatalogueImage(ctx,{pieceId:'watch'},fetcher)).id,media.id);assert.equal(calls,1);
 const next=openDB(':memory:');t.after(()=>next.close());restore(next,snapshot(ctx.db));
 assert.equal(next.prepare('SELECT source_url FROM media_catalog').get().source_url,photo);
 assert.equal(next.prepare('SELECT mime FROM media').get().mime,'image/png');
 await assert.rejects(()=>importCatalogueImage(ctx,{pieceId:'https://attacker.example/photo'},fetcher),/no longer/);
});
test('Automatic image selection skips human edits, avoids reuse, and records text-only decisions',async t=>{
 const ctx=context(t);
 const make=()=>{const p=createPost(ctx.db,{body:'Rolex 126710BLNR: inspect the clasp.',category:'Buyer advice'});ctx.db.prepare('UPDATE posts SET ai_generated=1 WHERE id=?').run(p.id);return p;};
 const edited=make();ctx.db.prepare('INSERT INTO editorial_reviews VALUES (?,?,?,?,?,?)').run(edited.id,1,'human_edit',0,'[]',nowISO());
 const p=make();assert.equal(await attachNextImage(ctx,imageFetch),true);
 assert.equal(ctx.db.prepare('SELECT media_id FROM posts WHERE id=?').get(edited.id).media_id,null);
 assert.ok(ctx.db.prepare('SELECT media_id FROM posts WHERE id=?').get(p.id).media_id);
 const duplicate=make();assert.equal(await attachNextImage(ctx,imageFetch),true);
 assert.equal(ctx.db.prepare('SELECT media_id FROM posts WHERE id=?').get(duplicate.id).media_id,null);
 assert.match(ctx.db.prepare('SELECT reason FROM post_image_checks WHERE post_id=?').get(duplicate.id).reason,/14 days/);
 assert.equal(await attachNextImage(ctx,imageFetch),false);
});
test('Oversized and non-image responses are rejected before upload',async()=>{
 await assert.rejects(()=>imageBytes(photo,async()=>new Response('x',{headers:{'content-length':String(9*1024*1024)}})),/too large/);
 await assert.rejects(()=>imageBytes(photo,async()=>new Response('not an image')),/unsupported image/);
 const bytes=await imageBytes(photo,imageFetch);const meta=await sharp(bytes).metadata();assert.equal(meta.format,'png');assert.equal(meta.width,30);assert.equal(meta.height,40);
});
test('External editorial review permits a photo on an untouched n8n draft; a human edit still prevents it',async t=>{
 const ctx=context(t);const make=()=>createPost(ctx.db,{body:'Rolex 126710BLNR: inspect the clasp.',category:'Buyer advice',ai:true,note:'n8n · proposed draft'});
 const edited=make();ctx.db.prepare('INSERT INTO editorial_reviews VALUES (?,?,?,?,?,?)').run(edited.id,1,'human_edit',0,'[]',nowISO());
 const generated=make();ctx.db.prepare('INSERT INTO editorial_reviews VALUES (?,?,?,?,?,?)').run(generated.id,1,'model-review-hash',0,'[]',nowISO());
 assert.equal(await attachNextImage(ctx,imageFetch),true);assert.ok(ctx.db.prepare('SELECT media_id FROM posts WHERE id=?').get(generated.id).media_id);assert.equal(ctx.db.prepare('SELECT media_id FROM posts WHERE id=?').get(edited.id).media_id,null);
});
