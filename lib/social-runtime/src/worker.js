import { DateTime } from 'luxon';
import { acquire, release, settings, setSetting, nowISO, id, event, transaction } from './db.js';
import { quality } from './editorial.js';
import { generateDrafts } from './generator.js';
import { refreshFeeds } from './research.js';
import { reviewAutonomousDrafts } from './autonomy.js';

export function monthSpend(db) {return db.prepare("SELECT COALESCE(SUM(amount),0) n FROM spend WHERE kind='x' AND created_at>=?").get(DateTime.utc().startOf('month').toISO()).n;}
export function reserve(db,amount,note) {
  return transaction(db,()=>{
    if(monthSpend(db)+amount>settings(db).monthlyXBudget) throw new Error('Monthly X estimate limit reached. Increase it in Settings or wait for next month.');
    db.prepare("INSERT INTO spend(kind,amount,created_at,note) VALUES ('x',?,?,?)").run(amount,nowISO(),note);
  });
}
export async function publishDue(db,x,clock=Date.now()) {
  const owner=id();if(!acquire(db,'publish',owner,180000)) return {status:'busy'};
  let post;
  try {
    const s=settings(db);
    db.prepare("UPDATE posts SET status='uncertain',error='Publishing was interrupted. Check X before resolving.',updated_at=? WHERE status='publishing' AND updated_at<?")
      .run(nowISO(),new Date(clock-10*60000).toISOString());
    if(s.paused || !x.account()) return {status:'paused'};
    db.prepare("UPDATE posts SET status='expired',error='Slot was missed by more than 30 minutes. Review and reschedule.',updated_at=? WHERE status='scheduled' AND scheduled_at<?")
      .run(nowISO(),new Date(clock-30*60000).toISOString());
    post=db.prepare("SELECT * FROM posts WHERE status='scheduled' AND scheduled_at<=? ORDER BY scheduled_at LIMIT 1").get(new Date(clock).toISOString());
    if(!post) return {status:'idle'};
    if(db.prepare("SELECT id FROM posts WHERE status='uncertain' LIMIT 1").get()) return {status:'needs_review'};
    if(db.prepare("SELECT post_id FROM post_verifications WHERE status='unverified' LIMIT 1").get()) {setSetting(db,'paused',true);return {status:'needs_review'};}
    const dayStart=DateTime.fromMillis(clock).setZone(s.timezone).startOf('day').toUTC().toISO();
    const today=db.prepare("SELECT COUNT(*) n FROM posts WHERE status IN ('posted','publishing') AND COALESCE(published_at,updated_at)>=?").get(dayStart).n;
    if(today>=s.dailyMax) return {status:'daily_cap'};
    const last=db.prepare("SELECT published_at FROM posts WHERE status='posted' ORDER BY published_at DESC LIMIT 1").get();
    if(last && clock-Date.parse(last.published_at)<75*60000) return {status:'spacing'};
    const q=quality(db,post);
    if(!post.reviewed_at||q.errors.length) {
      db.prepare("UPDATE posts SET status='draft',reviewed_at=NULL,error=?,updated_at=? WHERE id=?").run(q.errors.join(' ')||'Approval required.',nowISO(),post.id);
      return {status:'review'};
    }
    reserve(db,(/https?:\/\//i.test(post.body)?0.20:0.015)+.01+(post.media_id?0.10:0),`Publish ${post.id}; includes identity check and unsuccessful attempts.`);
    db.prepare("UPDATE posts SET status='publishing',attempts=attempts+1,updated_at=? WHERE id=? AND status='scheduled'").run(nowISO(),post.id);
    let mediaId;
    // Everything before the create-post call is known not to publish a post.
    try {
      await x.accessToken();
      await x.ensureIdentity();
      if(post.media_id) mediaId=await x.upload(db.prepare('SELECT * FROM media WHERE id=?').get(post.media_id));
    } catch(e) {
      db.prepare("UPDATE posts SET status='failed',error=?,updated_at=? WHERE id=?").run(e.message,nowISO(),post.id);
      event(db,'error',e.message,post.id);return {status:'failed'};
    }
    // Pause may have been requested while media/token work was in flight.
    if(settings(db).paused) {db.prepare("UPDATE posts SET status='scheduled',updated_at=? WHERE id=?").run(nowISO(),post.id);return {status:'paused'};}
    try {
      const xId=await x.publish(post,mediaId),stamp=new Date(clock).toISOString();
      db.prepare("UPDATE posts SET status='posted',x_id=?,published_at=?,updated_at=?,error=NULL WHERE id=?").run(xId,stamp,stamp,post.id);
      db.prepare("INSERT OR REPLACE INTO post_verifications(post_id,expected_author,status,next_check) VALUES (?,?,'pending',?)").run(post.id,x.account().user.id,nowISO());
      event(db,'published',`X accepted the post for @${s.handle}; delivery verification pending.`,post.id);return {status:'posted',xId};
    } catch(e) {
      // 429 explicitly rejects the request. Network/5xx/invalid success bodies are ambiguous:
      // never retry those automatically, because X does not provide a create-post idempotency key.
      if(e.status===429 && Date.now()<Date.parse(post.scheduled_at)+30*60000 && post.attempts<3) {
        const retry=new Date(Math.min(e.retryAt||Date.now()+60000,Date.parse(post.scheduled_at)+30*60000)).toISOString();
        db.prepare("UPDATE posts SET status='scheduled',scheduled_at=?,error=?,updated_at=? WHERE id=?").run(retry,e.message,nowISO(),post.id);
        event(db,'warning','X rate limited a post. A bounded retry was scheduled.',post.id);return {status:'rate_limited'};
      }
      const status=e.status>=400&&e.status<500?'failed':'uncertain';
      db.prepare('UPDATE posts SET status=?,error=?,updated_at=? WHERE id=?').run(status,e.message,nowISO(),post.id);
      if(status==='uncertain') setSetting(db,'paused',true);
      event(db,'error',status==='uncertain'?'Publishing paused: X did not confirm whether the post was created. Check the account before resolving.':e.message,post.id);
      return {status};
    }
  } catch(e) {if(post) setSetting(db,'paused',true);event(db,'error',e.message,post?.id);return {status:'error',message:e.message};}
  finally {release(db,'publish',owner);}
}
export async function verifyDeliveries(db,x) {
  if(!x.account()) return;
  const owner=id();if(!acquire(db,'verify-delivery',owner)) return;
  try {
    const pending=db.prepare(`SELECT p.*,v.expected_author,v.attempts AS verification_attempts FROM post_verifications v
      JOIN posts p ON p.id=v.post_id WHERE v.status='pending' AND v.next_check<=? ORDER BY v.next_check LIMIT 1`).get(nowISO());
    if(!pending) return;
    try {
      reserve(db,.005,`Verify post ${pending.id}`);
      await x.verifyPost(pending,pending.expected_author);
      db.prepare("UPDATE post_verifications SET status='verified',checked_at=?,attempts=attempts+1,error=NULL WHERE post_id=?").run(nowISO(),pending.id);
      event(db,'delivery_verified','Fetched the post from X and verified its author and text.',pending.id);
    } catch(e) {
      const attempts=pending.verification_attempts+1,done=attempts>=3;
      db.prepare('UPDATE post_verifications SET status=?,attempts=?,checked_at=?,next_check=?,error=? WHERE post_id=?').run(done?'unverified':'pending',attempts,nowISO(),new Date(Date.now()+(attempts===1?60000:300000)).toISOString(),e.message,pending.id);
      if(done) {setSetting(db,'paused',true);event(db,'error','Delivery could not be verified after three checks. Publishing paused; the accepted post will not be resent.',pending.id);}
    }
  } finally {release(db,'verify-delivery',owner);}
}
export async function syncMetrics(db,x) {
  if(!x.account()) throw new Error('Connect X to sync post metrics.');
  const owner=id();if(!acquire(db,'metrics',owner)) throw new Error('Metrics sync already running.');
  try {
    const posts=db.prepare("SELECT * FROM posts WHERE status='posted' AND published_at>? ORDER BY published_at DESC LIMIT 100").all(new Date(Date.now()-30*86400000).toISOString());
    if(!posts.length) return {updated:0};
    reserve(db,posts.length*.005,'Post metric reads, conservative estimate.');
    const rows=await x.metrics(posts);
    for(const row of rows) db.prepare('UPDATE posts SET metrics=?,metrics_at=? WHERE x_id=?').run(JSON.stringify(row.public_metrics||{}),nowISO(),row.id);
    event(db,'metrics',`Updated metrics for ${rows.length} posts.`);return {updated:rows.length};
  } finally {release(db,'metrics',owner);}
}
async function periodic(db,key,interval,fn) {
  const job=db.prepare('SELECT * FROM jobs WHERE key=?').get(key);
  if(job && Date.now()-Date.parse(job.updated_at)<interval) return;
  db.prepare("INSERT OR REPLACE INTO jobs VALUES (?,'running',?,NULL)").run(key,nowISO());
  try {await fn();db.prepare("UPDATE jobs SET status='complete',updated_at=? WHERE key=?").run(nowISO(),key);}
  catch(e) {db.prepare("UPDATE jobs SET status='failed',updated_at=?,error=? WHERE key=?").run(nowISO(),e.message,key);event(db,'error',`${key}: ${e.message}`);}
}
export function queueAdminJob(db,operation,day) {
  if(operation==='generate'&&(!/^\d{4}-\d{2}-\d{2}$/.test(day||'')||!DateTime.fromISO(day).isValid||day<=DateTime.now().setZone(settings(db).timezone).toISODate())) throw new Error('Choose a future draft date.');
  if(!['generate','refresh'].includes(operation)) throw new Error('Unknown background job.');
  if(operation==='generate'&&db.prepare('SELECT id FROM posts WHERE batch_date=?').get(day)) throw new Error('Drafts already exist for this date.');
  const key=`admin:${operation}:${operation==='generate'?day:'feeds'}`;
  const prior=db.prepare('SELECT status FROM jobs WHERE key=?').get(key);
  if(prior&&['queued','running'].includes(prior.status)) return {queued:true,key};
  db.prepare("INSERT OR REPLACE INTO jobs VALUES (?,'queued',?,NULL)").run(key,nowISO());return {queued:true,key};
}
export async function runAdminJobs(db,config,handlers={generate:generateDrafts,refresh:refreshFeeds}) {
  const owner=id();if(!acquire(db,'admin-jobs',owner,600000)) return;
  try {
    const job=db.prepare("SELECT * FROM jobs WHERE key LIKE 'admin:%' AND status='queued' ORDER BY updated_at LIMIT 1").get();
    if(!job)return;
    db.prepare("UPDATE jobs SET status='running',updated_at=? WHERE key=?").run(nowISO(),job.key);
    try {
      const [,operation,day]=job.key.split(':');
      if(operation==='generate') await handlers.generate(db,config,day);else await handlers.refresh(db);
      db.prepare("UPDATE jobs SET status='complete',updated_at=?,error=NULL WHERE key=?").run(nowISO(),job.key);
      event(db,'background',operation==='generate'?'Requested draft batch is ready in the website admin.':'Requested research refresh finished.');
    } catch(error) {db.prepare("UPDATE jobs SET status='failed',updated_at=?,error=? WHERE key=?").run(nowISO(),error.message,job.key);event(db,'error',error.message);}
  } finally {release(db,'admin-jobs',owner);}
}
export function startWorker(db,x,config) {
  db.prepare("UPDATE jobs SET status='failed',error='Worker restarted during this job. Review the results before retrying.' WHERE key LIKE 'admin:%' AND status='running'").run();
  let busy=false,publishing=false,stopped=false;
  const publisher=async()=> {
    if(publishing||stopped) return;publishing=true;
    setSetting(db,'workerHeartbeat',nowISO());
    try {await publishDue(db,x);await verifyDeliveries(db,x);}
    catch(e) {event(db,'error',e.message);}
    finally {setSetting(db,'lastPublishSweep',nowISO());publishing=false;}
  };
  const maintenance=async()=> {
    if(busy||stopped) return;busy=true;
    try {
      await runAdminJobs(db,config);
      const s=settings(db),time=DateTime.now().setZone(s.timezone);
      if(s.autoGenerate && config.openaiKey) {
        await periodic(db,'research',6*3600000,()=>refreshFeeds(db));
        if(time.hour>=18) {
          const day=time.plus({days:1}).toISODate();
          if(!db.prepare('SELECT id FROM posts WHERE batch_date=?').get(day)) await periodic(db,`daily:${day}`,3600000,()=>generateDrafts(db,config,day));
        }
      }
      if(s.autonomy==='autonomous'&&config.openaiKey) await reviewAutonomousDrafts(db,config);
      if(x.account()) await periodic(db,'metrics',24*3600000,()=>syncMetrics(db,x));
      db.prepare('DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT 3000)').run();
    } catch(e) {event(db,'error',e.message);} finally {busy=false;}
  };
  const publishTimer=setInterval(publisher,30000),maintenanceTimer=setInterval(maintenance,60000);
  publishTimer.unref();maintenanceTimer.unref();publisher();maintenance();
  return async()=>{stopped=true;clearInterval(publishTimer);clearInterval(maintenanceTimer);while(busy||publishing) await new Promise(resolve=>setTimeout(resolve,100));};
}
