// Builds assets/demo/turnbit-demo.gif for the README: drives turnbit in demo mode through a short storyboard
// (inputs go through the same bridge the D100H uses), captures the menu, composites it over a desktop-style
// backdrop, and encodes a looping GIF. Run with: npm run demo:gif   (add -- --stills to also save review frames)
const {app,BrowserWindow,nativeImage}=require('electron');
const path=require('node:path'),fs=require('node:fs');
const {GIFEncoder,quantize,applyPalette}=require('gifenc');
const PORT='4810',OUT=path.join(__dirname,'..','assets','demo'),STILLS=process.argv.includes('--stills');
app.setPath('userData',path.join(app.getPath('temp'),'turnbit-demo-gif'));process.env.TURNBIT_BRIDGE_PORT=PORT;require('../src/main');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const send=event=>fetch(`http://127.0.0.1:${PORT}/device/event`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event)});
const turn=async(delta,gap=260)=>{await send({type:'dial',delta});await wait(gap);};
const press=async(hold=650)=>{await send({type:'command',command:'center-down'});await send({type:'command',command:'center-up'});await send({type:'command',command:'center-click'});await wait(hold);};

// Demo-only library: 24 fictional songs so the curved list fills out (the app's own demo mode keeps its 3 songs).
const SONGS=[['Glass Harbor','Lumen Drift','Tidewater',214],['Paper Satellites','The Quiet Arcade','Low Orbit',187],['Midnight Transit','Nova Hale','Night Lines',245],['Northbound','Coastal Arcs','Weathervane',198],['Soft Static','Mira Vale','Signal Room',231],['Velvet Hours','Echo Parade','Afterglow',206],['Copper Skies','Lumen Drift','Tidewater',222],['Small Wonders','June Atlas','Field Notes',176],['Neon Rain','The Quiet Arcade','Low Orbit',253],['Sunday Morning Light','Mira Vale','Signal Room',241],['Slow Motion City','Nova Hale','Night Lines',219],['Open Water','Coastal Arcs','Weathervane',264],['Starlight Diner','Echo Parade','Afterglow',193],['Long Way Home','June Atlas','Field Notes',228],['Echo Chamber','Lumen Drift','Tidewater',201],['Golden Hour','Mira Vale','Signal Room',237],['Orbiting','The Quiet Arcade','Low Orbit',212],['Wildflower Road','June Atlas','Field Notes',189],['After Midnight','Nova Hale','Night Lines',247],['Harbor Lights','Coastal Arcs','Weathervane',205],['Daydreamer','Echo Parade','Afterglow',183],['Satellite Heart','Lumen Drift','Tidewater',226],['Quiet Storm','Mira Vale','Signal Room',259],['Last Train Out','Nova Hale','Night Lines',234]];

// Desktop-style backdrop: a subtle dark slate gradient with a soft vignette, at output resolution.
function backdrop(w,h){const px=new Float32Array(w*h*3);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const t=x/w*0.4+y/h*0.6,fade=1-Math.min(1,Math.hypot(x/w-0.6,y/h-0.45))*0.35,i=(y*w+x)*3;
    px[i]=(22+t*10)*fade;px[i+1]=(30+t*16)*fade;px[i+2]=(40+t*22)*fade;}
  return px;}
// 4x4 Bayer matrix: light ordered dithering hides the banding a 256-color GIF gives smooth gradients.
const BAYER=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5].map(v=>(v/16-0.47)*6);

