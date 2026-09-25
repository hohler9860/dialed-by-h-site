const test = require('node:test');
const assert = require('node:assert/strict');
const socialAdmin = require('../lib/social-admin');
const env = {SOCIAL_POSTER_URL:'https://poster.example.com',SOCIAL_POSTER_SECRET:'private-bridge-secret'.repeat(3)};
test('Missing configuration is reported honestly without a network request', async () => {
    const result = await socialAdmin({action:'social-status'},{env:{}});
    assert.equal(result.configured,false);
    await assert.rejects(()=>socialAdmin({action:'social-resume'},{env:{}}),/Connect/);
});
test('Proxy fixes the destination and forwards only allowed fields', async () => {
    let called = false;
    const result=await socialAdmin({action:'social-edit',id:'post',version:2,body:'Draft',scheduledAt:'2099-01-01',url:'https://attacker.invalid',token:'browser-token'}, {env,fetch:async(url,options)=>{
        called=true;assert.equal(url,'https://poster.example.com/api/admin-bridge');assert.equal(options.redirect,'error');
        assert.equal(options.headers.Authorization,'Bearer '+env.SOCIAL_POSTER_SECRET);
        assert.deepEqual(JSON.parse(options.body),{action:'edit',id:'post',version:2,body:'Draft',scheduledAt:'2099-01-01'});
        return new Response(JSON.stringify({ok:true}));
    }});
    assert.equal(called,true);assert.deepEqual(result,{ok:true});
});
test('Unknown actions, insecure origins, service auth failures and outages fail closed', async () => {
    await assert.rejects(()=>socialAdmin({action:'social-delete-account'},{env}),/Unknown/);
    for(const url of ['http://poster.example.com','https://user:pass@poster.example.com','https://poster.example.com/elsewhere']) {
        await assert.rejects(()=>socialAdmin({action:'social-status'},{env:{...env,SOCIAL_POSTER_URL:url}}),/HTTPS origin/);
    }
    await assert.rejects(()=>socialAdmin({action:'social-status'},{env,fetch:async()=>new Response('{}',{status:401})}),/authentication failed/);
    await assert.rejects(()=>socialAdmin({action:'social-status'},{env,fetch:async()=>{throw new Error('network');}}),/No success was assumed/);
});
