import {createHash,timingSafeEqual} from 'node:crypto';
export class Store {
  constructor(env=process.env,fetcher=fetch){
    this.url=(env.SUPABASE_URL||'https://untnrofsnmoyxdidxbdj.supabase.co').replace(/\/$/,'');
    this.key=env.SUPABASE_SERVICE_ROLE_KEY;this.fetch=fetcher;
    if(!this.key)throw new Error('Website database connection is not configured.');
  }
  async request(path,options={}){
    const {timeoutMs=6000,...requestOptions}=options;
    const r=await this.fetch(this.url+path,{...requestOptions,signal:AbortSignal.timeout(timeoutMs),headers:{apikey:this.key,Authorization:'Bearer '+this.key,'Content-Type':'application/json',...options.headers}});
    if(!r.ok){const info=await r.json().catch(()=>({}));if(info.code==='42P01'||info.code==='PGRST205'||info.code==='PGRST202')throw Object.assign(new Error('Publishing database setup is not installed yet.'),{setup:true});throw new Error('Publishing storage request failed ('+r.status+').');}
    return r.status===204?null:r.json();
  }
  async rpc(name,args){return this.request('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(args)});}
  async read(full=false){const fields='id,paused,control_version,lease_owner,lease_until,next_run_at,scheduler_heartbeat,last_run_at,scheduler_secret_hash'+(full?',state':'');const rows=await this.request('/rest/v1/social_publisher_runtime?id=eq.1&select='+fields);if(!rows?.[0])throw Object.assign(new Error('Publishing database has not been initialized.'),{setup:true});return rows[0];}
  claim(owner){return this.rpc('social_runtime_claim',{p_owner:owner});}
  save(owner,state,nextRun,pause,controlVersion){return this.rpc('social_runtime_save',{p_owner:owner,p_state:state,p_next_run:nextRun,p_pause:pause,p_control_version:controlVersion});}
  release(owner){return this.request('/rest/v1/rpc/social_runtime_release',{method:'POST',body:JSON.stringify({p_owner:owner}),timeoutMs:2000});}
  pause(){return this.rpc('social_runtime_pause',{});}
  heartbeat(){return this.rpc('social_runtime_heartbeat',{});}
  async upload(media,data){
    const path='/storage/v1/object/social-publisher-media/'+encodeURIComponent(media.filename);
    const r=await this.fetch(this.url+path,{method:'POST',signal:AbortSignal.timeout(15000),headers:{apikey:this.key,Authorization:'Bearer '+this.key,'Content-Type':media.mime,'x-upsert':'true'},body:data});
    if(!r.ok)throw new Error('Image could not be stored. No draft was published.');
  }
  async media(media){
    const r=await this.fetch(this.url+'/storage/v1/object/social-publisher-media/'+encodeURIComponent(media.filename),{headers:{apikey:this.key,Authorization:'Bearer '+this.key},signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw new Error('Stored image could not be read.');return Buffer.from(await r.arrayBuffer());
  }
}
export function cronAuthorized(header,hash){
  if(typeof header!=='string'||!header.startsWith('Bearer ')||!hash)return false;
  const actual=createHash('sha256').update(header.slice(7)).digest('hex');
  return actual.length===hash.length&&timingSafeEqual(Buffer.from(actual),Buffer.from(hash));
}
