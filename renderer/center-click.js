class CenterClick {
  constructor(select,back,{delay=350,now=()=>Date.now(),armed=()=>true}={}){Object.assign(this,{select,back,delay,now,armed});this.pending=false;this.timer=null;}
  click(){
    if(this.pending&&this.now()-this.started<=this.delay){this.cancel();this.back();return;}
    // Where a press changes a value in place, people hyper-click on purpose: act at once and read
    // no gesture into the second press. Waiting would only make the dial feel slow there anyway.
    if(!this.armed()){this.flush();this.select();return;}
    this.flush();this.pending=true;this.started=this.now();
    this.timer=setTimeout(()=>this.flush(),this.delay);
  }
  cancel(){clearTimeout(this.timer);this.timer=null;this.pending=false;}
  flush(){if(!this.pending)return;this.cancel();this.select();}
}
if(typeof module!=='undefined')module.exports={CenterClick};else window.CenterClick=CenterClick;
