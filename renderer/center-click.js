class CenterClick {
  constructor(select,back,{delay=350,now=()=>Date.now()}={}){Object.assign(this,{select,back,delay,now});this.pending=false;this.timer=null;}
  click(){
    if(this.pending&&this.now()-this.started<=this.delay){this.cancel();this.back();return;}
    this.flush();this.pending=true;this.started=this.now();
    this.timer=setTimeout(()=>this.flush(),this.delay);
  }
  cancel(){clearTimeout(this.timer);this.timer=null;this.pending=false;}
  flush(){if(!this.pending)return;this.cancel();this.select();}
}
if(typeof module!=='undefined')module.exports={CenterClick};else window.CenterClick=CenterClick;
