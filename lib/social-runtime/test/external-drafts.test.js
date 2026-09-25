import test from 'node:test';
import assert from 'node:assert/strict';
import {openDB,setSetting,settings} from '../src/db.js';
import {categories,createPost} from '../src/editorial.js';
import {workflowToken,workflowAuthorized,beginBatch,commitBatch,failBatch,draftStatus,writerModel,reviewModel} from '../src/external-drafts.js';
import {snapshot,restore} from '../snapshot.mjs';
import {workflow} from '../native.mjs';
const bodies=['A watch box can be replaced. Before calling a set complete, ask exactly which documents accompany the watch and whether the serial on those documents matches the case.','A service invoice deserves a closer read than the words recently serviced. Ask who did the work, when it happened and which parts were replaced.','Before choosing a bracelet watch, ask how many removable links come with it. A low asking price is less helpful if you still need to source the links that make it fit.','Buying remotely? Put return terms in writing before paying. Know the inspection window, who pays return shipping and which conditions could invalidate a return.','Shopping for a watch? Send me the reference, budget and the condition you would accept. A precise brief makes a shortlist more useful than a screenshot alone.'];
function setup(t){const db=openDB(':memory:');t.after(()=>db.close());setSetting(db,'n8nDrafts',true);return db;}
function batch(run){return {runId:run.runId,posts:categories.map((category,i)=>({category,body:bodies[i],sourceIds:[],factual:false,note:'Audience: watch buyer. Job: concrete advice. Evergreen checklist, no claimed inventory.'})),reviews:categories.map((_,index)=>({index,approved:true,reasons:[],timeSensitive:false})),usage:[{model:writerModel,cost:.001},{model:reviewModel,cost:.001}]};}
test('Draft-only token is distinct, rejects admin secrets and authenticates before storage access',async()=>{
 const env={SUPABASE_SERVICE_ROLE_KEY:'synthetic-private-key'};const token=workflowToken(env);
 assert.equal(workflowAuthorized('Bearer '+token,env),true);for(const h of ['Bearer admin','Bearer '+'a'.repeat(64),'',null])assert.equal(workflowAuthorized(h,env),false);
 await assert.rejects(()=>workflow('Bearer admin',{operation:'begin'},{env,store:{read(){throw Error('Storage accessed before authentication');}}}),/Unauthorized/);
 await assert.rejects(()=>workflow('Bearer '+token,{operation:'resume'},{env}),/Unknown drafting/);
});
test('Sanitized context, reservation, review drafts and idempotency survive cold restore',t=>{
 const db=setup(t);db.prepare("INSERT INTO credentials VALUES ('x','secret-token')").run();db.prepare("INSERT INTO leads(id,name,contact,created_at,updated_at) VALUES ('lead','PRIVATE CLIENT','private@email.invalid','2026','2026')").run();
 createPost(db,{body:'PRIVATE UNPUBLISHED DRAFT',category:'Opinion'});setSetting(db,'voice','PRIVATE VOICE NOTE');db.prepare("INSERT INTO sources VALUES ('private','PRIVATE SOURCE',NULL,'PRIVATE EXCERPT','manual',NULL,'2026',1)").run();
 const run=beginBatch(db,{catalogue:[{id:'p',brand:'Rolex',model:'Explorer',reference:'124270',price:'PRIVATE PRICE'}]});
 assert.equal(run.skip,false);const serialized=JSON.stringify(run);for(const value of ['PRIVATE CLIENT','secret-token','PRIVATE PRICE','private@email.invalid','PRIVATE UNPUBLISHED DRAFT','PRIVATE VOICE NOTE','PRIVATE SOURCE','PRIVATE EXCERPT'])assert.equal(serialized.includes(value),false);
 assert.equal(beginBatch(db).skip,true);assert.equal(draftStatus(db).monthSpend,.04);
 const r=commitBatch(db,batch(run));assert.equal(r.ids.length,5);assert.equal(r.scheduled,0);assert.equal(r.held,5);assert.equal(settings(db).paused,true);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM posts WHERE status='draft' AND scheduled_at IS NOT NULL").get().n,5);assert.equal(draftStatus(db).monthSpend,.002);
 const cold=openDB(':memory:');t.after(()=>cold.close());restore(cold,snapshot(db));assert.equal(commitBatch(cold,batch(run)).duplicate,true);assert.equal(beginBatch(cold).skip,true);assert.equal(cold.prepare('SELECT COUNT(*) n FROM posts').get().n,6);
});
test('Invalid source and malformed review cannot partially save a batch',t=>{const db=setup(t),r=beginBatch(db),b=batch(r);b.posts[0].sourceIds=['invented'];assert.throws(()=>commitBatch(db,b),/source/);assert.equal(db.prepare('SELECT COUNT(*) n FROM posts').get().n,0);b.posts[0].sourceIds=[];b.reviews[0].index=1;assert.throws(()=>commitBatch(db,b),/indices/);});
test('Autonomous mode uses both gates and keeps holds as drafts without changing pause',t=>{const db=setup(t);setSetting(db,'autonomy','autonomous');const r=beginBatch(db),b=batch(r);b.posts[0].body+=' example.com';b.reviews[1].approved=false;b.reviews[1].reasons=['Unsupported claim.'];b.reviews[2].timeSensitive=true;const out=commitBatch(db,b);assert.equal(out.scheduled,2);assert.equal(out.held,3);assert.equal(settings(db).paused,true);});
test('Superseded runs, disabled automation, two-attempt cap and monthly budget fail closed',t=>{
 const db=setup(t),r=beginBatch(db);failBatch(db,{runId:r.runId});const next=beginBatch(db);assert.notEqual(r.runId,next.runId);assert.throws(()=>commitBatch(db,batch(r)),/superseded/);setSetting(db,'n8nDrafts',false);assert.throws(()=>commitBatch(db,batch(next)),/disabled/);setSetting(db,'n8nDrafts',true);failBatch(db,{runId:next.runId});assert.match(beginBatch(db).reason,/attempt/);
 db.prepare('DELETE FROM draft_batches').run();db.prepare("INSERT INTO spend(kind,amount,created_at) VALUES ('n8n_generation',1,?)").run(new Date().toISOString());assert.match(beginBatch(db).reason,/Monthly/);
});
test('Concurrent human batch blocks AI overwrite; user schedule is read at commit',t=>{
 const db=setup(t),r=beginBatch(db);createPost(db,{body:'A manually prepared draft.',category:'Opinion',batchDate:r.day});assert.throws(()=>commitBatch(db,batch(r)),/created while/);assert.equal(db.prepare('SELECT COUNT(*) n FROM posts').get().n,1);
});
test('Model approval never bypasses factual or technical-claim holds',t=>{const db=setup(t);setSetting(db,'autonomy','autonomous');const r=beginBatch(db),b=batch(r);b.posts[0].body='The Rolex example has a helium escape valve.';b.posts[1].factual=true;const out=commitBatch(db,b);assert.equal(out.scheduled,3);assert.match(db.prepare('SELECT reasons FROM editorial_reviews WHERE post_id=?').get(out.ids[0]).reasons,/Technical/);});
