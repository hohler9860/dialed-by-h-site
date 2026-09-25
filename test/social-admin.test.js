const test=require('node:test');
const assert=require('node:assert/strict');
const socialAdmin=require('../lib/social-admin');
test('Native adapter forwards only supported actions and fields',async()=>{
  let received;
  await socialAdmin({action:'social-edit',id:'post',version:2,body:'Draft',scheduledAt:'2099-01-01',url:'https://attacker.invalid',token:'browser-token'},{native:{admin:async input=>{received=input;return {ok:true};}}});
  assert.deepEqual(received,{action:'edit',id:'post',version:2,body:'Draft',scheduledAt:'2099-01-01'});
  await assert.rejects(()=>socialAdmin({action:'social-delete-account'}),/Unknown/);
  await assert.rejects(()=>socialAdmin({action:'social-workspace',operation:'fetch-url'}),/Unknown workspace/);
});
test('Missing migration is reported without inventing a connected worker',async()=>{
  const result=await socialAdmin({action:'social-status'},{native:{admin:async()=>{throw Object.assign(new Error('missing'),{setup:true});}}});
  assert.equal(result.configured,false);assert.match(result.reason,/migration/);assert.equal(JSON.stringify(result).includes('SOCIAL_POSTER_SECRET'),false);
});
