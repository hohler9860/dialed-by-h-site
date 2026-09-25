import twitterText from 'twitter-text';
import { DateTime } from 'luxon';
import { id, nowISO, settings, event } from './db.js';
export const categories=['Opinion','Buyer advice','Discovery','Dealer perspective','Sourcing'];
export function postLinks(text) { return twitterText.extractUrlsWithIndices(text); }
export function lengthOf(text) { return twitterText.parseTweet(text).weightedLength; }
export function words(text) { return new Set(text.toLowerCase().replace(/https?:\/\/\S+/g,'').match(/[\p{L}\p{N}]+/gu)||[]); }
export function similarity(a,b) {
  const x=words(a), y=words(b), intersection=[...x].filter(w=>y.has(w)).length;
  return intersection / Math.max(1,new Set([...x,...y]).size);
}
export function quality(db,post) {
  const errors=[],warnings=[],body=post.body.trim(),len=lengthOf(body);
  if(!body || len>280 || !twitterText.parseTweet(body).valid) errors.push(`Post must be valid X text, 1–280 weighted characters (${len} now).`);
  if(!categories.includes(post.category)) errors.push('Choose a content category.');
  if(/\{\{|\[insert|\[watch|\[price/i.test(body)) errors.push('Replace unfinished placeholders.');
  if(/guaranteed.{0,25}(return|profit|appreciat)|risk.free investment/i.test(body)) errors.push('Remove investment guarantees.');
  if(/@[a-zA-Z0-9_]+/.test(body)) errors.push('Automated mentions are disabled. Remove the @mention.');
  if(postLinks(body).length) errors.push('Links are disabled in posts. Remove the URL; use a natural reply or DM call to action instead.');
  const sources=JSON.parse(post.source_ids||'[]').map(sid=>db.prepare('SELECT * FROM sources WHERE id=?').get(sid)).filter(Boolean);
  if(post.factual && !sources.length) errors.push('Attach a source for factual claims.');
  if(post.factual && sources.some(s=>!s.verified)) errors.push('Verify the attached sources before approval.');
  if(/\$\s?\d|\b\d[\d,.]*\s?(USD|GBP|EUR)\b/i.test(body) && !sources.length) errors.push('Attach a dated source for price claims.');
  if(sources.some(s=>Date.now()-Date.parse(s.fetched_at)>7*86400000) && /\$|today|now|available|latest/i.test(body)) errors.push('Refresh time-sensitive sources older than seven days.');
  const others=db.prepare("SELECT id,body FROM posts WHERE id!=? AND status NOT IN ('rejected','expired') ORDER BY created_at DESC LIMIT 500").all(post.id||'');
  if(others.some(p=>similarity(p.body,body)>=0.82)) errors.push('Too similar to another queued or published post.');
  if(post.media_id) { const m=db.prepare('SELECT * FROM media WHERE id=?').get(post.media_id); if(!m?.rights||!m?.alt) errors.push('The image needs usage rights and alt text.'); }
  if(/🚀|game.changer|delve|timeless elegance|elevate your/i.test(body)) warnings.push('Consider a more specific, natural opening.');
  return {errors,warnings,length:len};
}
export function datesFor(day,config) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Use a date in YYYY-MM-DD format.');
  return config.slots.map(time=> {
    const dt=DateTime.fromISO(`${day}T${time}`,{zone:config.timezone});
    if(!dt.isValid || dt.toFormat('HH:mm')!==time) throw new Error('A selected time does not exist on this date in your timezone.');
    return dt.toUTC().toISO({suppressMilliseconds:false});
  });
}
export function createPost(db,input) {
  const postId=id(),now=nowISO();
  if(typeof input.body!=='string' || input.body.length>4000) throw new Error('Post text is required and must be under 4,000 characters.');
  if(!categories.includes(input.category)) throw new Error('Choose a valid content category.');
  const sourceIds=input.sourceIds||[];
  if(!Array.isArray(sourceIds)||sourceIds.length>5||sourceIds.some(s=>typeof s!=='string'||!db.prepare('SELECT id FROM sources WHERE id=?').get(s))) throw new Error('Invalid sources.');
  if(input.scheduledAt && !Number.isFinite(Date.parse(input.scheduledAt))) throw new Error('Invalid schedule.');
  if(input.mediaId && !db.prepare('SELECT id FROM media WHERE id=?').get(input.mediaId)) throw new Error('Unknown image.');
  db.prepare(`INSERT INTO posts(id,body,category,scheduled_at,created_at,updated_at,source_ids,editorial_note,ai_generated,factual,batch_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(postId,input.body.trim(),input.category,input.scheduledAt?new Date(input.scheduledAt).toISOString():null,now,now,JSON.stringify(sourceIds),String(input.note||'').slice(0,3000),input.ai?1:0,input.factual?1:0,input.batchDate||null);
  if(input.mediaId) db.prepare('UPDATE posts SET media_id=? WHERE id=?').run(input.mediaId,postId);
  return db.prepare('SELECT * FROM posts WHERE id=?').get(postId);
}
export function approve(db,postId,version) {
  const p=db.prepare('SELECT * FROM posts WHERE id=?').get(postId);
  if(!p || !['draft','failed','expired'].includes(p.status)) throw new Error('Only a draft, failed or expired post can be approved.');
  if(p.version!==version) throw new Error('This draft changed. Reload and review the latest version.');
  const q=quality(db,p); if(q.errors.length) throw new Error(q.errors.join(' '));
  if(!p.scheduled_at || Date.parse(p.scheduled_at)<Date.now()+60000) throw new Error('Choose a posting time at least one minute ahead.');
  const s=settings(db),date=DateTime.fromISO(p.scheduled_at).setZone(s.timezone).toISODate();
  const occupied=db.prepare("SELECT * FROM posts WHERE status IN ('scheduled','publishing','posted','uncertain') AND id!=?").all(p.id);
  if(occupied.filter(x=>DateTime.fromISO(x.scheduled_at||x.published_at).setZone(s.timezone).toISODate()===date).length>=s.dailyMax) throw new Error('This day already has five posts. Choose another day.');
  if(occupied.some(x=>Math.abs(Date.parse(x.scheduled_at||x.published_at)-Date.parse(p.scheduled_at))<75*60000)) throw new Error('Leave at least 75 minutes between posts.');
  db.prepare("UPDATE posts SET status='scheduled',reviewed_at=?,updated_at=?,error=NULL,version=version+1 WHERE id=?").run(nowISO(),nowISO(),p.id);
  event(db,'approved','Draft approved and scheduled.',p.id);
}
export function seedDrafts(db) {
  if(db.prepare('SELECT COUNT(*) AS n FROM posts').get().n) return;
  const day=DateTime.now().setZone(settings(db).timezone).plus({days:1}).toISODate();
  const drafts=[
    ['Opinion','A watch can be the right size on paper and still feel wrong on your wrist. I’d rather try it on than argue about the case diameter. What’s a watch that surprised you in person?'],
    ['Buyer advice','Buying your first serious watch? Start with where you’ll wear it. Office, weekends, travel, or every day. That answer makes a shortlist much more useful than “what’s the best watch?”'],
    ['Discovery','Which watch has the best detail that nobody notices in photos? A case shape, a bracelet taper, a tiny bit of dial texture. I want the details that made you stop scrolling once you saw it in person.'],
    ['Dealer perspective','My ideal watch shortlist has three options and a reason for each. One safe choice, one that reflects your taste, and one you hadn’t considered. Which one do you usually end up buying?'],
    ['Sourcing','Looking for a watch and tired of scrolling listings? Tell me the model or style, your budget, and when you’d like it. I help buyers narrow the search and source the right piece. Details in my profile.']
  ];
  drafts.forEach(([category,body],i)=>createPost(db,{category,body,scheduledAt:datesFor(day,settings(db))[i],batchDate:day,note:'Starter draft for your review. Confirm this wording reflects your own view and service.'}));
}
