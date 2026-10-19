const {test,beforeEach,after} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const schema = require('../assets/inquiry-schema');
const handler = require('../lib/inquiry-tracking');
const {randomUUID} = require('node:crypto');
const base = () => ({event_id:randomUUID(),session_id:randomUUID(),form_id:randomUUID(),form_type:'BUY',event:'form_open',path:'/source?email=private@example.com',landing_path:'/buy',utm_source:'Instagram',utm_campaign:'spring-drop',referrer_host:'l.instagram.com',device:'mobile'});
const originalFetch = global.fetch;
after(()=>{global.fetch=originalFetch;});
function response(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.code=s;return this;},json(x){this.body=x;return this;},end(){return this;}};}
beforeEach(()=>{process.env.ADMIN_PASSWORD='test-admin';process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-key';process.env.VERCEL_ENV='production';global.fetch=async()=>{throw new Error('Unexpected network blocked');};});
test('whitelist strips private fields, query strings and message URLs',()=>{
 const event=schema.event({...base(),email:'private@example.com',phone:'+19146211848',text:'private',utm_content:'private@example.com',utm_medium:'9146211848',referrer_host:'private.customer.example.com'});
 assert.equal(event.path,'/source');assert.equal(event.utm_source,'instagram');assert.equal(event.utm_content,null);assert.equal(event.utm_medium,null);assert.equal(event.referrer_host,'other-referral');
 assert.ok(!JSON.stringify(event).includes('private'));assert.ok(!('email' in event));assert.ok(!('text' in event));
});
test('client cannot forge a successful submission event',()=>{assert.equal(schema.event({...base(),event:'form_submit'}),null);});
test('submission attribution preserves join IDs but uses validated server form type',()=>{
 const b=base();assert.deepEqual(handler.attribution(b,'SELL'),{...schema.context(b),form_type:'SELL'});
 assert.equal(handler.attribution({...b,form_id:'bad'},'BUY'),null);assert.equal(handler.attribution(null,'BUY'),null);
});
test('report requires admin authorization before touching database',async()=>{
 const res=response();await handler.handle({method:'GET',headers:{},query:{action:'analytics'}},res);assert.equal(res.code,401);assert.equal(res.headers['Cache-Control'],'private, no-store');
});
test('report rejects arbitrary periods and returns aggregated RPC output',async()=>{
 let res=response();await handler.handle({method:'GET',headers:{authorization:'Bearer test-admin'},query:{action:'analytics',days:'999'}},res);assert.equal(res.code,400);
 global.fetch=async(url,opts)=>{assert.match(url,/rpc\/inquiry_analytics$/);assert.deepEqual(JSON.parse(opts.body),{p_days:30});return {ok:true,json:async()=>({totals:{inquiries:2}})};};
 res=response();await handler.handle({method:'GET',headers:{authorization:'Bearer test-admin'},query:{action:'analytics'}},res);assert.equal(res.code,200);assert.equal(res.body.totals.inquiries,2);
});
function request(body=base()){return {method:'POST',query:{action:'track'},headers:{origin:'https://www.dialedbyhenry.com','content-type':'application/json','x-forwarded-for':'192.0.2.1'},body};}
test('event ingestion rejects cross-origin requests, bad data and oversized payloads',async()=>{
 for(const [req,code] of [[{...request(),headers:{origin:'https://evil.example'}},403],[request({...base(),event:'form_submit'}),400],[request({...base(),extra:'x'.repeat(5000)}),413],[request('{bad'),400]]){const res=response();await handler.handle(req,res);assert.equal(res.code,code);}
});
test('preview events never reach production storage',async()=>{process.env.VERCEL_ENV='preview';const res=response();await handler.handle(request(),res);assert.equal(res.code,204);});
test('ingestion fails closed on rate-limit outage and does not store IPs in events',async()=>{
 let res=response();await handler.handle(request(),res);assert.equal(res.code,503);
 const calls=[];global.fetch=async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return {ok:true,json:async()=>true};};
 res=response();await handler.handle(request(),res);assert.equal(res.code,204);assert.equal(calls.length,3);assert.ok(!JSON.stringify(calls).includes('192.0.2.1'));assert.match(calls[2].url,/on_conflict=event_id/);
});
test('rate-limited events are not inserted',async()=>{let calls=0;global.fetch=async()=>{calls++;return {ok:true,json:async()=>false};};const res=response();await handler.handle(request(),res);assert.equal(res.code,429);assert.equal(calls,1);});
function browser({dnt=false,gpc=false,stored=null}={}){
 const sent=[],listeners={};let data=stored;
 const window={crypto:{randomUUID},dbhInquirySchema:schema};
 const context={window,crypto:window.crypto,URL,URLSearchParams,Blob,WeakMap,Date,JSON,matchMedia:()=>({matches:true}),location:{pathname:'/source',search:'?utm_source=instagram&utm_campaign=bio',hostname:'www.dialedbyhenry.com',href:'https://www.dialedbyhenry.com/source'},document:{referrer:'https://google.com/search?q=private',addEventListener:(name,cb)=>listeners[name]=cb},sessionStorage:{getItem:()=>data,setItem:(_,s)=>data=s},navigator:{doNotTrack:dnt?'1':'0',globalPrivacyControl:gpc,sendBeacon:(_,body)=>{sent.push(body);return true;}}};
 vm.runInNewContext(fs.readFileSync('assets/inquiry-tracking.js','utf8'),context);
 return {window,sent,listeners,stored:()=>data};
}
test('browser correlates one form open and attempt, and retains session attribution across pages',async()=>{
 const b=browser(), form={};b.window.dbhTracking.open(form,'BUY');b.window.dbhTracking.open(form,'BUY');b.window.dbhTracking.attempt(form);
 const events=await Promise.all(b.sent.map(async x=>JSON.parse(await x.text())));
 assert.deepEqual(events.map(e=>e.event),['page_view','form_open','form_attempt']);assert.equal(events[1].form_id,events[2].form_id);assert.equal(b.window.dbhTracking.context(form).form_id,events[1].form_id);
 const next=browser({stored:b.stored()});assert.equal(next.window.dbhTracking.context().session_id,events[0].session_id);
});
test('privacy signals suppress events and submission attribution',()=>{for(const opts of [{dnt:true},{gpc:true}]){const b=browser(opts);b.window.dbhTracking.open({},'BUY');assert.equal(b.sent.length,0);assert.equal(b.window.dbhTracking.context(),null);}});
test('WhatsApp click records no destination query or message content',async()=>{
 const b=browser();b.listeners.click({target:{closest:()=>({href:'https://wa.me/19146211848?text=private%20message',closest:()=>null})}});
 const event=JSON.parse(await b.sent.at(-1).text());assert.equal(event.event,'whatsapp_click');assert.ok(!JSON.stringify(event).includes('private'));assert.ok(!JSON.stringify(event).includes('19146211848'));
});
test('successful inquiry persists normalized attribution with the lead, without trusting a client success event',async()=>{
 delete process.env.RESEND_API_KEY;delete process.env.N8N_LEAD_WEBHOOK_URL;delete process.env.N8N_LEAD_WEBHOOK_SECRET;
 const submit=require('../api/submit-form');let saved;
 global.fetch=async(url,opts)=>{
   if(url.endsWith('/rpc/check_rate_limit'))return {ok:true,json:async()=>true};
   assert.match(url,/\/dialed_submissions$/);saved=JSON.parse(opts.body);return {ok:true,json:async()=>[{id:'local-test-only',...saved}]};
 };
 const res=response();await submit({method:'POST',headers:{origin:'https://www.dialedbyhenry.com'},query:{},body:{type:'BUY',email:'test@example.invalid',fullName:'Local Test',phone:'+12025550123',location:'Boston',attribution:{...base(),email:'do-not-copy@example.invalid'}}},res);
 assert.equal(res.code,200);assert.equal(saved.attribution.utm_source,'instagram');assert.ok(!JSON.stringify(saved.attribution).includes('@'));assert.equal(saved.attribution.form_type,'BUY');
});
