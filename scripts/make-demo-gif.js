// Builds assets/demo/turnbit-demo.gif for the README: drives turnbit's Window Mode player in demo mode through a
// short storyboard (inputs go through the same bridge the D100H uses), captures the window, and encodes a looping
// GIF. Run with: npm run demo:gif   (add -- --stills to also save review frames)
const {app,BrowserWindow,nativeImage}=require('electron');
const path=require('node:path'),fs=require('node:fs');
const {GIFEncoder,quantize,applyPalette}=require('gifenc');
const PORT='4810',OUT=path.join(__dirname,'..','assets','demo'),STILLS=process.argv.includes('--stills');
const PROFILE=path.join(app.getPath('temp'),'turnbit-demo-gif');
// A fresh profile each run, so a saved window size or preference from an earlier run never leaks in.
fs.rmSync(PROFILE,{recursive:true,force:true});app.setPath('userData',PROFILE);process.env.TURNBIT_BRIDGE_PORT=PORT;require('../src/main');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const send=event=>fetch(`http://127.0.0.1:${PORT}/device/event`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event)});
const turn=async(delta,gap=260)=>{await send({type:'dial',delta});await wait(gap);};
const press=async(hold=650)=>{await send({type:'command',command:'center-down'});await send({type:'command',command:'center-up'});await send({type:'command',command:'center-click'});await wait(hold);};
// Window content size, and the GIF's width (height follows the window's aspect).
const WIDTH=1440,HEIGHT=900,GIF_WIDTH=800;

