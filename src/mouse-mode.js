// Keyboard & Mouse Mode: hold a shortcut and the mouse drives turnbit from anywhere on screen. A transparent overlay
// covers every display (hiding the cursor), so scroll moves through the menu, left click selects, right click goes
// back, and middle click plays or pauses. Release the shortcut to hand the mouse back. A quick tap instead toggles
// the mode on; tap again, press Esc, switch apps, or leave the mouse alone for a while to turn it off.
const path=require('node:path');
const KEYS={'ctrl-alt-z':'Control+Alt+Z','alt-shift-space':'Alt+Shift+Space','ctrl-alt-space':'Control+Alt+Space',f13:'F13'};
const TAP_MS=350,STALE_MS=1100,REPEAT_GAP_MS=500,IDLE_MS=20000;

// Tells a held shortcut from a tap using key repeats and key-up. Pure logic, so it is unit tested without Electron.
class HoldTracker{
  constructor({start,stop,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}){Object.assign(this,{start,stop,now,setTimer,clearTimer});this.active=false;}
  // The global shortcut fires on press and again on every key repeat while held.
  press(){
    const time=this.now();
    if(!this.active){Object.assign(this,{active:true,since:time,last:time,released:false,repeating:false});this.idle();this.start();return;}
    if(!this.released&&time-this.last<STALE_MS){this.repeating=true;this.last=time;this.clearTimer(this.repeatTimer);this.repeatTimer=this.setTimer(()=>this.end(),REPEAT_GAP_MS);return;}
    this.end();
  }
  // Any key-up while active: end a hold, or note that a quick tap left the mode on.
  release(){if(!this.active)return;if(this.repeating||this.now()-this.since>TAP_MS)this.end();else{this.released=true;this.clearTimer(this.repeatTimer);}}
  // Mouse input keeps a tapped-on mode alive.
  idle(){this.clearTimer(this.idleTimer);if(this.active)this.idleTimer=this.setTimer(()=>this.end(),IDLE_MS);}
  end(){if(!this.active)return;this.active=false;this.clearTimer(this.repeatTimer);this.clearTimer(this.idleTimer);this.stop();}
}

class MouseMode{
  constructor({electron,onEvent,onChange=()=>{}}){
    Object.assign(this,{electron,onEvent,onChange});this.key='off';this.accelerator=null;this.overlays=[];
    this.tracker=new HoldTracker({start:()=>this.show(),stop:()=>this.hide()});
    const {ipcMain,screen}=electron;
    ipcMain.on('mouse-mode:input',(event,input)=>{if(!this.owns(event.sender)||!this.tracker.active)return;this.input(input);});
    for(const name of ['display-added','display-removed','display-metrics-changed'])screen.on(name,()=>{this.tracker.end();this.destroyOverlays();});
  }
  owns(sender){return this.overlays.some(window=>!window.isDestroyed()&&window.webContents===sender);}
  get active(){return this.tracker.active;}
  // Returns {key, ok, error}; a shortcut another app already owns cannot be registered.
  setKey(key){
    key=Object.hasOwn(KEYS,key)?key:'off';const {globalShortcut}=this.electron;
    if(key===this.key)return {key,ok:true};
    if(this.accelerator)globalShortcut.unregister(this.accelerator);
    this.tracker.end();this.key=key;this.accelerator=null;
    if(key==='off'){this.destroyOverlays();return {key,ok:true};}
    const accelerator=KEYS[key];
    if(!globalShortcut.register(accelerator,()=>this.tracker.press()))return {key,ok:false,error:`${accelerator.replace('Control','Ctrl')} is in use by another app.`};
    this.accelerator=accelerator;return {key,ok:true};
  }
  input(input){
    if(input.type==='key-up')return this.tracker.release();
    if(input.type==='exit')return this.tracker.end();
    this.tracker.idle();
    if(input.type==='wheel'&&(input.delta===1||input.delta===-1))this.onEvent({type:'rotate',delta:input.delta});
    else if(input.type==='click'&&['select','back','toggle'].includes(input.action))this.onEvent({type:input.action});
  }
  // Created on first use (one per display) and kept hidden afterwards, so later presses are instant.
  ensureOverlays(){
    const {BrowserWindow,screen}=this.electron;
    this.overlays=this.overlays.filter(window=>!window.isDestroyed());if(this.overlays.length)return;
    this.overlays=screen.getAllDisplays().map(display=>{
      const window=new BrowserWindow({...display.bounds,show:false,frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,resizable:false,movable:false,minimizable:false,maximizable:false,fullscreenable:false,skipTaskbar:true,enableLargerThanScreen:true,webPreferences:{preload:path.join(__dirname,'mouse-mode-preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
      window.setAlwaysOnTop(true,'screen-saver');window.setVisibleOnAllWorkspaces?.(true);
      // Leaving the overlay (Alt+Tab, Win key, another app grabbing focus) hands the mouse back.
      window.on('blur',()=>{if(this.tracker.active&&!this.overlays.some(item=>!item.isDestroyed()&&item.isFocused()))this.tracker.end();});
      window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
      window.loadFile(path.join(__dirname,'..','renderer','mouse-mode.html'));
      return window;
    });
  }
  show(){
    this.ensureOverlays();const {screen}=this.electron,point=screen.getCursorScreenPoint(),under=screen.getDisplayNearestPoint(point);
    this.onChange(true);
    for(const window of this.overlays)if(!window.isDestroyed())window.showInactive();
    const target=this.overlays.find(window=>!window.isDestroyed()&&screen.getDisplayMatching(window.getBounds()).id===under.id)||this.overlays[0];
    if(target){target.focus();target.webContents.focus();const bounds=target.getBounds();target.webContents.sendInputEvent({type:'mouseMove',x:point.x-bounds.x,y:point.y-bounds.y});}
  }
  hide(){for(const window of this.overlays)if(!window.isDestroyed())window.hide();this.onChange(false);}
  destroyOverlays(){for(const window of this.overlays)if(!window.isDestroyed())window.destroy();this.overlays=[];}
  dispose(){this.tracker.end();if(this.accelerator)this.electron.globalShortcut.unregister(this.accelerator);this.accelerator=null;this.key='off';this.destroyOverlays();}
}
module.exports={MouseMode,HoldTracker,KEYS};
