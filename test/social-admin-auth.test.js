const test = require('node:test');
const assert = require('node:assert/strict');
// These environment values are synthetic and confined to this test process.
process.env.ADMIN_PASSWORD='synthetic-admin-password';
process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-unused-key';
delete process.env.SOCIAL_POSTER_URL;
delete process.env.SOCIAL_POSTER_SECRET;
const handler=require('../api/leads-admin');
function response() {return {code:null,body:null,headers:{},setHeader(key,value){this.headers[key]=value;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}
test('Social status is behind the existing website admin authentication',async()=>{
    const anonymous=response();await handler({method:'POST',headers:{},query:{},body:{action:'social-status'}},anonymous);
    assert.equal(anonymous.code,401);
    const admin=response();await handler({method:'POST',headers:{authorization:'Bearer synthetic-admin-password'},query:{},body:{action:'social-status'}},admin);
    assert.equal(admin.code,200);assert.equal(admin.body.configured,false);assert.equal(admin.headers['Cache-Control'],'no-store');
});
test('Service setup failures remain actionable in the existing admin UI',async()=>{
    const admin=response();await handler({method:'POST',headers:{authorization:'Bearer synthetic-admin-password'},query:{},body:{action:'social-resume'}},admin);
    assert.equal(admin.code,502);assert.match(admin.body.error,/Connect the social publishing service first/);
});
