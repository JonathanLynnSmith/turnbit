const test=require('node:test');const assert=require('node:assert/strict');const {LikedSongsCache}=require('../renderer/library-cache');
const song=id=>({added_at:'2026-10-01T00:00:00Z',track:{uri:'spotify:track:'+id.repeat(22),name:id}});
const page=(ids,total=ids.length,next=null)=>({items:ids.map(song),total,next});
test('an unchanged first page keeps loaded pages and reports no change',()=>{
 let now=0;const cache=new LikedSongsCache({now:()=>now});
 assert.equal(cache.applyFirstPage(page(['a','b'],4,'more')),true);cache.appendPage(2,page(['c','d'],4));
 now=40000;assert.equal(cache.isFresh(),false);
 assert.equal(cache.applyFirstPage(page(['a','b'],4,'more')),false);assert.equal(cache.snapshot().items.length,4);assert.equal(cache.isFresh(),true);
});
test('a song liked elsewhere replaces the first page and drops shifted later pages',()=>{
 const cache=new LikedSongsCache();cache.applyFirstPage(page(['a','b'],4,'more'));cache.appendPage(2,page(['c','d'],4));
 assert.equal(cache.applyFirstPage(page(['n','a'],5,'more')),true);
 assert.deepEqual(cache.snapshot().items.map(e=>e.track.name),['n','a']);assert.equal(cache.snapshot().next,true);assert.equal(cache.snapshot().total,5);
});
test('reopening within 30 seconds is fresh',()=>{
 let now=1000;const cache=new LikedSongsCache({now:()=>now});assert.equal(cache.isFresh(),false);
 cache.applyFirstPage(page(['a']));now+=29000;assert.equal(cache.isFresh(),true);now+=2000;assert.equal(cache.isFresh(),false);
});
test('likes and unlikes update the cache without a request',()=>{
 const cache=new LikedSongsCache();assert.equal(cache.setLiked(song('x').track,true),false);
 cache.applyFirstPage(page(['a','b']));
 assert.equal(cache.setLiked(song('x').track,true),true);assert.deepEqual(cache.snapshot().items.map(e=>e.track.name),['x','a','b']);assert.equal(cache.snapshot().total,3);
 assert.equal(cache.setLiked(song('x').track,true),false);
 assert.equal(cache.setLiked(song('a').track,false),true);assert.deepEqual(cache.snapshot().items.map(e=>e.track.name),['x','b']);
 assert.equal(cache.setLiked(song('z').track,false),false);
});
test('Load more only appends the page that follows the cached items',()=>{
 const cache=new LikedSongsCache();cache.applyFirstPage(page(['a','b'],6,'more'));
 cache.appendPage(5,page(['q']));assert.equal(cache.snapshot().items.length,2);
 cache.appendPage(2,page(['c','d'],6,'more'));assert.equal(cache.snapshot().items.length,4);assert.equal(cache.snapshot().next,true);
});
