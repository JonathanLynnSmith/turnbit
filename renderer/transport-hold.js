class TransportHold {
  constructor(skip,scrub,{delay=500,interval=100,maxHold=15000}={}){Object.assign(this,{skip,scrub,delay,interval,maxHold});}
  down(direction){
    if(this.direction===direction)return;
    this.cancel();this.direction=direction;this.held=false;
    this.timer=setTimeout(()=>{this.held=true;this.scrub(direction*5000);this.repeat=setInterval(()=>this.scrub(direction*1000),this.interval);},this.delay);
    // Stop if a disconnect/profile switch swallows the release event.
    this.safety=setTimeout(()=>this.cancel(),this.maxHold);
  }
  up(direction){if(this.direction!==direction)return;const held=this.held;this.cancel();if(!held)this.skip(direction);}
  cancel(){clearTimeout(this.timer);clearTimeout(this.safety);clearInterval(this.repeat);this.direction=null;}
}
if(typeof module!=='undefined')module.exports={TransportHold};else window.TransportHold=TransportHold;
