const DEFAULT_VISIBILITY={mode:'off',opacity:70,idleOpacity:20,timeout:10};
function normalizeVisibility(value={}){
  const number=(key,min,max)=>Number.isFinite(value?.[key])?Math.max(min,Math.min(max,Math.round(value[key]))):DEFAULT_VISIBILITY[key];
  return {mode:['off','always','idle'].includes(value?.mode)?value.mode:'off',opacity:number('opacity',0,100),idleOpacity:number('idleOpacity',0,100),timeout:number('timeout',1,600)};
}
class VisibilityControl {
  constructor(onOpacity,{now=()=>Date.now(),fade=650}={}){
    Object.assign(this,{onOpacity,now,fade});this.settings=normalizeVisibility();this.opacity=1;this.target=1;this.from=1;this.started=now();this.lastActivity=now();this.revealUntil=0;this.protected=false;
  }
  configure(value,protectedView=false){
    const next=normalizeVisibility(value),changed=JSON.stringify(next)!==JSON.stringify(this.settings);
    const protectionChanged=this.protected!==protectedView;
    this.settings=next;this.protected=protectedView;
    if(changed||protectionChanged){this.lastActivity=this.now();if(changed)this.revealUntil=0;if(changed&&next.mode==='always'&&next.opacity===0)this.revealUntil=this.now()+10000;}
    if(protectedView)this.immediate(1);else this.tick();
    return this.settings;
  }
  destination(){
    if(this.protected||this.now()<this.revealUntil||this.settings.mode==='off')return 1;
    if(this.settings.mode==='always')return this.settings.opacity/100;
    return this.now()-this.lastActivity>=this.settings.timeout*1000?this.settings.idleOpacity/100:1;
  }
  isIdle(){
    if(this.protected||this.now()<this.revealUntil)return false;
    return this.settings.mode==='idle'?this.now()-this.lastActivity>=this.settings.timeout*1000:this.settings.mode==='always'&&this.settings.opacity===0&&this.opacity<1;
  }
  immediate(value){this.target=value;this.from=value;this.started=this.now();this.write(value);}
  write(value){const rounded=Math.round(value*10000)/10000;if(rounded===this.opacity)return;this.opacity=rounded;this.onOpacity(rounded);}
  wake(force=false){
    this.lastActivity=this.now();
    if(force||(this.settings.mode==='always'&&this.settings.opacity===0))this.revealUntil=this.now()+Math.max(10000,this.settings.timeout*1000);
    this.immediate(this.destination());
  }
  tick(){
    const target=this.destination(),now=this.now();
    if(target!==this.target){this.from=this.opacity;this.target=target;this.started=now;}
    const progress=Math.max(0,Math.min(1,(now-this.started)/this.fade));
    this.write(this.from+(this.target-this.from)*(progress*progress*progress*(progress*(progress*6-15)+10)));
  }
}
module.exports={DEFAULT_VISIBILITY,normalizeVisibility,VisibilityControl};
