const {test}=require('node:test');
const assert=require('node:assert/strict');
const {requestFor,sourceHash,evaluate,shortlist,priceTarget}=require('../lib/client-matching');
const now=Date.parse('2026-10-10T12:00:00Z');
const want={id:20,brand:'Rolex',model:'Daytona',reference:'126500LN',max_price:30000,status:'OPEN',notes:'Panda or black, unworn, full set'};
const saved={want_id:20,source_hash:sourceHash(want),confirmed_at:new Date(now).toISOString(),preferences:{condition:'UNWORN',set:'FULL_SET',year_from:2025,year_to:2026,dial_color:'WHITE'}};
const req=()=>requestFor(want,saved,now);
const listing={id:1,brand:'Rolex',model:'Daytona',reference:'126500LN',price_usd:25000,condition:'UNWORN',set_completeness:'FULL_SET',year:2025,dial_color:'WHITE',listing_type:'FOR_SALE',status:'ACTIVE',message_ts:new Date(now-3600000).toISOString(),trust_score:90,photo_read_at:new Date(now-3500000).toISOString(),photo_conflicts:[],photo_unresolved:[]};
test('full suffix reference is required; punctuation is equivalent',()=>{
 assert.ok(evaluate(req(),{...listing,reference:'126500'},now).rejected.includes('Reference differs'));
 assert.equal(evaluate(req(),{...listing,reference:'126-500 LN'},now).rejected.length,0);
});
test('identity never uses null as a wildcard',()=>{
 assert.ok(evaluate({...req(),brand:null,model:null,reference:null},listing,now).rejected.length);
 assert.ok(evaluate(req(),{...listing,brand:null},now).rejected.length);
 assert.ok(evaluate(req(),{...listing,reference:null},now).rejected.length);
});
test('cross-brand corrupt reference cannot pass',()=>{
 assert.ok(evaluate({...req(),brand:'Rolex',model:'Explorer I',reference:'5226G'},{...listing,brand:'Patek Philippe',model:'Calatrava',reference:'5226G'},now).rejected.includes('Brand differs'));
});
test('contradictory model is rejected despite exact reference',()=>{
 assert.ok(evaluate({...req(),model:'Day-Date',reference:'279173'},{...listing,model:'Datejust',reference:'279173'},now).rejected.includes('Model differs'));
});
test('spec mismatches reject; absent evidence requires review',()=>{
 for(const [field,value] of [['condition','PRE_OWNED'],['set_completeness','WATCH_ONLY'],['year',2023],['dial_color','BLACK']]) assert.ok(evaluate(req(),{...listing,[field]:value},now).rejected.length,field);
 const a=evaluate(req(),{...listing,year:null,dial_color:null},now);
 assert.equal(a.rejected.length,0); assert.ok(a.review.includes('Year not stated')); assert.ok(a.review.includes('Dial not stated'));
});
test('expired requests and changed source invalidate confirmation',()=>{
 assert.equal(requestFor(want,{...saved,confirmed_at:new Date(now-31*864e5).toISOString()},now).confirmed,false);
 assert.equal(requestFor({...want,notes:'Budget changed'},saved,now).confirmed,false);
 assert.equal(requestFor(want,saved,now).confirmed,true);
});
test('stale, sold, parts and invalid dealer prices reject',()=>{
 for(const l of [{...listing,message_ts:new Date(now-4*864e5).toISOString()},{...listing,status:'SOLD'},{...listing,listing_type:'PARTS'},{...listing,price_usd:0}]) assert.ok(evaluate(req(),l,now).rejected.length);
});
test('budget must accommodate minimum 5 percent target',()=>{
 assert.ok(evaluate(req(),{...listing,price_usd:29000},now).rejected.includes('Five-percent target exceeds client budget'));
});
test('photo conflicts remain review gates even with high trust',()=>{
 const a=evaluate(req(),{...listing,photo_conflicts:['dial'],trust_score:100},now);
 assert.ok(a.review.includes('Photo evidence is disputed or unresolved')); assert.equal(a.status,'NEEDS_REVIEW');
});
test('better evidence outranks cheaper listing; lead heat cannot fix a mismatch',()=>{
 const r=shortlist([{...want,lead_quality:'HOT'}],[{...listing,id:2,price_usd:20000,photo_read_at:null},listing,{...listing,id:3,price_usd:15000,dial_color:'BLACK'}],[saved],now);
 assert.equal(r.best[0].listing_id,1); assert.equal(r.best[0].candidate_count,2); assert.equal(r.diagnostic[0].rejected,1);
});
test('5 to 8 percent targets are capped by budget, costs remain explicit',()=>{
 const p=priceTarget({...req(),max_price:26500},listing,[],now);
 assert.equal(p.target_low,26250); assert.equal(p.target_high,26500); assert.equal(p.market_supported,false);
});
test('market requires fresh full-spec observations from multiple sources',()=>{
 const r={brand:'Rolex',reference:'126500LN',price_usd:26600,available:true,last_seen:new Date(now).toISOString(),condition:'UNWORN',set_completeness:'FULL_SET',year:2025,dial_color:'WHITE'};
 const rows=[{...r,source_slug:'a'},{...r,source_slug:'a'},{...r,source_slug:'b'}];
 assert.equal(priceTarget(req(),listing,rows,now).target_high,26600);
 assert.equal(priceTarget(req(),listing,rows,now).market_supported,true);
 assert.equal(priceTarget(req(),listing,rows.map(r=>({...r,dial_color:null})),now).market_supported,false);
 assert.equal(priceTarget(req(),listing,rows.map(r=>({...r,last_seen:new Date(now-2*864e5).toISOString()})),now).market_supported,false);
 assert.equal(priceTarget(req(),listing,rows.map(r=>({...r,source_slug:'a'})),now).market_supported,false);
});
test('known ingestion status classified is eligible; awaiting verify stays in review',()=>{
 assert.equal(evaluate(req(),{...listing,status:'classified'},now).rejected.length,0);
 assert.ok(evaluate(req(),{...listing,status:'awaiting_verify'},now).review.includes('Listing verification status incomplete'));
});
test('explicit no-diamond and factory-origin constraints are enforced',()=>{
 assert.ok(evaluate({...req(),has_diamonds:false},{...listing,has_diamonds:true},now).rejected.includes('Diamonds differ'));
 assert.ok(evaluate({...req(),diamonds_factory:true},{...listing,has_diamonds:true,diamonds_factory:false},now).rejected.includes('Diamond origin differs'));
});
test('human rejection suppresses only the unchanged request and listing evidence',()=>{
 const {evidenceHash,VERSION}=require('../lib/client-matching');
 const label={want_id:want.id,listing_id:listing.id,evidence_hash:evidenceHash(req(),listing),engine_version:VERSION,decision:'REJECT',reason:'Incorrect variant'};
 assert.equal(shortlist([want],[listing],[saved],now,[label]).best.length,0);
 assert.equal(shortlist([want],[{...listing,price_usd:24000}],[saved],now,[label]).best.length,1);
 assert.equal(shortlist([{...want,notes:'Updated request'}],[listing],[saved],now,[label]).best.length,1);
});
