const { test } = require('node:test');
const assert = require('node:assert/strict');
const { journalImage } = require('../lib/journal-image');
test('opening cover takes precedence over gallery images',()=>assert.equal(journalImage({hero_image_url:'https://example.com/cover.jpg',content_html:'<img src="https://example.com/gallery.jpg">'}),'https://example.com/cover.jpg'));
test('legacy inline images fall back safely and decode entities',()=>assert.equal(journalImage({content_html:'<p>Intro</p><img src="https://example.com/a.jpg?x=1&amp;y=2">'}),'https://example.com/a.jpg?x=1&y=2'));
test('missing or unsafe images keep text-only layout',()=>{assert.equal(journalImage({}),null);assert.equal(journalImage({hero_image_url:'javascript:alert(1)'}),null);assert.equal(journalImage({hero_image_url:'//evil.test/a'}),null)});
test('list exposes cover fallback but does not expose article bodies',async()=>{
 const original=global.fetch;global.fetch=async()=>({ok:true,json:async()=>[{slug:'story',content_html:'<img src="https://example.com/first.jpg">'}]});
 try {let body;const res={setHeader(){},status(){return this},json(x){body=x}};await require('../api/journal-list')({method:'GET',headers:{},query:{}},res);assert.equal(body.articles[0].hero_image_url,'https://example.com/first.jpg');assert.equal('content_html' in body.articles[0],false);}finally{global.fetch=original}
});
