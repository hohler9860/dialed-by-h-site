import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeHTML } from 'entities';
import { encrypt, decrypt, equal } from './security.js';
import { nowISO, event, settings, setSetting } from './db.js';

export class XError extends Error {
  constructor(status,retryAt) {super(`X returned HTTP ${status}. ${status===401?'Reconnect the X account.':status===429?'Rate limit reached.':status===402?'Check X API credits.':'Check X app permissions and account access.'}`);this.status=status;this.retryAt=retryAt;}
}
export class XClient {
  constructor(db,config,fetcher=fetch) {this.db=db;this.config=config;this.fetch=fetcher;this.refreshPromise=null;}
  account() {const row=this.db.prepare("SELECT encrypted FROM credentials WHERE name='x'").get();return row?decrypt(row.encrypted,this.config.secret):null;}
  save(value) {this.db.prepare("INSERT OR REPLACE INTO credentials VALUES ('x',?)").run(encrypt(value,this.config.secret));}
  authorize(session) {
    if(!this.config.xClientId) throw new Error('Set X_CLIENT_ID and X_CLIENT_SECRET in the server environment first.');
    const state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');
    this.db.prepare('DELETE FROM oauth WHERE expires_at<?').run(Date.now());
    this.db.prepare('INSERT INTO oauth VALUES (?,?,?,?)').run(state,encrypt(verifier,this.config.secret),session,Date.now()+10*60000);
    const params=new URLSearchParams({response_type:'code',client_id:this.config.xClientId,redirect_uri:this.config.callbackUrl||this.config.appUrl+'/auth/x/callback',
      scope:'tweet.read tweet.write users.read offline.access media.write',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
    return 'https://x.com/i/oauth2/authorize?'+params;
  }
  async tokenRequest(params) {
    const headers={'Content-Type':'application/x-www-form-urlencoded'};
    if(this.config.xClientSecret) headers.Authorization='Basic '+Buffer.from(`${this.config.xClientId}:${this.config.xClientSecret}`).toString('base64');
    else params.client_id=this.config.xClientId;
    const r=await this.fetch('https://api.x.com/2/oauth2/token',{method:'POST',headers,body:new URLSearchParams(params),signal:AbortSignal.timeout(20000)});
    if(!r.ok) throw new XError(r.status);
    const token=await r.json();
    if(!token.access_token) throw new Error('X did not issue an access token.');
    return {...token,expires_at:Date.now()+(token.expires_in||7200)*1000};
  }
  async callback(code,state,session) {
    const row=this.db.prepare('SELECT * FROM oauth WHERE state=?').get(state||'');
    if(!row||row.expires_at<Date.now()||!equal(row.session,session)) throw new Error('X connection expired or belongs to another session. Start again.');
    this.db.prepare('DELETE FROM oauth WHERE state=?').run(state);
    const token=await this.tokenRequest({grant_type:'authorization_code',code,redirect_uri:this.config.callbackUrl||this.config.appUrl+'/auth/x/callback',code_verifier:decrypt(row.verifier,this.config.secret)});
    const r=await this.fetch('https://api.x.com/2/users/me',{headers:{Authorization:`Bearer ${token.access_token}`},signal:AbortSignal.timeout(15000)});
    if(!r.ok) throw new XError(r.status);
    const {data}=await r.json();
    if(!data?.id || data.username.toLowerCase()!==settings(this.db).handle.toLowerCase()) throw new Error(`Connect @${settings(this.db).handle}; a different account was returned.`);
    const pinned=settings(this.db).xAccountId;
    if(pinned && pinned!==data.id) throw new Error('This is a different X account ID. Reconnect the originally linked account.');
    setSetting(this.db,'xAccountId',data.id);
    this.save({...token,user:data,verified_at:nowISO()});event(this.db,'account',`Connected @${data.username}. Publishing remains under your queue controls.`);
    return data;
  }
  async accessToken() {
    let account=this.account();if(!account) throw new Error('Connect @dialedbyh before publishing.');
    if(account.expires_at>Date.now()+60000) return account.access_token;
    if(!account.refresh_token) throw new Error('X connection expired. Reconnect with offline access.');
    if(!this.refreshPromise) this.refreshPromise=(async()=> {
      const fresh=await this.tokenRequest({grant_type:'refresh_token',refresh_token:account.refresh_token});
      account={...account,...fresh,refresh_token:fresh.refresh_token||account.refresh_token};this.save(account);return account.access_token;
    })().finally(()=>{this.refreshPromise=null;});
    return this.refreshPromise;
  }
  async request(path,options={},retryAuth=true) {
    const token=await this.accessToken();
    const r=await this.fetch('https://api.x.com/2'+path,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(25000)});
    if(r.status===401 && retryAuth) {const account=this.account();this.save({...account,expires_at:0});return this.request(path,options,false);}
    if(!r.ok) {
      const reset=Number(r.headers.get('x-rate-limit-reset'))*1000;
      const retrySeconds=Number(r.headers.get('retry-after'));
      throw new XError(r.status,Math.max(Date.now()+60000,reset||0,Date.now()+(retrySeconds||60)*1000));
    }
    if(r.status===204) return {};
    return r.json();
  }
  async upload(media) {
    const image=this.config.readMedia?await this.config.readMedia(media):readFileSync(join(this.config.dataDir,'media',media.filename));
    const response=await this.request('/media/upload',{method:'POST',body:JSON.stringify({media:image.toString('base64'),media_category:'tweet_image'})});
    if(!response.data?.id) throw new Error('X did not return a media ID.');
    if(response.data.processing_info && response.data.processing_info.state!=='succeeded') throw new Error('X image processing is not complete. Review and reschedule the post.');
    const metadata=await this.request('/media/metadata',{method:'POST',body:JSON.stringify({id:response.data.id,metadata:{alt_text:{text:media.alt}}})});
    if(metadata.errors?.length) throw new Error('X rejected the image metadata. Review the image before rescheduling.');
    return response.data.id;
  }
  async ensureIdentity() {
    const result=await this.request('/users/me');
    const account=this.account(),expected=settings(this.db).xAccountId||account?.user?.id;
    if(!expected || result.data?.id!==expected || result.data?.username?.toLowerCase()!==settings(this.db).handle.toLowerCase()) {
      setSetting(this.db,'paused',true);throw new Error('X account identity mismatch. Publishing paused.');
    }
    setSetting(this.db,'xAccountId',expected);
    this.save({...this.account(),user:result.data,verified_at:nowISO()});
    return result.data;
  }
  async verifyPost(post,expectedAuthor) {
    const result=await this.request(`/tweets/${post.x_id}?tweet.fields=author_id,created_at,entities`);
    if(result.data?.id!==post.x_id || result.data?.author_id!==expectedAuthor) throw new Error('Post ID or author could not be verified.');
    // X rewrites URLs to t.co. Expand them before comparing the submitted text.
    let returned=result.data.text||'';
    for(const link of result.data.entities?.urls||[]) {
      const expanded=link.expanded_url||link.url;
      const attachment=post.media_id && new RegExp('^https://(?:x|twitter)\\.com/[^/]+/status/'+post.x_id+'/photo/\\d+$').test(expanded) && !post.body.includes(expanded);
      returned=returned.replaceAll(link.url,attachment?'':expanded);
    }
    const canonical=text=>decodeHTML(text).replace(/https?:\/\/\S+/g,url=>url.replace(/\/$/, '')).replace(/\s+/g,' ').trim();
    if(canonical(returned)!==canonical(post.body)) throw new Error('Published text differs from the scheduled draft. Review the live post.');
    return result.data;
  }
  async publish(post,mediaId) {
    if(this.config.beforePublish) await this.config.beforePublish();
    const payload={text:post.body};
    if(post.ai_generated) payload.made_with_ai=true;
    if(mediaId) payload.media={media_ids:[mediaId]};
    const result=await this.request('/tweets',{method:'POST',body:JSON.stringify(payload)},false);
    if(!/^\d+$/.test(result.data?.id||'')) throw new Error('X response did not confirm a post ID. Verify the account before retrying.');
    return result.data.id;
  }
  async metrics(posts) {
    if(!posts.length) return [];
    const result=await this.request(`/tweets?ids=${posts.map(p=>p.x_id).join(',')}&tweet.fields=public_metrics,created_at`);
    return result.data||[];
  }
}