// Demo-only songs with generated covers, shown as Liked Songs (the app's own demo mode keeps its 3 plain songs).
const SONGS=[['Glass Harbor','Lumen Drift','Tidewater',214],['Paper Satellites','The Quiet Arcade','Low Orbit',187],['Midnight Transit','Nova Hale','Night Lines',245],['Northbound','Coastal Arcs','Weathervane',198],['Soft Static','Mira Vale','Signal Room',231],['Velvet Hours','Echo Parade','Afterglow',206],['Copper Skies','Lumen Drift','Tidewater',222],['Small Wonders','June Atlas','Field Notes',176],['Neon Rain','The Quiet Arcade','Low Orbit',253],['Sunday Morning Light','Mira Vale','Signal Room',241],['Slow Motion City','Nova Hale','Night Lines',219],['Open Water','Coastal Arcs','Weathervane',264],['Starlight Diner','Echo Parade','Afterglow',193],['Long Way Home','June Atlas','Field Notes',228],['Echo Chamber','Lumen Drift','Tidewater',201],['Golden Hour','Mira Vale','Signal Room',237]];
// One cover per album: a sky gradient, a sun, and layered hills, in that album's colours.
const COVERS={Tidewater:['#9fd3c7','#3f7f8c','#14303f','#f3e2b3'],'Low Orbit':['#c9a7e8','#5b4b9a','#1b1840','#ffd6a5'],'Night Lines':['#f2a07b','#8a4f7d','#1d1b3a','#ffe6a7'],Weathervane:['#b8d8e8','#5d8aa8','#22384f','#fff4d6'],'Signal Room':['#f6c89f','#c0607a','#3a1f3d','#fff1c1'],Afterglow:['#ffb88c','#de6262','#3b1c32','#ffe29f'],'Field Notes':['#cde6a8','#6f9a5b','#23402b','#fdf3c4']};
const cover=([sky,mid,deep,sun])=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><defs><linearGradient id="s" x2=".7" y2="1"><stop stop-color="${sky}"/><stop offset=".55" stop-color="${mid}"/><stop offset="1" stop-color="${deep}"/></linearGradient></defs><path fill="url(#s)" d="M0 0h640v640H0z"/><circle cx="420" cy="230" r="96" fill="${sun}" opacity=".85"/><path d="M0 390Q170 300 340 395T640 380V640H0" fill="${mid}" opacity=".75"/><path d="M0 470Q190 370 360 470T640 440V640H0" fill="${deep}" opacity=".85"/><path d="M0 560Q170 450 350 550T640 510V640H0" fill="${deep}"/></svg>`);

app.whenReady().then(async()=>{try{
  let window;while(!(window=BrowserWindow.getAllWindows()[0]))await wait(20);
  const js=code=>window.webContents.executeJavaScript(code);
  while(!(await js(`typeof preferences!=='undefined'&&typeof radial!=='undefined'&&typeof demos!=='undefined'`).catch(()=>false)))await wait(50);
  // Window Mode with the Now Playing Backdrop in Split View; idle fades and hover shortcuts off so only the storyboard moves.
  await js(`savePreferences({windowMode:true,nowPlayingBackdrop:true,backdropLayout:'split',splitDivider:true,menuTimeout:3,radialSide:'left',radialBackground:30,backRow:true,hoverBack:false,doublePress:'back',idleNowPlaying:false,idleFollowSong:false,idlePinned:false,songOpensNowPlaying:true,playOpensNowPlaying:true,gamingMode:false,mouseModeKey:'off',lastSongList:null,visibility:{mode:'off',opacity:100,idleOpacity:100,timeout:10}});message();`);
  const covers=Object.fromEntries(Object.entries(COVERS).map(([album,colours])=>[album,cover(colours)]));
  await js(`demos.splice(0,demos.length,...${JSON.stringify(SONGS)}.map(([name,artist,album,s])=>({name,artist,album,duration:s*1000,artwork:${JSON.stringify(covers)}[album]})));demoQueue=demos.map((_,i)=>i);index=0;playing=true;progress=48000;updated=Date.now();dismissDialOverlay();nav.reset(root());showNow();drawNavigation();render();`);
  window.setResizable(true);window.setContentSize(WIDTH,HEIGHT);window.center();await wait(1200);await js('drawNavigation();render();');await wait(400);
  const probe=await window.webContents.capturePage();const {width:CW,height:CH}=probe.getSize();
  const OW=GIF_WIDTH,OH=Math.round(CH*OW/CW),SX=CW/OW,SY=CH/OH;
  const gif=GIFEncoder();fs.mkdirSync(OUT,{recursive:true});if(STILLS)fs.mkdirSync(path.join(OUT,'stills'),{recursive:true});
  let pending=null,frames=0,written=0,last=Date.now(),capturing=true;
  const flush=()=>{if(!pending)return;gif.writeFrame(pending.index,OW,OH,{palette:pending.palette,delay:Math.max(20,Math.round(pending.delay)),repeat:written===0?0:undefined});written++;pending=null;};
  const record=async()=>{
    while(capturing){
      const src=(await window.webContents.capturePage()).toBitmap(),now=Date.now(),dt=now-last;last=now;
      // Area-average the BGRA capture down to the GIF size (the window is opaque, so alpha is ignored).
      const rgba=new Uint8Array(OW*OH*4);
      for(let y=0;y<OH;y++){const y0=Math.floor(y*SY),y1=Math.max(y0+1,Math.floor((y+1)*SY));
        for(let x=0;x<OW;x++){const x0=Math.floor(x*SX),x1=Math.max(x0+1,Math.floor((x+1)*SX));let r=0,g=0,b=0,n=0;
          for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++){const i=(yy*CW+xx)*4;b+=src[i];g+=src[i+1];r+=src[i+2];n++;}
          const k=(y*OW+x)*4;rgba[k]=r/n;rgba[k+1]=g/n;rgba[k+2]=b/n;rgba[k+3]=255;}}
      // Identical frames (pauses) extend the previous frame instead of adding a new one.
      if(pending&&Buffer.from(rgba).equals(pending.rgba))pending.delay+=dt;
      else{flush();const palette=quantize(rgba,256,{format:'rgb565'});pending={rgba:Buffer.from(rgba),index:applyPalette(rgba,palette,'rgb565'),palette,delay:dt};frames++;
        if(STILLS&&frames%10===0){const bgra=Buffer.alloc(rgba.length);for(let i=0;i<rgba.length;i+=4){bgra[i]=rgba[i+2];bgra[i+1]=rgba[i+1];bgra[i+2]=rgba[i];bgra[i+3]=255;}
          fs.writeFileSync(path.join(OUT,'stills',`frame-${String(frames).padStart(3,'0')}.png`),nativeImage.createFromBitmap(bgra,{width:OW,height:OH}).toPNG());}}
      await wait(40);
    }
  };
  // Turn the dial one step at a time until the highlighted row matches.
  const goTo=async(predicate,gap=300)=>{const target=await js(`nav.current.rows.findIndex(row=>${predicate})`);if(target<0)throw new Error('No row: '+predicate);
    let selected=await js('nav.current.selected');while(selected!==target){await turn(Math.sign(target-selected),gap);selected=await js('nav.current.selected');}};
  const recorder=record();
  // Storyboard.
  await wait(1600);                                          // Now Playing, full window
  await turn(1,1100);                                        // first turn: the dial menu slides in, the player steps aside
  await goTo(`row.action==='songs'`);await wait(300);
  await press(1000);                                         // open Liked Songs
  await goTo(`row.label==='Sunday Morning Light'`,330);await wait(500);
  await press(2400);                                         // play it: the menu folds away, Now Playing shows the new song
  await turn(1,1200);                                        // the menu comes back, on the playing song
  await goTo(`row.label==='Starlight Diner'`,330);await wait(400);
  await press(2600);                                         // play another
  capturing=false;await recorder;if(pending)pending.delay+=300;flush();gif.finish();
  const file=path.join(OUT,'turnbit-demo.gif');fs.writeFileSync(file,gif.bytes());
  console.log(`Demo GIF: ${frames} frames, ${OW}x${OH}, ${(fs.statSync(file).size/1048576).toFixed(2)} MB -> ${path.relative(process.cwd(),file)}`);app.quit();
}catch(error){console.error(error);app.exit(1);}});