app.whenReady().then(async()=>{try{
  let window;while(!(window=BrowserWindow.getAllWindows()[0]))await wait(20);await wait(1500);
  const js=code=>window.webContents.executeJavaScript(code);
  await js(`savePreferences({interfaceStyle:'radial',radialSide:'left',radialBackground:40,backRow:true,hoverBack:true,doublePress:'back',idleNowPlaying:false,idlePinned:false,songOpensNowPlaying:true,playOpensNowPlaying:true,gamingMode:false,lastSongList:null,visibility:{mode:'off',opacity:100,idleOpacity:0,timeout:10}});demo=true;playing=false;progress=0;`);
  await js(`demos.splice(0,demos.length,...${JSON.stringify(SONGS)}.map(([name,artist,album,s])=>({name,artist,album,duration:s*1000})));const all=demos.map((_,i)=>i);demoLibrary=(kind,playlist)=>kind==='playlists'?{items:[{id:'demo-a',name:'Late Night Drive',demoIndexes:all.slice(0,12)},{id:'demo-b',name:'Slow Sundays',demoIndexes:all.slice(12)}],next:null}:{items:(playlist?.demoIndexes||all).map(i=>({item:demos[i],demoIndex:i})),next:null};index=0;nav.reset(root());drawNavigation();`);
  // A shorter window so the whole half-oval, including where it bends back at both ends, fits the frame.
  window.setBounds({x:0,y:0,width:1040,height:1000});await wait(700);await js('drawNavigation();');await wait(300);
  const crop={x:0,y:0,width:760,height:1000};
  const probe=await window.webContents.capturePage(crop);const {width:CW,height:CH}=probe.getSize(),OW=Math.floor(CW/2),OH=Math.floor(CH/2);
  const bg=backdrop(OW,OH),gif=GIFEncoder();fs.mkdirSync(OUT,{recursive:true});if(STILLS)fs.mkdirSync(path.join(OUT,'stills'),{recursive:true});
  let pending=null,frames=0,written=0,last=Date.now(),capturing=true;
  const flush=()=>{if(!pending)return;gif.writeFrame(pending.index,OW,OH,{palette:pending.palette,delay:Math.max(20,Math.round(pending.delay)),repeat:written===0?0:undefined});written++;pending=null;};
  const record=async()=>{
    while(capturing){
      const src=(await window.webContents.capturePage(crop)).toBitmap(),now=Date.now(),dt=now-last;last=now;
      // Composite BGRA over the backdrop, 2x box-downsample, and dither into RGBA output.
      const rgba=new Uint8Array(OW*OH*4),row=CW*4;
      for(let y=0;y<OH;y++){const r0=y*2*row,r1=r0+row,by=(y&3)*4;
        for(let x=0;x<OW;x++){const i0=r0+x*8,i1=r1+x*8,o=(y*OW+x)*3,d=BAYER[by+(x&3)];
          const a0=src[i0+3],a1=src[i0+7],a2=src[i1+3],a3=src[i1+7],inv=1-(a0+a1+a2+a3)/1020,k=(y*OW+x)*4;
          rgba[k]=Math.max(0,Math.min(255,(src[i0+2]*a0+src[i0+6]*a1+src[i1+2]*a2+src[i1+6]*a3)/1020+bg[o]*inv+d));
          rgba[k+1]=Math.max(0,Math.min(255,(src[i0+1]*a0+src[i0+5]*a1+src[i1+1]*a2+src[i1+5]*a3)/1020+bg[o+1]*inv+d));
          rgba[k+2]=Math.max(0,Math.min(255,(src[i0]*a0+src[i0+4]*a1+src[i1]*a2+src[i1+4]*a3)/1020+bg[o+2]*inv+d));rgba[k+3]=255;}}
      // Identical frames (pauses) extend the previous frame instead of adding a new one.
      if(pending&&Buffer.from(rgba).equals(pending.rgba))pending.delay+=dt;
      else{flush();const palette=quantize(rgba,256,{format:'rgb565'});pending={rgba:Buffer.from(rgba),index:applyPalette(rgba,palette,'rgb565'),palette,delay:dt};frames++;
        if(STILLS&&frames%12===0){const bgra=Buffer.alloc(rgba.length);for(let i=0;i<rgba.length;i+=4){bgra[i]=rgba[i+2];bgra[i+1]=rgba[i+1];bgra[i+2]=rgba[i];bgra[i+3]=255;}
          fs.writeFileSync(path.join(OUT,'stills',`frame-${String(frames).padStart(3,'0')}.png`),nativeImage.createFromBitmap(bgra,{width:OW,height:OH}).toPNG());}}
      await wait(15);
    }
  };
  const recorder=record();
  // Storyboard.
  await wait(1100);                                         // Home: Now Playing shortcut above Liked Songs
  await press(900);                                         // open Liked Songs
  for(let i=0;i<9;i++)await turn(1,300);await wait(500);     // browse down the curve
  await press(1800);                                        // play "Sunday Morning Light" -> Now Playing
  for(let i=0;i<5;i++)await turn(1,170);await wait(900);     // volume up on Now Playing
  await press(1300);                                        // single press: back to the list, on the playing song
  for(let i=0;i<12;i++)await turn(-1,110);await wait(1500);  // spin up past the top to Back, rest: ring, then Home
  await turn(-1,1700);                                      // up to the Now Playing shortcut, rest: ring, then Now Playing
  await wait(900);
  capturing=false;await recorder;if(pending)pending.delay+=200;flush();gif.finish();
  const file=path.join(OUT,'turnbit-demo.gif');fs.writeFileSync(file,gif.bytes());
  console.log(`Demo GIF: ${frames} frames, ${OW}x${OH}, ${(fs.statSync(file).size/1048576).toFixed(2)} MB -> ${path.relative(process.cwd(),file)}`);app.quit();
}catch(error){console.error(error);app.exit(1);}});
