// Move retained labels along a circular path, rather than tweening straight chords.
class RadialCarousel {
  constructor(element,{activate,reducedMotion}){
    Object.assign(this,{element,activate,reducedMotion});this.nodes=new Map();this.page=null;this.position=0;this.target=0;this.frame=0;
  }
  stop(){cancelAnimationFrame(this.frame);this.frame=0;}
  snapTo(index){this.stop();this.motion=null;this.position=this.target=index;}
  animateTo(index){this.stop();this.motion={from:this.position,to:index,start:null,duration:240};this.target=index;}
  update(page,rows,selected,{resolve=row=>row,miniIndices}={}){
    if(this.page!==page){this.stop();this.element.replaceChildren();this.nodes.clear();this.page=page;this.position=selected;this.motion=null;}
    if(this.motion&&this.motion.to!==selected)this.motion=null;
    this.rows=rows;this.target=selected;this.miniIndices=miniIndices||rows.flatMap((row,i)=>row.mini?[i]:[]);
    for(const [i,node] of this.nodes)if(i>=rows.length){node.remove();this.nodes.delete(i);}
    this.reach=Math.max(2,(this.element.clientHeight/2-70)/76);const extent=Math.ceil(this.reach)+1;
    const low=Math.max(0,Math.floor(Math.min(this.position,selected))-extent),high=Math.min(rows.length-1,Math.ceil(Math.max(this.position,selected))+extent);
    // Bound work even on large playlists or a burst of hardware input.
    for(let i=low;i<=high;i++){
      if(Math.abs(i-selected)>extent&&Math.abs(i-this.position)>extent)continue;
      const row=resolve(rows[i]);
      let node=this.nodes.get(i);
      if(!node){node=document.createElement('button');node.type='button';node.className='radial-label';node.id=`radial-item-${i}`;node.setAttribute('role','option');node.append(document.createElement('span'),document.createElement('small'));node.onclick=()=>{if(this.page.kind==='list')this.activate(i);};this.nodes.set(i,node);this.element.append(node);}
      node.title=[row.label,row.detail].filter(Boolean).join(' — ');
      const label=node.firstChild;
      if(label.dataset.text!==row.label){
        const track=document.createElement('span'),text=document.createElement('span'),copy=document.createElement('span');
        text.textContent=row.label;copy.textContent=row.label;copy.setAttribute('aria-hidden','true');track.append(text,copy);label.replaceChildren(track);label.dataset.text=row.label;
      }
      if(node.children[1].textContent!==(row.detail||''))node.children[1].textContent=row.detail||'';this.renderMini(node,row.mini);
      const textWidth=label.firstChild.firstChild.scrollWidth,overflow=Math.max(0,textWidth-label.clientWidth);
      label.classList.toggle('scrolling-title',overflow>1&&(i===selected||!!row.mini?.playing));label.style.setProperty('--title-travel',`-${textWidth+32}px`);label.style.setProperty('--title-duration',`${Math.max(5,(textWidth+32)/30)}s`);
      node.disabled=!!row.disabled;node.setAttribute('aria-selected',String(i===selected));node.tabIndex=i===selected?0:-1;
    }
    this.element.setAttribute('aria-activedescendant',`radial-item-${selected}`);
    if(this.reducedMotion()){this.position=selected;this.motion=null;}
    this.paint();if(this.position!==this.target&&!this.frame){this.last=performance.now();this.frame=requestAnimationFrame(time=>this.tick(time));}
  }
  renderMini(node,data){
    node.classList.toggle('has-mini',!!data);let mini=node.querySelector('.radial-mini');
    if(!data){mini?.remove();node.removeAttribute('aria-label');return;}
    if(!mini){
      mini=document.createElement('div');mini.className='radial-mini';
      const cover=document.createElement('div');cover.className='mini-cover';const image=document.createElement('img');image.alt='';const fallback=document.createElement('span');fallback.textContent='♫';cover.append(image,fallback);
      const info=document.createElement('div');info.className='mini-info';const title=document.createElement('strong'),artist=document.createElement('small'),track=document.createElement('div'),fill=document.createElement('i'),times=document.createElement('div');track.className='mini-progress';track.append(fill);times.className='mini-times';times.append(document.createElement('b'),document.createElement('b'));info.append(title,artist,track,times);mini.append(cover,info);node.append(mini);
    }
    const image=mini.querySelector('img');image.hidden=!data.art;image.nextElementSibling.hidden=!!data.art;if(data.art&&image.src!==data.art)image.src=data.art;
    const title=mini.querySelector('strong'),artist=mini.querySelector('small'),artistText=data.artist+(data.playing?'':' · Paused');if(title.textContent!==data.title)title.textContent=data.title;if(artist.textContent!==artistText)artist.textContent=artistText;
    mini.querySelector('i').style.transform=`scaleX(${Math.max(0,Math.min(1,data.ratio))})`;
    const times=mini.querySelector('.mini-times');if(times.firstChild.textContent!==data.elapsed)times.firstChild.textContent=data.elapsed;if(times.lastChild.textContent!==data.total)times.lastChild.textContent=data.total;
    node.setAttribute('aria-label',`${data.title}, ${data.artist}, ${data.playing?'now playing':'paused'}, ${data.elapsed} of ${data.total}`);
  }
  tick(time){
    this.frame=0;const elapsed=Math.min(50,time-this.last);this.last=time;
    if(this.motion){
      const motion=this.motion;motion.start??=time;
      const t=Math.min(1,(time-motion.start)/motion.duration);
      this.position=motion.from+(motion.to-motion.from)*(1-Math.pow(1-t,3));
      if(t===1){this.position=this.target;this.motion=null;}
    }else this.position+=(this.target-this.position)*(1-Math.exp(-elapsed/65));
    if(Math.abs(this.target-this.position)<.002)this.position=this.target;
    this.paint();if(this.position!==this.target)this.frame=requestAnimationFrame(next=>this.tick(next));
  }
  paint(){
    const height=this.element.clientHeight,width=this.element.clientWidth;
    const radiusX=Math.min(270,width*.52),radiusY=Math.max(100,height/2-70),right=document.body.dataset.edge==='left';
    // Reserve space on both sides of the richer playback row, while keeping
    // every label on the same oval and the selected row vertically centered.
    const rowY=i=>i*76+this.miniIndices.reduce((extra,mini)=>extra+(i>mini?48:i===mini?24:0),0);
    const base=Math.floor(this.position),fraction=this.position-base;
    const center=rowY(base)+(rowY(base+1)-rowY(base))*fraction;
    for(const [i,node] of this.nodes){
      // Keep a fixed step between labels; use more labels to fill a taller path.
      const distance=i-this.position,depth=Math.abs(distance),offset=rowY(i)-center;
      if(depth>this.reach+.15){node.style.opacity=0;node.style.pointerEvents='none';if(Math.abs(i-this.target)>this.reach+1){node.remove();this.nodes.delete(i);}continue;}
      const normalized=Math.min(1,Math.abs(offset)/radiusY);
      const x=30+radiusX*(1-Math.sqrt(1-normalized*normalized)),y=height/2+offset;
      node.style.left=right?'auto':x+'px';node.style.right=right?x+'px':'auto';
      node.style.top=y+'px';node.style.transform=`translateY(-50%) scale(${1.12-Math.min(depth,5)*.075})`;
      node.style.opacity=Math.max(0,.98*Math.pow(Math.max(0,1-depth/(this.reach+1)),1.4));node.style.pointerEvents=depth<this.reach-.3?'auto':'none';
      const light=Math.max(0,1-depth);
      node.style.fontWeight=String(Math.round(300+light*120));node.style.setProperty('--light',light);
    }
  }
}
window.RadialCarousel=RadialCarousel;
