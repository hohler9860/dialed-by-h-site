import {draftStatus} from './external-drafts.js';
import { settings,setSetting,nowISO,event } from './db.js';
import { approve,quality } from './editorial.js';
import { monthSpend,reserve } from './worker.js';
import { randomBytes,createHash } from 'node:crypto';
export function socialStatus(db,x,config) {
  const s=settings(db),account=x.account();
  const posts=db.prepare(`SELECT p.id,p.body,p.category,p.status,p.scheduled_at,p.x_id,p.published_at,p.error,p.version,p.ai_generated,p.metrics,
    v.status AS delivery_status,v.checked_at AS verified_at,v.error AS verification_error,r.approved AS auto_approved,r.reasons AS editorial_reasons
    FROM posts p LEFT JOIN post_verifications v ON v.post_id=p.id LEFT JOIN editorial_reviews r ON r.post_id=p.id ORDER BY COALESCE(p.scheduled_at,p.created_at) DESC LIMIT 100`).all();
  const stamp=Date.parse(s.workerHeartbeat||'');
  return {configured:true,serverTime:nowISO(),paused:s.paused,autonomy:s.autonomy,autoGenerate:s.autoGenerate,
    timezone:s.timezone,slots:s.slots,worker:{heartbeat:s.workerHeartbeat||null,lastSweep:s.lastPublishSweep||null,healthy:Number.isFinite(stamp)&&Date.now()-stamp<120000},
    account:account?{username:account.user.username,id:account.user.id,verifiedAt:account.verified_at||null}:null,
    drafting:draftStatus(db),draftingConfigured:!!config.openaiKey||!!s.n8nDrafts,serviceUrl:config.appUrl,estimatedSpend:monthSpend(db),monthlyBudget:s.monthlyXBudget,
    posts:posts.map(p=>({...p,metrics:JSON.parse(p.metrics),editorial_reasons:p.editorial_reasons?JSON.parse(p.editorial_reasons):[],url:p.x_id?`https://x.com/dialedbyh/status/${p.x_id}`:null})),
    nextPost:db.prepare("SELECT id,scheduled_at FROM posts WHERE status='scheduled' ORDER BY scheduled_at LIMIT 1").get()||null,
    errors:db.prepare("SELECT type,message,created_at,post_id FROM events WHERE type IN ('error','editorial_hold') ORDER BY id DESC LIMIT 12").all(),
    events:db.prepare('SELECT type,message,created_at,post_id FROM events ORDER BY id DESC LIMIT 20').all(),
    leads:db.prepare('SELECT stage,COUNT(*) count FROM leads GROUP BY stage').all(),
    reddit:{status:'approval_required',connected:false,autonomous:false,reason:'Reddit API access and written approval for commercial use are required. No Reddit publishing is configured.'}};
}
export async function bridgeAction(db,x,config,input) {
  switch(input.action) {
    case 'status':return socialStatus(db,x,config);
    case 'connect': {
      if(!config.xClientId) throw new Error('Save the X app credentials in Connections first.');
      const ticket=randomBytes(32).toString('base64url');
      db.prepare('DELETE FROM admin_handoffs WHERE expires_at<?').run(Date.now());
      db.prepare('INSERT INTO admin_handoffs VALUES (?,?)').run(createHash('sha256').update(ticket).digest('hex'),Date.now()+60000);
      return {url:(config.connectUrl||config.appUrl+'/auth/x/admin?')+(config.connectUrl?'&':'')+'ticket='+ticket};
    }
    case 'verify-account':reserve(db,.01,'Admin account identity check');await x.ensureIdentity();return {ok:true};
    case 'pause':setSetting(db,'paused',true);event(db,'publishing','Publishing paused from website admin.');return {ok:true};
    case 'resume':
      if(!x.account()) throw new Error('Connect @dialedbyh first.');
      if(db.prepare("SELECT id FROM posts WHERE status='uncertain' LIMIT 1").get()) throw new Error('Resolve uncertain posts before resuming.');
      if(db.prepare("SELECT post_id FROM post_verifications WHERE status!='verified' LIMIT 1").get()) throw new Error('Verify outstanding deliveries before resuming.');
      reserve(db,.01,'Verify account before resuming');await x.ensureIdentity();setSetting(db,'paused',false);event(db,'publishing','Publishing resumed from website admin.');return {ok:true};
    case 'mode':
      if(!['review','autonomous'].includes(input.mode)) throw new Error('Choose review or autonomous mode.');
      if(input.mode==='autonomous'&&((!config.openaiKey&&!settings(db).n8nDrafts)||!x.account())) throw new Error('Connect X and the drafting API before enabling autonomy.');
      setSetting(db,'autonomy',input.mode);if(input.mode==='autonomous') setSetting(db,'autoGenerate',!settings(db).n8nDrafts);
      event(db,'settings',`Editorial mode changed to ${input.mode} from website admin. Publishing pause is unchanged.`);return {ok:true};
    case 'approve':approve(db,input.id,input.version);return {ok:true};
    case 'reject': {
      const p=db.prepare('SELECT * FROM posts WHERE id=?').get(input.id||'');
      if(!p||!['draft','scheduled','failed','expired'].includes(p.status)||p.version!==input.version) throw new Error('Draft changed or cannot be rejected. Reload it.');
      db.prepare("UPDATE posts SET status='rejected',reviewed_at=NULL,version=version+1,updated_at=? WHERE id=?").run(nowISO(),p.id);return {ok:true};
    }
    case 'edit': {
      const p=db.prepare('SELECT * FROM posts WHERE id=?').get(input.id||'');
      if(!p||!['draft','scheduled','failed','expired'].includes(p.status)||p.version!==input.version) throw new Error('Draft changed or cannot be edited. Reload it.');
      if(typeof input.body!=='string'||!input.body.trim()||input.body.length>4000) throw new Error('Provide post text.');
      if(!input.scheduledAt||!Number.isFinite(Date.parse(input.scheduledAt))) throw new Error('Choose a valid scheduled time.');
      // Human edits are never automatically reapproved; they return to manual review.
      db.prepare("UPDATE posts SET body=?,scheduled_at=?,status='draft',reviewed_at=NULL,error=NULL,version=version+1,updated_at=? WHERE id=?")
        .run(input.body.trim(),new Date(input.scheduledAt).toISOString(),nowISO(),p.id);
      db.prepare('INSERT OR REPLACE INTO editorial_reviews VALUES (?,?,?,0,?,?)').run(p.id,p.version+1,'human_edit',JSON.stringify(['Edited in admin; manual approval required.']),nowISO());
      return {ok:true,quality:quality(db,db.prepare('SELECT * FROM posts WHERE id=?').get(p.id))};
    }
    case 'recheck': {
      const p=db.prepare("SELECT * FROM post_verifications WHERE post_id=? AND status='unverified'").get(input.id||'');
      if(!p) throw new Error('No unverified delivery found.');
      db.prepare("UPDATE post_verifications SET status='pending',attempts=0,next_check=? WHERE post_id=?").run(nowISO(),input.id);return {ok:true};
    }
    default:throw new Error('Unknown social action.');
  }
}
