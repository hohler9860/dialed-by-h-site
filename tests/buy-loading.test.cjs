const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = process.env.DBH_QA_ROOT || path.join(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'assets/buy.js'), 'utf8');
const loader = script.slice(script.indexOf('  // Preload close'), script.indexOf('  // Search box.'));
function fixture() {
  const timers = new Map(), frames = [], cards = []; let next = 0;
  const ctx = vm.createContext({
    window: { innerHeight: 800, matchMedia: () => ({matches:false}), addEventListener() {} },
    grid: {querySelectorAll: () => cards},
    document: {createElement: () => ({})},
    setTimeout(fn) {timers.set(++next, fn);return next;}, clearTimeout(id) {timers.delete(id);},
    requestAnimationFrame(fn) {frames.push(fn);return frames.length;}, cancelAnimationFrame() {},
    IntersectionObserver: class {observe() {} unobserve() {} disconnect() {}},
  });
  vm.runInContext(loader + '\nthis.api={requestImage,resetCardLoading,scheduleReveal,add:job=>imageJobs.push(job),active:()=>activeImages,motion:reducedMotion};', ctx);
  function card(top=100,left=0) {
    const classes=new Set();
    const c={offsetTop:top,offsetLeft:left,isConnected:true,_dbhVisible:true,style:{},classList:{add:x=>classes.add(x),contains:x=>classes.has(x)},getBoundingClientRect:()=>({top:c.offsetTop,bottom:c.offsetTop+200})};
    const im={dataset:{src:'/thumb.webp',srcset:'/thumb.webp 300w, /medium.webp 600w',full:'/full.webp'},naturalWidth:300,attributes:{},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];if(k==='src')this.src='';},replaceWith(ph){this.placeholder=ph;},decode:()=>Promise.resolve()};
    c._dbhImage={card:c,image:im,generation:0}; cards.push(c);ctx.api.add(c._dbhImage);return {c,im};
  }
  function flush(){while(frames.length)frames.shift()();}
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  return {api:ctx.api,card,flush,tick,timers,cards};
}
test('only four image requests run; one completion opens one queue slot',async()=>{
  const f=fixture(), cs=Array.from({length:10},()=>f.card());cs.forEach(x=>f.api.requestImage(x.c));
  assert.equal(f.api.active(),4);assert.equal(cs.filter(x=>x.c._dbhImage.started).length,4);
  cs[0].im.onload();await f.tick();assert.equal(f.api.active(),4);assert.equal(cs.filter(x=>x.c._dbhImage.started).length,5);
});
test('row waits for decoding, then uses actual left-to-right positions',async()=>{
  const f=fixture(), cs=[f.card(100,200),f.card(100,0),f.card(100,400)];
  cs.forEach(x=>f.api.requestImage(x.c));cs[0].im.onload();cs[2].im.onload();await f.tick();f.flush();
  assert.ok(cs.every(x=>!x.c.classList.contains('is-in')));
  cs[1].im.onload();await f.tick();f.flush();
  assert.deepEqual(cs.map(x=>x.c.style.transitionDelay),['70ms','0ms','140ms']);
  assert.ok(cs.every(x=>x.c.classList.contains('is-in')));
});
test('responsive image failure tries full-size once then displays a fallback',()=>{
  const f=fixture(),x=f.card();f.api.requestImage(x.c);x.im.onerror();
  assert.equal(x.im.src,'/full.webp');assert.equal(x.im.attributes.srcset,undefined);assert.equal(f.api.active(),1);
  x.im.onerror();f.flush();assert.equal(x.im.placeholder.textContent,'Image unavailable');assert.equal(f.api.active(),0);assert.ok(x.c.classList.contains('is-in'));
});
test('a stalled request and stalled fallback both time out',()=>{
  const f=fixture(),x=f.card();f.api.requestImage(x.c);[...f.timers.values()][0]();
  assert.equal(x.im.src,'/full.webp');[...f.timers.values()][0]();
  assert.equal(f.api.active(),0);assert.equal(x.im.placeholder.textContent,'Image unavailable');
});
test('filter reset cancels active/queued work and ignores a late decode',async()=>{
  const f=fixture(),cs=Array.from({length:6},()=>f.card());cs.forEach(x=>f.api.requestImage(x.c));
  cs[0].im.onload();f.api.resetCardLoading();await f.tick();
  assert.equal(f.api.active(),0);assert.equal(f.timers.size,0);assert.ok(cs.every(x=>!x.c.classList.contains('is-image-ready')));
  assert.ok(cs.slice(4).every(x=>!x.c._dbhImage.started));
});
test('fast scrolling drops queued requests that are far from the viewport',async()=>{
  const f=fixture(),cs=Array.from({length:6},()=>f.card());cs.forEach(x=>f.api.requestImage(x.c));
  cs[4].c.offsetTop=-3000;cs[5].c.offsetTop=4000;cs[0].im.onload();await f.tick();
  assert.equal(f.api.active(),3);assert.ok(cs.slice(4).every(x=>!x.c._dbhImage.queued&&!x.c._dbhImage.started));
});
test('reduced motion removes the stagger',async()=>{
  const f=fixture(),cs=[f.card(100,0),f.card(100,200)];f.api.motion.matches=true;
  cs.forEach(x=>{f.api.requestImage(x.c);x.im.onload();});await f.tick();f.flush();
  assert.deepEqual(cs.map(x=>x.c.style.transitionDelay),['0ms','0ms']);
});
