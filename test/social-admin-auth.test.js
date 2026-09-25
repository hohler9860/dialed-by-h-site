const test=require('node:test');
const assert=require('node:assert/strict');
process.env.ADMIN_PASSWORD='synthetic-admin-password';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-unused-key';
const bridgePath=require.resolve('../lib/social-admin');require(bridgePath);
let calls=0;require.cache[bridgePath].exports=async()=>{calls++;return {configured:true};};
const handler=require('../api/leads-admin');
function response(){return {code:null,body:null,headers:{},setHeader(key,value){this.headers[key]=value;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}
test('Native social actions remain behind website admin authentication',async()=>{
  const anon=response();await handler({method:'POST',headers:{},query:{},body:{action:'social-status'}},anon);assert.equal(anon.code,401);assert.equal(calls,0);
  const admin=response();await handler({method:'POST',headers:{authorization:'Bearer synthetic-admin-password'},query:{},body:{action:'social-status'}},admin);assert.equal(admin.code,200);assert.equal(admin.body.configured,true);assert.equal(calls,1);assert.equal(admin.headers['Cache-Control'],'no-store');
});
test('Scheduler rejects an admin credential and ordinary unauthenticated calls',async()=>{
  for(const auth of ['', 'Bearer synthetic-admin-password']){const res=response();await handler({method:'POST',headers:{authorization:auth},query:{},body:{action:'social-tick'}},res);assert.equal(res.code,401);}
});
test('Draft workflow rejects admin and unauthenticated credentials before database reads',async()=>{
  for(const auth of ['', 'Bearer synthetic-admin-password']){const res=response();await handler({method:'POST',headers:{authorization:auth},query:{},body:{action:'social-workflow',operation:'begin'}},res);assert.equal(res.code,401);}
});
