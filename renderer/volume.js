// Immediate local feedback; bounded, single-flight writes with a latest-value slot.
class VolumeControl {
  constructor(send,{interval=200,settle=1200,max=100,now=()=>Date.now(),onValue=()=>{},onError=()=>{}}={}) {
    Object.assign(this,{send,interval,settle,max,now,onValue,onError});
    this.value=50;this.pending=null;this.busy=false;this.started=-Infinity;this.protectedUntil=0;this.generation=0;
  }
  set(value) {
    if(!Number.isFinite(value))return;
    const target=Math.max(0,Math.min(this.max,Math.round(value)));
    if(target===this.value)return;
    this.value=target;this.pending=target;this.onValue(target);this.schedule();
  }
  schedule() {
    if(this.busy||this.pending===null||this.timer)return;
    const wait=Math.max(0,this.started+this.interval-this.now());
    if(wait){this.timer=setTimeout(()=>{this.timer=null;this.flush();},wait);return;}
    this.flush();
  }
  async flush() {
    if(this.busy||this.pending===null)return;
    const target=this.pending,generation=this.generation;
    this.pending=null;this.busy=true;this.started=this.now();
    try {await this.send(target);if(generation===this.generation)this.protectedUntil=this.now()+this.settle;}
    catch(error){if(generation===this.generation){this.pending=null;this.protectedUntil=0;this.onError(error);}}
    finally{this.busy=false;this.schedule();}
  }
  acceptRemote(value) {
    if(!Number.isFinite(value)||this.busy||this.pending!==null)return false;
    if(this.now()<this.protectedUntil&&Math.round(value)!==this.value)return false;
    this.value=Math.max(0,Math.min(this.max,Math.round(value)));this.onValue(this.value);return true;
  }
  reset(value=this.value) {
    clearTimeout(this.timer);this.timer=null;this.pending=null;this.protectedUntil=0;this.started=-Infinity;this.generation++;
    this.value=Math.max(0,Math.min(this.max,Math.round(value)));
  }
}
if(typeof module!=='undefined')module.exports={VolumeControl};else window.VolumeControl=VolumeControl;
