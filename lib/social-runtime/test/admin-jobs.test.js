import test from 'node:test';
import assert from 'node:assert/strict';
import {openDB} from '../src/db.js';
import {queueAdminJob,runAdminJobs} from '../src/worker.js';
test('Admin jobs deduplicate pending work, report failures and permit an explicit retry',async()=>{
 const db=openDB(':memory:');
 try{
  assert.throws(()=>queueAdminJob(db,'generate','2000-01-01'),/future/);
  const first=queueAdminJob(db,'generate','2099-01-20');
  assert.deepEqual(queueAdminJob(db,'generate','2099-01-20'),first);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM jobs').get().n,1);
  let calls=0;
  await runAdminJobs(db,{}, {generate:async()=>{calls++;throw new Error('Provider offline');}});
  assert.equal(calls,1);assert.equal(db.prepare('SELECT status FROM jobs').get().status,'failed');
  await runAdminJobs(db,{}, {generate:async()=>{calls++;}});assert.equal(calls,1);
  queueAdminJob(db,'generate','2099-01-20');
  await runAdminJobs(db,{}, {generate:async(_db,_config,day)=>{calls++;assert.equal(day,'2099-01-20');}});
  assert.equal(calls,2);assert.equal(db.prepare('SELECT status FROM jobs').get().status,'complete');
 }finally{db.close();}
});
