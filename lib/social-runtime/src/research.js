import https from 'node:https';
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { decodeHTML } from 'entities';
import { safeUrl } from './security.js';
import { id, nowISO, event } from './db.js';

export function publicAddress(address) { try { return ipaddr.process(address).range()==='unicast'; } catch { return false; } }
export async function fetchPublic(url, redirects=0, options={}) {
  const u=new URL(safeUrl(url));
  if(u.port && u.port!=='443') throw new Error('Feeds must use the standard HTTPS port.');
  const addresses=await lookup(u.hostname,{all:true});
  if(!addresses.length || addresses.some(x=>!publicAddress(x.address))) throw new Error('Private network addresses are not allowed.');
  const pinned=addresses[0];
  return new Promise((resolve,reject)=> {
    const req=https.get(u,{signal:options.signal,headers:{'User-Agent':'DialedContentDesk/1.0 (+https://www.dialedbyhenry.com)','Accept':'application/rss+xml, application/atom+xml, application/xml, text/xml'},
      lookup:(_host,opts,cb)=>opts.all?cb(null,[pinned]):cb(null,pinned.address,pinned.family)},res=> {
      if(res.statusCode>=300 && res.statusCode<400) {
        res.resume(); if(redirects>=3) return reject(new Error('Too many feed redirects.'));
        return fetchPublic(new URL(res.headers.location,u).href,redirects+1,options).then(resolve,reject);
      }
      if(res.statusCode!==200) {res.resume(); return reject(new Error(`Feed returned HTTP ${res.statusCode}.`));}
      let bytes=0; const chunks=[];
      res.on('data',chunk=>{bytes+=chunk.length;if(bytes>2*1024*1024) req.destroy(new Error('Feed exceeds 2 MB.'));else chunks.push(chunk);});
      res.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8'))); res.on('error',reject);
    });
    req.setTimeout(15000,()=>req.destroy(new Error('Feed request timed out.')));
    const timer=setTimeout(()=>req.destroy(new Error('Feed request exceeded 20 seconds.')),20000);
    req.on('close',()=>clearTimeout(timer)); req.on('error',reject);
  });
}
const plain=x=>decodeHTML(String(typeof x==='object'?x?.['#text']||'':x||'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
export function parseFeed(xml) {
  if(/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('DTD/entity declarations are not supported.');
  if(XMLValidator.validate(xml)!==true) throw new Error('The feed is not valid XML.');
  const data=new XMLParser({ignoreAttributes:false,processEntities:false}).parse(xml);
  const entries=data.rss?.channel?.item || data.feed?.entry || [];
  return (Array.isArray(entries)?entries:[entries]).slice(0,25).map(entry=> {
    const links=Array.isArray(entry.link)?entry.link:[entry.link];
    const link=links.find(x=>typeof x==='string'||!x?.['@_rel']||x['@_rel']==='alternate');
    let url; try {url=safeUrl(typeof link==='string'?link:link?.['@_href']);} catch {return null;}
    const stamp=entry.pubDate||entry.published||entry.updated;
    return {title:plain(entry.title).slice(0,300),url,excerpt:plain(entry.description||entry.summary||entry.content||entry['content:encoded']).slice(0,1200),
      publishedAt:Number.isFinite(Date.parse(stamp))?new Date(stamp).toISOString():null};
  }).filter(x=>x?.title);
}
export async function refreshFeeds(db,fetcher=fetchPublic,options={}) {
  let added=0; const errors=[];
  for(const feed of db.prepare('SELECT * FROM feeds WHERE enabled=1 ORDER BY COALESCE(checked_at,\'\') LIMIT ?').all(options.limit||100)) {
    try {
      for(const item of parseFeed(await fetcher(feed.url))) {
        added+=db.prepare("INSERT OR IGNORE INTO sources(id,title,url,excerpt,kind,published_at,fetched_at) VALUES (?,?,?,?,?,?,?)")
          .run(id(),item.title,item.url,item.excerpt,'feed',item.publishedAt,nowISO()).changes;
      }
      db.prepare('UPDATE feeds SET checked_at=?,error=NULL WHERE id=?').run(nowISO(),feed.id);
    } catch(e) { const message=String(e.message).slice(0,300); errors.push(`${feed.name}: ${message}`); db.prepare('UPDATE feeds SET checked_at=?,error=? WHERE id=?').run(nowISO(),message,feed.id); }
  }
  event(db,errors.length?'warning':'research',`Research refresh: ${added} new items${errors.length?'; '+errors.join(' | '):'.'}`);
  return {added,errors};
}
