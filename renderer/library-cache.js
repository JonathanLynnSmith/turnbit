// Liked Songs shown instantly from memory, refreshed from Spotify in the background.
// Reopening within `fresh` ms skips the refresh; likes made in turnbit update the list without a request.
class LikedSongsCache {
  constructor({fresh=30000,now=()=>Date.now()}={}) { Object.assign(this,{fresh,now}); this.clear(); }
  clear() { this.items=null;this.next=false;this.total=0;this.fetchedAt=0; }
  snapshot() { return this.items?{items:this.items.slice(),next:this.next,total:this.total}:null; }
  isFresh() { return !!this.items&&this.now()-this.fetchedAt<this.fresh; }
  // Returns true when the first page differs from what was cached. Later pages are dropped then,
  // because a new like shifts every position after it.
  applyFirstPage(data) {
    const items=data?.items||[],uri=entry=>(entry?.track||entry?.item)?.uri;
    const same=!!this.items&&this.total===data?.total&&items.length<=this.items.length&&items.every((entry,i)=>uri(entry)===uri(this.items[i]));
    this.fetchedAt=this.now();
    if(same)return false;
    this.items=items.slice();this.next=!!data?.next;this.total=data?.total??items.length;return true;
  }
  appendPage(offset,data) {
    if(!this.items||offset!==this.items.length)return;
    this.items.push(...(data?.items||[]));this.next=!!data?.next;
  }
  setLiked(item,liked) {
    if(!this.items||!item?.uri)return false;
    const index=this.items.findIndex(entry=>(entry?.track||entry?.item)?.uri===item.uri);
    if(liked&&index<0){this.items.unshift({added_at:new Date(this.now()).toISOString(),track:item});this.total++;return true;}
    if(!liked&&index>=0){this.items.splice(index,1);this.total=Math.max(0,this.total-1);return true;}
    return false;
  }
}
if(typeof module!=='undefined')module.exports={LikedSongsCache};else window.LikedSongsCache=LikedSongsCache;
