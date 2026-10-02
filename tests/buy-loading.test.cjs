const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = process.env.DBH_QA_ROOT || path.join(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'assets/buy.js'), 'utf8');
const loader = script.slice(script.indexOf('  // Preload close'), script.indexOf('  // Search box.'));
function fixture() {
  const timers=new Map(),frames=[],cards=[];let next=0;
  const ctx=vm.createContext({window:{innerHeight:800,matchMedia:()=>({matches:false}),addEventListener(){}},grid:{querySelectorAll:()=>cards},document:{createElement:()=>({addEventListener(k,fn){this[k]=fn;},remove(){this.removed=true;}})},setTimeout(fn,ms){timers.set(++next,{fn,ms});return next;},clearTimeout(id){timers.delete(id);},requestAnimationFrame(fn){frames.push(fn);return frames.length;},cancelAnimationFrame(){},IntersectionObserver:class{observe(){}unobserve(){}disconnect(){}}});
  vm.runInContext(loader+'\nthis.api={requestImage,resetCardLoading,scheduleReveal,add:job=>imageJobs.push(job),active:()=>activeImages,motion:reducedMotion};',ctx);
  function card(top=100,left=0){
    const classes=new Set();const c={offsetTop:top,offsetLeft:left,isConnected:true,_dbhVisible:true,style:{setProperty(k,v){this[k]=v;}},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},getBoundingClientRect:()=>({top:c.offsetTop,bottom:c.offsetTop+200}),appendChild(el){this.retry=el;}};
    const im={dataset:{src:'/thumb.webp',srcset:'/thumb.webp 300w, /medium.webp 600w',full:'/full.webp'},naturalWidth:300,attributes:{},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];if(k==='src')this.src='';},decode:()=>Promise.resolve()};
    c._dbhImage={card:c,image:im,generation:0};cards.push(c);ctx.api.add(c._dbhImage);return {c,im};
  }
  function flush(){while(frames.length)frames.shift()();}
  function fire(ms){const entry=[...timers].find(([,v])=>v.ms===ms);assert.ok(entry,'expected timer '+ms);timers.delete(entry[0]);entry[1].fn();}
  return {api:ctx.api,card,flush,fire,tick:()=>new Promise(r=>setImmediate(r)),timers,cards};
}
test('six requests maximum, and a completion opens one slot',async()=>{const f=fixture(),cs=Array.from({length:10},()=>f.card());cs.forEach(x=>f.api.requestImage(x.c));assert.equal(f.api.active(),6);cs[0].im.onload();await f.tick();assert.equal(f.api.active(),6);assert.equal(cs.filter(x=>x.c._dbhImage.started).length,6);});
test('slow neighbor does not hide ready photos; column order stays responsive',async()=>{const f=fixture(),cs=[f.card(100,200),f.card(100,0),f.card(100,400)];cs.forEach(x=>f.api.requestImage(x.c));cs[0].im.onload();cs[2].im.onload();await f.tick();f.flush();assert.ok(cs[0].c.classList.contains('is-in'));assert.ok(!cs[1].c.classList.contains('is-in'));assert.deepEqual(cs.map(x=>x.c.style['--image-delay']),['70ms',undefined,'140ms']);cs[1].im.onload();await f.tick();f.flush();assert.equal(cs[1].c.style['--image-delay'],'0ms');});
test('temporary failure releases its slot, waits, and recovers using full photo',async()=>{const f=fixture(),x=f.card();f.api.requestImage(x.c);x.im.onerror();assert.equal(f.api.active(),0);assert.equal(x.c.retry,undefined);f.fire(800);assert.equal(x.im.src,'/full.webp');assert.equal(x.im.attributes.srcset,undefined);x.im.onload();await f.tick();assert.ok(x.c.classList.contains('is-image-ready'));});
test('successful photo is preserved when decode rejects',async()=>{const f=fixture(),x=f.card();x.im.decode=()=>Promise.reject(new Error('source changed'));f.api.requestImage(x.c);x.im.onload();await f.tick();assert.ok(x.c.classList.contains('is-image-ready'));assert.equal(x.im.src,'/thumb.webp');assert.equal(f.timers.size,0);});
test('slow request is allowed twenty seconds and stays recoverable after timeout',()=>{const f=fixture(),x=f.card();f.api.requestImage(x.c);assert.ok([...f.timers.values()].every(t=>t.ms===20000));f.fire(20000);assert.equal(f.api.active(),0);assert.equal(x.c.retry,undefined);f.fire(800);assert.equal(x.im.src,'/full.webp');});
test('repeated failures offer an actionable retry, preserving the original image',()=>{const f=fixture(),x=f.card();f.api.requestImage(x.c);for(const ms of [800,2000,4000]){x.im.onerror();f.fire(ms);}assert.equal(x.im.src,'/full.webp?retry=3');x.im.onerror();assert.equal(x.c.retry.textContent,'Retry photo');assert.equal(f.api.active(),0);x.c.retry.click({preventDefault(){},stopPropagation(){}});assert.equal(f.api.active(),1);assert.equal(x.im.src,'/thumb.webp');});
test('filter reset cancels delayed retries and in-flight decode',async()=>{const f=fixture(),cs=[f.card(),f.card()];cs.forEach(x=>f.api.requestImage(x.c));cs[0].im.onerror();cs[1].im.onload();f.api.resetCardLoading();await f.tick();assert.equal(f.api.active(),0);assert.equal(f.timers.size,0);assert.ok(cs.every(x=>!x.c.classList.contains('is-image-ready')));});
test('fast scrolling drops far-away queued work',async()=>{const f=fixture(),cs=Array.from({length:8},()=>f.card());cs.forEach(x=>f.api.requestImage(x.c));cs[6].c.offsetTop=-3000;cs[7].c.offsetTop=4000;cs[0].im.onload();await f.tick();assert.equal(f.api.active(),5);assert.ok(cs.slice(6).every(x=>!x.c._dbhImage.queued&&!x.c._dbhImage.started));});
test('reduced motion disables image stagger',async()=>{const f=fixture(),cs=[f.card(100,0),f.card(100,200)];f.api.motion.matches=true;cs.forEach(x=>{f.api.requestImage(x.c);x.im.onload();});await f.tick();f.flush();assert.deepEqual(cs.map(x=>x.c.style['--image-delay']),['0ms','0ms']);});
test('card layout is visible while an image is pending',()=>{const html=fs.readFileSync(path.join(root,'buy/index.html'),'utf8');assert.match(html,/\.pt-reveal\{[^}]*opacity:1/);assert.match(html,/\.pt-reveal \.pt-item__media img\{opacity:0/);assert.match(html,/\.pt-reveal\.is-in \.pt-item__media img\{opacity:1/);});
