const $ = selector => document.querySelector(selector);
const api = window.dialpod;
const demos = [{name:'Night Drive',artist:'turnbit demo',album:'After Hours',duration:214000},{name:'A Little Further',artist:'turnbit demo',album:'Click wheel sessions',duration:187000},{name:'Sunday Morning',artist:'turnbit demo',album:'Slow days',duration:245000}];
let lastVisualActivity=Date.now();
let demo=true, index=0, playing=false, progress=0, volume=50, playback=null, updated=Date.now(), pinned=false, polling=false;
let zuneVolumeTimer,refreshTimer, demoQueue=[0,1,2], volumeDeviceId=null;
const {themes,applyTheme}=window.DialPodThemes;
const themeName=id=>themes.find(theme=>theme.id===id)?.name||'Silver';
const visibilityDefaults={mode:'off',opacity:70,idleOpacity:20,timeout:10};
function cleanVisibility(value={}){const number=(key,min,max)=>Number.isFinite(value[key])?Math.max(min,Math.min(max,Math.round(value[key]))):visibilityDefaults[key];return {mode:['off','always','idle'].includes(value.mode)?value.mode:'off',opacity:number('opacity',0,100),idleOpacity:number('idleOpacity',0,100),timeout:number('timeout',1,600)};}
function cleanLastSongList(value){
  if(value?.kind==='songs')return {kind:'songs',name:'Liked Songs'};
  if(value?.kind==='playlist'&&typeof value.playlist?.id==='string'&&/^[A-Za-z0-9-]{1,64}$/.test(value.playlist.id)&&typeof value.name==='string')return {kind:'playlist',name:value.name.slice(0,256),playlist:{id:value.playlist.id,name:value.name.slice(0,256),uri:value.playlist.uri,demoIndexes:Array.isArray(value.playlist.demoIndexes)?value.playlist.demoIndexes.filter(i=>Number.isInteger(i)&&i>=0&&i<demos.length):undefined}};
  return null;
}
const preferences = { lastSongList:null, idleFollowSong:true, dialOnlyWake:false, mousePassthrough:false, preferredDevice:null, autoLaunchSpotify:false, gamingMode:false, idlePinned:false, reverseDial:false, backRow:true, hoverBack:true, idleNowPlaying:true, songOpensNowPlaying:true, playOpensNowPlaying:true, keepOnTop:false, keepCurrentSongPosition: true, appearance:'silver', screenTheme:'light', interfaceStyle:'radial', radialSide:'left', radialBackground:24, primaryHue:360, accentHue:145, visibility:{...visibilityDefaults}, clicker:false };
try { const saved=JSON.parse(localStorage.getItem('dialpod-preferences')||'{}');if(saved.appearance==='spotify-center')saved.appearance='spotify';for(const key of ['mousePassthrough','dialOnlyWake','idleFollowSong','autoLaunchSpotify','gamingMode','idlePinned','reverseDial','backRow','hoverBack','idleNowPlaying','songOpensNowPlaying','playOpensNowPlaying'])if(typeof saved[key]==='boolean')preferences[key]=saved[key];preferences.lastSongList=cleanLastSongList(saved.lastSongList);if(saved.preferredDevice&&typeof saved.preferredDevice.id==='string'&&saved.preferredDevice.id.length>0&&saved.preferredDevice.id.length<=256&&typeof saved.preferredDevice.name==='string'&&saved.preferredDevice.name.length<=256)preferences.preferredDevice={id:saved.preferredDevice.id,name:saved.preferredDevice.name,type:String(saved.preferredDevice.type||'').slice(0,64)};if(typeof saved.keepOnTop==='boolean')preferences.keepOnTop=saved.keepOnTop;if(typeof saved.keepCurrentSongPosition==='boolean')preferences.keepCurrentSongPosition=saved.keepCurrentSongPosition;if(themes.some(theme=>theme.id===saved.appearance))preferences.appearance=saved.appearance;if(['light','dark'].includes(saved.screenTheme))preferences.screenTheme=saved.screenTheme;else if(preferences.appearance==='spotify')preferences.screenTheme='dark';if(['ipod','zune','radial'].includes(saved.interfaceStyle))preferences.interfaceStyle=saved.interfaceStyle;if(['left','right'].includes(saved.radialSide))preferences.radialSide=saved.radialSide;if(Number.isFinite(saved.radialBackground))preferences.radialBackground=Math.max(0,Math.min(100,Math.round(saved.radialBackground)));for(const key of ['primaryHue','accentHue'])if(Number.isFinite(saved[key]))preferences[key]=Math.max(0,Math.min(360,Math.round(saved[key])));if(saved.visibility&&typeof saved.visibility==='object')preferences.visibility=cleanVisibility(saved.visibility);if(typeof saved.clicker==='boolean')preferences.clicker=saved.clicker; } catch {}
applyTheme(document.body,preferences.appearance);document.body.dataset.screen=preferences.screenTheme;document.body.dataset.interface=preferences.interfaceStyle;document.body.dataset.edge=preferences.radialSide;api?.setInterface?.(preferences.interfaceStyle,preferences.radialSide)?.catch(error=>message(error.message));
let audioContext, feedbackTimer, pressTimer, displayedPage, displayedDepth=1;
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
function wheelFeedback(pressed=false) {
  $('#wheel').classList.add('feedback');clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>$('#wheel').classList.remove('feedback'),140);
  if(pressed){$('#select').classList.add('pressed');clearTimeout(pressTimer);pressTimer=setTimeout(()=>$('#select').classList.remove('pressed'),160);}
}
function clickSound() {
  if(!preferences.clicker)return;
  try { audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
    if(audioContext.state==='suspended'){audioContext.resume().catch(()=>{});return;}
    const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),start=audioContext.currentTime;
    oscillator.type='triangle';oscillator.frequency.setValueAtTime(950,start);oscillator.frequency.exponentialRampToValueAtTime(350,start+.012);
    gain.gain.setValueAtTime(.035,start);gain.gain.exponentialRampToValueAtTime(.0001,start+.012);oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(start);oscillator.stop(start+.014);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }catch{}
}
function setMarquee(element,text) {
  if(element.textContent!==text||!element.firstElementChild){const span=document.createElement('span');span.textContent=text;element.replaceChildren(span);element.classList.remove('scrolling');}
  element.title=text;measureMarquee(element);
}
function measureMarquee(element) {
  if(!element.clientWidth)return;
  const overflow=element.firstElementChild?.scrollWidth-element.clientWidth;
  element.classList.toggle('scrolling',overflow>2);
  if(overflow>2){element.style.setProperty('--marquee-shift',`${-overflow-4}px`);element.style.setProperty('--marquee-time',`${Math.max(7,overflow/20+3)}s`);}
}
function measureVisibleTitles() {
  document.querySelectorAll('#nowView .marquee,.menurow.selected .rowname').forEach(measureMarquee);
}
// Home: Now Playing shortcut on top, then Liked Songs and Playlists directly (no Music menu), then Settings.
// The Zune interface keeps its own Home with a Music screen.
function homeRows(){
  const last=preferences.lastSongList?[lastSongListRow()]:[];
  if(preferences.interfaceStyle==='zune')return [{label:'Music',action:'music',branch:true},{label:'Now Playing',action:'now',branch:true},{label:'Settings',action:'settings',branch:true},...last];
  return [{label:'Now Playing',action:'now',icon:'now',control:true},{label:'Liked Songs',action:'songs',branch:true},{label:'Playlists',action:'playlists',branch:true},...last,{label:'Settings',action:'settings',branch:true}];
}
const homeStart=()=>preferences.interfaceStyle==='zune'?0:1;
const root = () => ({title:'turnbit',rows:homeRows(),selected:homeStart()});
const nav = new window.WheelNavigation(root());
const idle = new window.IdleNowPlaying(nav);
let silentHardwareActivity=false;
function noteActivity(){if(silentHardwareActivity)return;followIdleSong.last=null;lastVisualActivity=Date.now();idle.noteActivity();syncGamingMode();api?.activity();}
// Asleep = faded out by Idle Fade (past its timeout) or fully transparent. Dial Only Wake only changes behavior while asleep.
function widgetAsleep(){return visibilityState.invisible||(preferences.visibility.mode==='idle'&&!visibilityProtected()&&Date.now()-lastVisualActivity>=preferences.visibility.timeout*1000);}
function visibilityProtected(){return (preferences.idlePinned&&preferences.visibility.mode==='idle')||!!nav.current.visibilitySettings||$('#settings').open;}
let visibilitySyncKey;
function syncRecovery(){const value={preferredDevice:preferences.preferredDevice,autoLaunchSpotify:preferences.autoLaunchSpotify},key=JSON.stringify(value);if(syncRecovery.key===key)return;syncRecovery.key=key;api?.recovery?.(value)?.catch(error=>{syncRecovery.key=null;message(error.message);});}
function syncVisibility(){const key=JSON.stringify([preferences.visibility,visibilityProtected(),preferences.dialOnlyWake,preferences.mousePassthrough]);if(key===visibilitySyncKey)return;visibilitySyncKey=key;api?.visibility(preferences.visibility,visibilityProtected(),preferences.dialOnlyWake,preferences.mousePassthrough)?.catch(error=>{visibilitySyncKey=null;message(error.message);});}
const volumeControl=new window.VolumeControl(async value=>{
  if(!demo)await api.command('volume',value);
},{interval:600,settle:1500,onValue:value=>{volume=value;render();},onError:error=>message(error.message)});
const seekControl=new window.VolumeControl(async value=>{
  if(!demo)await api.command('seek',value);
},{max:86400000,interval:450,onValue:value=>{progress=value;updated=Date.now();render();},onError:error=>{transportHold.cancel();message(error.message);}});
seekControl.reset(0);
function wakeIdle() { const restored=idle.wake();if(restored){drawNavigation();render();}return restored; }
const time = ms => { const s=Math.floor(Math.max(0,ms)/1000);return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; };
const duration = () => demo ? demos[index].duration : playback?.item?.duration_ms || 0;
function currentProgress() { return Math.min(duration(),progress+(playing?Date.now()-updated:0)); }
let noticeTimer;
function message(text='') {
  $('#message').textContent=text;
  let notice=$('#actionNotice');
  if(!notice){notice=document.createElement('div');notice.id='actionNotice';notice.setAttribute('role','status');notice.hidden=true;document.body.append(notice);}
  clearTimeout(noticeTimer);notice.textContent=text;notice.hidden=!text||preferences.interfaceStyle!=='radial';
  if(text)noticeTimer=setTimeout(()=>{notice.hidden=true;},5000);
}
// Lists below Home start with a Back row, so the dial alone can go back without a Menu button. Inserting it keeps
// the same item highlighted, so entering a list still lands on its first real item.
// A small inline icon drawn in the text color (see .row-icon in styles.css), e.g. the Back row's arrow.
function rowIcon(row){if(!row.icon)return [];const icon=document.createElement('span');icon.className=`row-icon row-icon-${row.icon}`;icon.setAttribute('aria-hidden','true');return [icon];}
// Hover Shortcuts: resting on a shortcut row (Back in lists, Now Playing on Home) after turning onto it runs it after a
// short hold. Its icon turns into a ring that fills while it counts (driven by --back-hold, so it survives redraws).
const BACK_HOLD_MS=1000;let backHold=null;
function shortcutRow(page){const row=page?.rows[page.selected];return row?.control&&(row.action!=='nav-back'||preferences.backRow)?row:null;}
function cancelBackHold(){if(!backHold)return;cancelAnimationFrame(backHold.frame);backHold=null;document.body.dataset.backHold='false';document.documentElement.style.removeProperty('--back-hold');}
function startBackHold(){
  cancelBackHold();const page=nav.current,row=shortcutRow(page);if(!preferences.hoverBack||!row)return;
  const start=performance.now();document.body.dataset.backHold='true';
  const step=now=>{
    if(!backHold)return;
    if(nav.current!==page||shortcutRow(page)!==row||$('#settings').open){cancelBackHold();return;}
    const progress=Math.min(1,(now-start)/BACK_HOLD_MS);document.documentElement.style.setProperty('--back-hold',progress.toFixed(3));
    if(progress>=1){cancelBackHold();if(row.action==='nav-back'){nav.back();drawNavigation();}else if(row.action==='now')showNow();else if(row.action==='more'&&!page.loading)loadLibrary(page,row.offset);return;}
    backHold.frame=requestAnimationFrame(step);
  };
  backHold={frame:requestAnimationFrame(step)};
}
// Keep Home matching homeRows() (switching interfaces, or Last Song List appearing), with the same item highlighted.
function ensureHomeLayout(page){
  if(page!==nav.stack[0]||page===nav.idlePage)return;
  const want=homeRows(),key=rows=>rows.map(row=>row.action).join();if(key(want)===key(page.rows))return;
  const swap={music:'songs',songs:'music',playlists:'music'},was=page.rows[page.selected]?.action;
  page.rows=want;let index=want.findIndex(row=>row.action===was);if(index<0)index=want.findIndex(row=>row.action===swap[was]);
  page.selected=index>=0?index:homeStart();
}
function ensureBackRow(page){
  if(!page||page.kind!=='list'||page===nav.stack[0]||page===nav.idlePage)return;
  if(!preferences.backRow){if(page.rows[0]?.action==='nav-back'){page.rows.shift();page.selected=Math.max(0,page.selected-1);page.awaitingFirst=false;}return;}
  if(page.rows[0]?.action!=='nav-back'){
    page.rows.unshift({label:'Back',action:'nav-back',icon:'back',control:true});page.selected=Math.min(page.rows.length-1,page.selected+1);
    if(page.rows.length<2||page.rows[1].disabled)page.awaitingFirst=true;
  }
  // Lists that load later (Liked Songs, devices) would otherwise open on Back: highlight the first item when it arrives.
  if(page.awaitingFirst&&page.rows.length>1&&!page.rows[1].disabled){page.awaitingFirst=false;if(page.selected===0)page.selected=1;}
}
function drawNavigation() {
  const page=nav.current;ensureBackRow(page);ensureHomeLayout(page);syncVisibility();drawRadial();if(preferences.interfaceStyle==='radial')return;
  const preview=page.rows[page.selected];
  applyTheme(document.body,preview?.action==='theme'?preview.theme:preferences.appearance);
  $('.case-name').textContent=preferences.interfaceStyle==='zune'?'zune':'turnbit';
  const musicTab=preferences.interfaceStyle==='zune'&&['playlists','songs'].includes(page.libraryKind);
  $('.screen').dataset.music=String(musicTab);
  document.querySelectorAll('[data-zune-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.zuneTab===page.libraryKind)));
  $('.screen').dataset.page=page.kind;$('.screen').dataset.root=String(nav.stack.length===1&&!nav.idlePage);
  $('.screen').setAttribute('aria-label',preferences.interfaceStyle==='zune'?'Zune-style player':'iPod menu');
  $('#screenTitle').textContent=preferences.interfaceStyle==='zune'&&nav.stack.length===1&&!nav.idlePage?'zune':page.title;
  $('#menuView').hidden=page.kind!=='list'; $('#nowView').hidden=page.kind!=='now'; $('#adjustView').hidden=page.kind!=='volume';$('#visibilityView').hidden=page.kind!=='visibility';
  if(page.kind==='visibility'){const seconds=page.key==='timeout';$('#visibilityValue').textContent=page.value+(seconds?' sec':'%');$('#visibilityLabel').textContent=page.key==='radialBackground'?'Background strength · 0% turns it off':seconds?'Time without interaction':'0% invisible · 100% solid';$('#visibilityRange').min=seconds?1:0;$('#visibilityRange').max=seconds?600:100;$('#visibilityRange').value=page.value;$('#visibilityRange').style.setProperty('--fill',(page.value/Number($('#visibilityRange').max)*100)+'%');}
  if(displayedPage!==page){
    const view=page.kind==='list'?$('#menuView'):page.kind==='now'?$('#nowView'):page.kind==='visibility'?$('#visibilityView'):$('#adjustView');
    if(displayedPage&&!reducedMotion.matches)view.animate([{opacity:.75,transform:`translateX(${nav.stack.length<displayedDepth?-7:7}px)`},{opacity:1,transform:'translateX(0)'}],{duration:110,easing:'ease-out'});
    displayedPage=page;displayedDepth=nav.stack.length;
  }
  requestAnimationFrame(measureVisibleTitles);
  if(page.kind!=='list')return;
  const list=$('#menuList');const scroll=list.scrollTop;list.replaceChildren();
  list.setAttribute('aria-label',page.title);list.setAttribute('aria-activedescendant',`row-${page.selected}`);
  page.rows.forEach((row,i)=>{
    const button=document.createElement('button');button.className=`menurow${i===page.selected?' selected':''}${row.control?' control-row':''}${row.action==='more'?' control-row-end':''}`;button.id=`row-${i}`;button.type='button';button.setAttribute('role','option');button.setAttribute('aria-selected',String(i===page.selected));button.setAttribute('aria-disabled',String(!!row.disabled));button.tabIndex=-1;
    const label=document.createElement('span');label.className='rowlabel';
    if(row.swatch){const swatch=document.createElement('span');swatch.className='theme-swatch';swatch.style.backgroundColor=row.swatch;swatch.setAttribute('aria-hidden','true');label.append(swatch);}
    if(row.action==='song'){const marker=document.createElement('span');marker.className='track-indicator';marker.setAttribute('aria-hidden','true');label.append(marker);}
    const name=document.createElement('span');name.className=`rowname${i===page.selected?' marquee':''}`;const text=document.createElement('span');text.append(...rowIcon(row),row.label);name.append(text);name.title=row.label;label.append(name);button.append(label);
    if(nav.stack.length===1){const caption=document.createElement('span');caption.className='zune-caption';caption.textContent={music:'playlists + liked songs',now:'your current track',settings:'make it yours'}[row.action]||'';label.append(caption);}
    const suffix=document.createElement('span');suffix.className='suffix';suffix.textContent=row.branch?(row.showDetail?row.detail+' ›':'›'):row.detail||'';button.append(suffix);
    button.onclick=()=>{page.selected=i;drawNavigation();selectItem();};list.append(button);
  });
  list.scrollTop=scroll;list.children[page.selected]?.scrollIntoView({block:'nearest'});
  updateTrackIndicators();
  $('#menuPreview').hidden=!(nav.stack.length===1||page.title==='Music');
  $('#listPosition').textContent=page.rows.length?`${page.selected+1} of ${page.rows.length}`:'';
  const hints={'current-song':preferences.keepCurrentSongPosition?'Current song opens Now Playing.':'Current song restarts when selected.',appearance:'Choose an Apple-inspired finish.',clicker:'Soft clicks when browsing menus.'};
  $('#menuHint').textContent=hints[page.rows[page.selected]?.action]||page.hint || (demo?'Demo · turn to browse, press to select':'Turn to browse · press to select');
}
const radial=new window.RadialCarousel($('#radialLabels'),{
  activate:i=>{nav.current.selected=i;drawNavigation();selectItem();},
  reducedMotion:()=>reducedMotion.matches
});
const trackTransition=new window.TrackTransition($('#radialNow'),{reducedMotion:()=>reducedMotion.matches});
function radialColor(hue,accent=false){return hue===360?'#eef7f5':`hsl(${hue} 75% ${accent?68:79}%)`;}
function radialColorName(hue){return hue===360?'White':['Red','Orange','Amber','Lime','Green','Mint','Cyan','Azure','Blue','Violet','Magenta','Rose'][Math.floor((hue+15)%360/30)];}
function applyRadialColors(){const page=nav.current;for(const key of ['primaryHue','accentHue']){const hue=page.kind==='color'&&page.key===key?page.value:preferences[key];$('#radial').style.setProperty(key==='primaryHue'?'--radial-primary':'--radial-accent',radialColor(hue,key==='accentHue'));}}
function radialRowDetail(row){
  if(row.action!=='song')return row.detail;
  const artist=row.item?.artists?.map(artist=>artist.name).filter(Boolean).join(', ')||row.item?.artist||row.item?.publisher||'Unknown artist';
  const active=isCurrentSong(row)&&(demo?(playing||progress>0):playback?.item);
  const status=active?'':row.detail;
  return [artist,status].filter(Boolean).join(' · ');
}
function radialMiniPlayer(row){
  if(!isCurrentSong(row)||!(demo?(playing||progress>0):playback?.item))return null;
  return {title:row.label,artist:row.item?.artists?.map(artist=>artist.name).filter(Boolean).join(', ')||row.item?.artist||playback?.item?.publisher||'Unknown artist',art:!demo&&(playback?.item?.album?.images?.[0]?.url||row.item?.album?.images?.[0]?.url),playing,ratio:duration()?currentProgress()/duration():0,elapsed:time(currentProgress()),total:time(duration())};
}
function updateSmokeShape(){
  const host=$('#radial'),height=host.clientHeight,width=Math.min(1040,innerWidth),radiusX=Math.min(270,host.clientWidth*.52),radiusY=Math.max(100,height/2-70);
  const key=[width,height,radiusX].join(':');if(!height||updateSmokeShape.key===key)return;updateSmokeShape.key=key;
  // The same ellipse as the label path, offset inward and feathered horizontally.
  const points=[];
  for(let y=0;y<=height+8;y+=8){const py=Math.min(height,y),normal=Math.min(1,Math.abs(py-height/2)/radiusY);const edge=host.clientWidth-30-radiusX*(1-Math.sqrt(1-normal*normal));points.push(`${(edge+300).toFixed(2)},${py}`);}
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><filter id="soft" filterUnits="userSpaceOnUse" x="-300" y="0" width="${width+600}" height="${height}"><feGaussianBlur stdDeviation="90 0"/></filter></defs><path d="M-300,0 L${points.join(' L')} L-300,${height} Z" fill="black" filter="url(#soft)"/></svg>`;
  host.style.setProperty('--smoke-shape',`url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
}
let miniIndexCache={};
function currentMiniIndices(page){const key=[demo,index,playback?.item?.uri,demo?(playing||progress>0):!!playback?.item].join(':');if(miniIndexCache.rows!==page.rows||miniIndexCache.key!==key)miniIndexCache={rows:page.rows,key,indices:page.rows.flatMap((row,i)=>radialMiniPlayer(row)?[i]:[])};return miniIndexCache.indices;}
function drawRadial(){
  ensureBackRow(nav.current);ensureHomeLayout(nav.current);
  if(visibilityState.invisible||visibilityState.minimized)return;
  if(preferences.interfaceStyle!=='radial'){radial.stop();trackTransition.reset();return;}
  const page=nav.current;if(page.kind!=='now')trackTransition.reset();
  $('#radial').dataset.page=page.kind;applyRadialColors();
  $('#radialColor').hidden=page.kind!=='color';
  const haze=page.kind==='visibility'&&page.key==='radialBackground'?page.value:preferences.radialBackground;
  $('#radial').style.setProperty('--smoke-opacity',haze/100);updateSmokeShape();
  $('#radialStatus').dataset.playing=String(page.kind==='now'&&playing);
  $('#radialNow').hidden=page.kind!=='now';$('#radialLabels').hidden=['now','color'].includes(page.kind);
  $('#radialContext').textContent=page.title==='turnbit'?'SPOTIFY / TURNBIT':page.title.toUpperCase();
  $('#radialStatus').textContent=page.kind==='list'?(page.rows.length?`${String(page.selected+1).padStart(2,'0')} / ${String(page.rows.length).padStart(2,'0')}`:''):
    page.kind==='now'?`${playing?'PLAYING':'PAUSED'}  ·  ${time(currentProgress())} / ${time(duration())}  ·  VOL ${volume}`:'TURN TO ADJUST · PRESS TO SAVE';
  if($('#message').textContent)$('#radialStatus').textContent=$('#message').textContent;
  if(page.kind==='color'){radial.stop();$('#radialColorLabel').textContent=page.title;$('#radialHue').value=page.value;$('#radialColorValue').textContent=radialColorName(page.value);$('#radialColorSwatch').style.background=radialColor(page.value,page.key==='accentHue');}
  else if(page.kind==='list')radial.update(page,page.rows,page.selected,{resolve:row=>({label:row.label,icon:row.icon,control:row.control,detail:radialRowDetail(row),disabled:row.disabled,mini:radialMiniPlayer(row)}),miniIndices:currentMiniIndices(page)});
  else if(page.kind==='now'){
    radial.stop();trackTransition.update([demo?'demo:'+index:playback?.item?.uri,$('#title').textContent,$('#artist').textContent,$('#album').textContent,$('#art').hidden?'':$('#art').src].join('|'));
    $('#radialTitle').textContent=$('#title').textContent;$('#radialArtist').textContent=$('#artist').textContent;$('#radialAlbum').textContent=$('#album').textContent;
    const artwork=$('#art');$('#radialArt').hidden=artwork.hidden;$('#radialArtFallback').hidden=!artwork.hidden;
    if(!artwork.hidden&&$('#radialArt').src!==artwork.src)$('#radialArt').src=artwork.src;
    $('#radialElapsed').textContent=time(currentProgress());$('#radialDuration').textContent=time(duration());
    const seekInput=$('#radialSeek');seekInput.max=Math.max(1,duration());if(document.activeElement!==seekInput)seekInput.value=currentProgress();
    $('#radialVolume').value=volume;$('#radialVolumeValue').textContent=volume+'%';
    for(const slider of [seekInput,$('#radialVolume')])slider.style.setProperty('--fill',Number(slider.value)/Number(slider.max)*100+'%');
    $('#radialStatus').textContent=$('#message').textContent||(playing?'PLAYING':'PAUSED');
  }
  else radial.update(page,[{label:page.title},{label:page.kind==='volume'?volume+'%':page.value+(page.key==='timeout'?' seconds':'%')},{label:'Press to save'}],1);
}
function isCurrentSong(row) {
  if(row.action!=='song')return false;
  if(demo)return row.demoIndex===index;
  const current=playback?.item;
  const uris=[current?.uri,current?.linked_from?.uri].filter(Boolean);
  return [row.item?.uri,row.item?.linked_from?.uri].some(uri=>uri&&uris.includes(uri));
}
function updateTrackIndicators() {
  if(preferences.interfaceStyle==='radial'||nav.current.kind!=='list')return;
  nav.current.rows.forEach((row,i)=>{
    const button=$('#menuList').children[i];if(!button)return;
    const matches=isCurrentSong(row);
    button.classList.toggle('current-track',matches);
    const marker=button.querySelector('.track-indicator');
    if(marker){marker.textContent=matches?(playing?'▶':'Ⅱ'):'';marker.title=matches?(playing?'Currently playing':'Current song · paused'):'';}
    button.setAttribute('aria-label',`${row.label}${matches?(playing?', currently playing':', current song, paused'):''}`);
  });
}
function renderPlaybackIndicators(){
  const liked=demo?demoLikes.has(index):playback?.liked,shuffle=demo?demoShuffle:!!playback?.shuffle_state,repeat=demo?demoRepeat:playback?.repeat_state||'off';
  const paths={like:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',shuffle:'<path d="M3 5h3c5 0 7 14 12 14h3m-4-4 4 4-4 4M3 19h3c2 0 4-3 6-7s4-7 6-7h3m-4-4 4 4-4 4"/>',repeat:'<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/><text class="repeat-one" x="12" y="15" text-anchor="middle">1</text>'};
  for(const host of [document.querySelector('#radialNow .radial-track'),document.querySelector('#nowView .now-meta')]){
    let bar=host.querySelector('.playback-indicators');
    if(!bar){bar=document.createElement('div');bar.className='playback-indicators';for(const key of ['like','shuffle','repeat']){const icon=document.createElement('span');icon.dataset.mode=key;icon.setAttribute('role','img');icon.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+paths[key]+'</svg>';bar.append(icon);}host.append(bar);}
    for(const icon of bar.children){const key=icon.dataset.mode,active=key==='like'?liked===true:key==='shuffle'?shuffle:repeat!=='off';const label=key==='like'?(liked===true?'Liked song':liked===false?'Not liked':'Like status unavailable'):key==='shuffle'?'Shuffle '+(shuffle?'on':'off'):'Repeat '+({off:'off',context:'all',track:'one song'}[repeat]||'off');icon.dataset.pending=String(key==='like'&&(likeRequests>0||(!demo&&!!playback?.likedPending)));icon.dataset.active=String(active);icon.dataset.repeat=repeat;icon.title=label;icon.setAttribute('aria-label',label);}
  }
}
const visibilityState={invisible:false,minimized:false};
let renderStamp=null;
function syncGamingMode(){document.body.dataset.gamingIdle=String(preferences.gamingMode&&Date.now()-lastVisualActivity>1500);}
function renderProgress(force=false){
  if((!playing&&!force)||visibilityState.invisible||visibilityState.minimized)return;
  const position=currentProgress(),length=Math.max(1,duration());
  const text=(selector,value)=>{const node=$(selector);if(node.textContent!==value)node.textContent=value;};
  if(preferences.interfaceStyle!=='radial'&&nav.current.kind==='now'){$('#seek').value=position;$('#seek').style.setProperty('--fill',position/length*100+'%');text('#elapsed',time(position));text('#duration','−'+time(Math.max(0,length-position)));}
  if(preferences.interfaceStyle==='radial'){
    if(nav.current.kind==='now'){const input=$('#radialSeek');if(document.activeElement!==input){input.value=position;input.style.setProperty('--fill',position/length*100+'%');}text('#radialElapsed',time(position));}
    else if(nav.current.kind==='list'){for(const [i,node] of radial.nodes){if(node.classList.contains('has-mini'))radial.renderMini(node,radialMiniPlayer(nav.current.rows[i]));}}
  }
}
function render() {
  if(visibilityState.invisible||visibilityState.minimized)return;
  const stamp=[demo,index,demos[index]?.name,demos[index]?.artist,demos[index]?.album,playing,volume,playback?.item?.uri,playback?.item?.name,playback?.item?.album?.name,playback?.item?.album?.images?.[0]?.url,playback?.item?.artists?.map(a=>a.name).join(', '),playback?.item?.duration_ms,playback?.device?.name,playback?.liked,playback?.likedPending,playback?.shuffle_state,playback?.repeat_state,demoShuffle,demoRepeat,demoLikes.has(index),likeRequests,nav.current,nav.current.rows,nav.current.selected,nav.current.value,preferences.interfaceStyle,preferences.primaryHue,preferences.accentHue,innerWidth,innerHeight];
  if(renderStamp&&stamp.every((value,i)=>value===renderStamp[i])){renderProgress(true);return;}
  renderStamp=stamp;
  renderPlaybackIndicators();
  const track=demo?demos[index]:playback?.item;
  const name=track?.name||'Nothing playing',artist=demo?track.artist:track?.artists?.map(a=>a.name).join(', ')||'Open Spotify to start listening';
  $('#source').textContent=demo?'DEMO':'SPOTIFY';$('#playing').textContent=playing?'Playing':'Paused';$('#playing').dataset.symbol=playing?'▶':'Ⅱ';$('#playing').title=playing?'Playing':'Paused';
  setMarquee($('#title'),name);setMarquee($('#artist'),artist);setMarquee($('#album'),demo?track.album:track?.album?.name||'');
  const artwork=!demo&&track?.album?.images?.[0]?.url;
  $('#art').hidden=!artwork;$('#artFallback').hidden=!!artwork;if(artwork&&$('#art').src!==artwork)$('#art').src=artwork;
  $('#previewArt').hidden=!artwork;$('#previewFallback').hidden=!!artwork;if(artwork&&$('#previewArt').src!==artwork)$('#previewArt').src=artwork;
  $('#previewTitle').textContent=name;$('#previewTitle').title=name;$('#previewArtist').textContent=artist;$('#previewArtist').title=artist;
  $('#trackNumber').textContent=demo?`${Math.max(0,demoQueue.indexOf(index))+1} of ${demoQueue.length}`:'';
  const playlistPage=nav.stack.findLast(page=>page.libraryKind==='playlist'&&page.playlist?.uri&&page.playlist.uri===playback?.context?.uri);
  const playlistRow=playlistPage?.rows.find(isCurrentSong);if(!demo&&playlistRow&&playlistPage.total)$('#trackNumber').textContent=`${playlistRow.position+1} of ${playlistPage.total}`;
  $('#seek').max=Math.max(1,duration());$('#seek').value=currentProgress();$('#elapsed').textContent=time(currentProgress());$('#duration').textContent=`−${time(duration()-currentProgress())}`;
  $('#volume').value=volume;$('#volumeValue').textContent=`${volume}%`;$('#adjustVolume').value=volume;$('#adjustValue').textContent=`${volume}%`;
  for(const slider of [$('#seek'),$('#volume'),$('#adjustVolume')])slider.style.setProperty('--fill',`${Number(slider.value)/Math.max(1,Number(slider.max))*100}%`);
  $('#deviceBtn').textContent=demo?'Demo playback · no audio':`Playing on ${playback?.device?.name||'select a device'}`;
  $('#connect').textContent=demo?'Connect Spotify':'Spotify settings';
  updateTrackIndicators();drawRadial();
}
function acceptPlayback(data) {
  if(data?.recoveredDevice){if(preferences.preferredDevice?.id!==data.recoveredDevice.id)savePreferences({preferredDevice:data.recoveredDevice});return;}
  if(data?.recoveryMessage)return message(data.recoveryMessage);
  if(data?.error)return message(data.error);
  if(playback?.item?.uri && data?.item?.uri && playback.item.uri!==data.item.uri){transportHold.cancel();seekControl.reset(0);}
  const wasLikePending=!!playback?.likedPending;
  playback=data;playing=!!data?.is_playing;
  // Keep cached Liked Songs current when the playing song's like flips (in turnbit or on another device).
  // Only a flip counts: an old liked song reporting liked:true must not jump to the top of the list.
  if(!demo&&data?.item?.uri&&!data.provisional&&!data.likedPending&&typeof data.liked==='boolean'){if(lastLiked?.uri===data.item.uri&&lastLiked.liked!==data.liked&&likedSongs.setLiked(data.item,data.liked))syncLikedSongPages();lastLiked={uri:data.item.uri,liked:data.liked};}
  if(data?.likeError)message(data.likeError);else if(wasLikePending&&!data?.likedPending&&typeof data?.liked==='boolean')message(data.liked?'Liked · confirmed by Spotify':'Unliked · confirmed by Spotify');
  if(!transportHold.direction&&!seekControl.busy&&seekControl.pending===null&&Date.now()>=seekControl.protectedUntil){progress=data?.progress_ms||0;updated=Date.now();}
  const deviceId=data?.device?.id;
  if(deviceId&&volumeDeviceId&&deviceId!==volumeDeviceId)volumeControl.reset(volume);
  if(deviceId)volumeDeviceId=deviceId;
  if(Number.isFinite(data?.device?.volume_percent))volumeControl.acceptRemote(data.device.volume_percent);followSkippedSong();render();
}
async function refresh() { if(demo||polling||!api)return;polling=true;try{await api.state();}catch(e){message(e.message);}finally{polling=false;} }
// Poll Spotify only as often as the view needs: faster while playing, slower when paused or minimized, and right after a track should end.
let pollTimer;
// Phone or speaker playback has no local shortcut, so every poll is a Web API call. Poll quickly only while someone is
// using turnbit, and check once at the end of each song (not repeatedly, if Spotify is slow to move on).
function pollDelay(){
  if(visibilityState.invisible||visibilityState.minimized||document.hidden)return 30000;if(!playing)return 15000;
  const base=playback?.localSession||Date.now()-lastVisualActivity<30000?5000:15000,uri=playback?.item?.uri,left=duration()-currentProgress();
  return duration()>0&&uri&&poll.endChecked!==uri&&left+500<base?Math.max(1000,left+500):base;
}
async function poll(){clearTimeout(pollTimer);if(playing&&duration()>0&&duration()-currentProgress()<1500)poll.endChecked=playback?.item?.uri;await refresh();clearTimeout(pollTimer);pollTimer=setTimeout(poll,pollDelay());}
const demoLikes=new Set();
let likeRequests=0;
let demoShuffle=false,demoRepeat='off';
async function command(cmd,value) {
  // While asleep with Dial Only Wake on, media commands act without waking turnbit or changing screens.
  // While visible, Play Opens Now Playing applies as usual.
  const quietPlay=preferences.dialOnlyWake&&widgetAsleep();
  if(!quietPlay||!['toggle','next','previous','seek','like','shuffle','repeat','volume'].includes(cmd))noteActivity();
  if(['next','previous'].includes(cmd))pendingSkipFollow={page:nav.current,key:demo?'demo:'+index:playback?.item?.uri,until:Date.now()+20000};
  message();
  if(cmd==='pin'){toggleIdlePin();return true;}
  if(cmd==='toggle' && !quietPlay && preferences.playOpensNowPlaying && (nav.current.kind!=='now'||$('#settings').open)){
    // From any menu/form, the first Play press only opens the player.
    if($('#settings').open)$('#settings').close();
    showNow();return true;
  }
  if(['next','previous','play-item','device'].includes(cmd)){transportHold.cancel();seekControl.reset(0);}
  if(demo){
    if(['like','shuffle','repeat'].includes(cmd)){if(cmd==='like'){if(demoLikes.has(index))demoLikes.delete(index);else demoLikes.add(index);}if(cmd==='shuffle')demoShuffle=!demoShuffle;if(cmd==='repeat')demoRepeat={off:'context',context:'track',track:'off'}[demoRepeat];message(cmd==='like'?(demoLikes.has(index)?'Demo: saved to Liked Songs':'Demo: removed from Liked Songs'):cmd==='shuffle'?'Shuffle '+(demoShuffle?'on':'off'):'Repeat: '+({off:'off',context:'all',track:'one song'}[demoRepeat]));render();return true;}
    progress=currentProgress();updated=Date.now();if(cmd==='toggle')playing=!playing;
    if(cmd==='next'||cmd==='previous'){const position=Math.max(0,demoQueue.indexOf(index));index=demoQueue[(position+(cmd==='next'?1:demoQueue.length-1))%demoQueue.length];progress=0;followSkippedSong();}
    if(cmd==='volume')volume=value;if(cmd==='seek')progress=Math.max(0,Math.min(duration(),value));render();return true;
  }
  if(cmd==='device'){volumeControl.reset(volume);volumeDeviceId=null;}
  if(cmd==='like'){likeRequests++;message('Updating Liked Songs…');render();}
  try{const result=await api.command(cmd,value);if(result?.message)message(result.message);clearTimeout(refreshTimer);refreshTimer=setTimeout(poll,600);return true;}catch(e){message(e.message);return false;}finally{if(cmd==='like'){likeRequests--;render();}}
}
function changeVolume(value) { noteActivity();message();volumeControl.set(value);if(preferences.interfaceStyle==='zune'){$('#zuneVolumeOverlay').textContent='volume '+volume;$('#zuneVolumeOverlay').hidden=false;clearTimeout(zuneVolumeTimer);zuneVolumeTimer=setTimeout(()=>{$('#zuneVolumeOverlay').hidden=true;},1200);} }
function seek(value) { if(!preferences.dialOnlyWake)noteActivity();seekControl.set(Math.max(0,Math.min(duration(),value))); }
function openSettings() { wakeIdle();if(!$('#settings').open)$('#settings').showModal(); }
function menuBack() {
  noteActivity();
  wheelFeedback();clickSound();
  if($('#settings').open){$('#settings').close();return;}
  if(preferences.interfaceStyle==='zune'&&nav.stack.length===1&&!nav.idlePage){showNow();return;}
  if(nav.current.kind==='now'&&preferences.interfaceStyle==='ipod'){nav.goHome();drawNavigation();message();return;}
  const fromNow=nav.current.kind==='now';nav.back();drawNavigation();message();if(fromNow)selectPlayingSong();
}
function dialogControls() { return [...$('#settings').querySelectorAll('button:not(:disabled),input,a,summary')]; }
function rotate(delta) {
  wheelFeedback();
  noteActivity();
  if($('#settings').open){const controls=dialogControls();const i=controls.indexOf(document.activeElement);controls[Math.max(0,Math.min(controls.length-1,i+delta))]?.focus();return;}
  if(nav.current.kind==='color'){nav.current.value=(nav.current.value+delta%361+361)%361;drawNavigation();return;}
  if(nav.current.kind==='visibility'){const page=nav.current;page.value=Math.max(page.key==='timeout'?1:0,Math.min(page.key==='timeout'?600:100,page.value+delta));drawNavigation();return;}
  if(nav.current.kind==='volume'||nav.current.kind==='now')return changeVolume(volume+delta*2);
  nav.current.awaitingFirst=false;const previous=nav.current.selected;nav.move(delta);if(nav.current.selected!==previous)clickSound();drawNavigation();
  // Extra up-turns at the top of the list are normal when turning all the way up: keep counting (or start) instead of cancelling.
  if(!shortcutRow(nav.current))cancelBackHold();else if(!backHold)startBackHold();
}
function push(page) { noteActivity();const result=nav.push(page);drawNavigation();return result; }
function showNow() { if(nav.current.kind!=='now')push({title:'Now Playing',kind:'now'});render(); }
function returnToSongList() {
  noteActivity();
  if(nav.returnToMusic()){drawNavigation();selectPlayingSong();return;}
  const uri=playback?.context?.uri;
  nav.goHome();if(preferences.interfaceStyle==='zune')showMusic();
  if(/^spotify:playlist:[a-zA-Z0-9]{22}$/.test(uri||''))showLibrary('playlist',{id:uri.split(':')[2],uri,name:'Current Playlist'});
  else showLibrary('songs');
  selectPlayingSong();
}
function showMusic() { if(preferences.interfaceStyle==='zune'){showLibrary('playlists');return;}push({title:'Music',rows:[{label:'Playlists',action:'playlists',branch:true},{label:'Liked Songs',action:'songs',branch:true}],hint:demo?'Demo library · no audio':'Songs are your Spotify Liked Songs'}); }
function radialSettingsRows(){return [{label:'Screen edge',action:'radial-side',detail:preferences.radialSide==='left'?'Left':'Right'},{label:'Smoky Background',action:'radial-background',detail:preferences.radialBackground?preferences.radialBackground+'%':'Off',branch:true,showDetail:true},{label:'Primary Color',action:'radial-color',key:'primaryHue',detail:radialColorName(preferences.primaryHue),branch:true},{label:'Accent Color',action:'radial-color',key:'accentHue',detail:radialColorName(preferences.accentHue),branch:true}];}
function showSettings() { push({title:'Settings',rows:[{label:'Volume',action:'volume',branch:true},{label:'Playback Device',action:'devices',branch:true},{label:'Spotify Connection',action:'connect',branch:true},{label:'Keep on Top',action:'pin',detail:pinned?'On':'Off'},{label:'Keep Song Position',action:'current-song',detail:preferences.keepCurrentSongPosition?'On':'Off'},{label:'Apperance',action:'case-theme',detail:themeName(preferences.appearance),branch:true},{label:'Screen',action:'screen-theme',detail:preferences.screenTheme==='dark'?'Dark':'Light'},{label:'Clicker',action:'clicker',detail:preferences.clicker?'On':'Off'},{label:'Interface',action:'interface',detail:interfaceName(preferences.interfaceStyle),branch:true},{label:'Transparency',action:'visibility',branch:true},...(preferences.interfaceStyle==='radial'?radialSettingsRows():[]),{label:'Idle to Now Playing',action:'playback-preference',key:'idleNowPlaying',detail:preferences.idleNowPlaying?'On':'Off'},{label:'Open Song in Now Playing',action:'playback-preference',key:'songOpensNowPlaying',detail:preferences.songOpensNowPlaying?'On':'Off'},{label:'Play Opens Now Playing',action:'playback-preference',key:'playOpensNowPlaying',detail:preferences.playOpensNowPlaying?'On':'Off'},{label:'Reverse Dial Direction',action:'playback-preference',key:'reverseDial',detail:preferences.reverseDial?'On':'Off'},{label:'Back in Lists',action:'playback-preference',key:'backRow',detail:preferences.backRow?'On':'Off'},{label:'Hover Shortcuts',action:'playback-preference',key:'hoverBack',detail:preferences.hoverBack?'On':'Off'},{label:'Pin Widget',action:'idle-pin',detail:preferences.idlePinned?'On':'Off'},{label:'Gaming Mode',action:'playback-preference',key:'gamingMode',detail:preferences.gamingMode?'On':'Off'},{label:'Preferred Device',action:'preferred-devices',detail:preferences.preferredDevice?.name||'Automatic',branch:true,showDetail:true},{label:'Open Spotify Automatically',action:'playback-preference',key:'autoLaunchSpotify',detail:preferences.autoLaunchSpotify?'On':'Off'},{label:'Mouse Click Through',action:'playback-preference',key:'mousePassthrough',detail:preferences.mousePassthrough?'On':'Off'},{label:'Dial Only Wake',action:'playback-preference',key:'dialOnlyWake',detail:preferences.dialOnlyWake?'On':'Off'},{label:'Follow Playing Song',action:'playback-preference',key:'idleFollowSong',detail:preferences.idleFollowSong?'On':'Off'}]}); }
function showTransparency(){const value=preferences.visibility;push({title:'Transparency',visibilitySettings:true,rows:[{label:'Mode',action:'visibility-mode',detail:{off:'Off',always:'Always',idle:'Idle Fade'}[value.mode]},{label:'Opacity',action:'visibility-adjust',key:'opacity',detail:value.opacity+'%',branch:true,showDetail:true},{label:'Idle Opacity',action:'visibility-adjust',key:'idleOpacity',detail:value.idleOpacity+'%',branch:true,showDetail:true},{label:'Idle Timeout',action:'visibility-adjust',key:'timeout',detail:value.timeout+' sec',branch:true,showDetail:true}],hint:value.mode==='idle'?'Solid while active · fades after idle':value.mode==='always'?'Fixed opacity · 0% wakes on D100H input':'Select Mode to enable transparency'});}
function showZunePlaybackOptions() {push({title:'Playback',rows:[{label:'Song list',action:'song-list',branch:true},{label:'Volume',action:'volume',branch:true},{label:'Playback device',action:'devices',branch:true},{label:'Now playing',action:'back-now',branch:true}]});}
function interfaceName(style){return {radial:'turnbit',ipod:'iPod',zune:'Zune'}[style]||'turnbit';}
function showInterfaces() {const styles=['radial','ipod','zune'];push({title:'Interface',rows:styles.map(style=>({label:interfaceName(style),action:'set-interface',style,detail:preferences.interfaceStyle===style?'✓':''})),hint:'Select an interface · Menu to return'});nav.current.selected=nav.current.rows.findIndex(row=>row.style===preferences.interfaceStyle);drawNavigation();}

function showCaseThemes() {
  push({title:'Case Theme',rows:themes.map(theme=>({label:theme.name,action:'theme',theme:theme.id,swatch:theme.color,detail:theme.id===preferences.appearance?'✓':''})),hint:'Turn to preview · Select to save'});
  nav.current.selected=nav.current.rows.findIndex(row=>row.theme===preferences.appearance);drawNavigation();
}
function savePreferences(patch) {
  try {const next={...preferences,...patch};localStorage.setItem('dialpod-preferences',JSON.stringify(next));Object.assign(preferences,next);applyTheme(document.body,preferences.appearance);document.body.dataset.screen=preferences.screenTheme;document.body.dataset.interface=preferences.interfaceStyle;document.body.dataset.edge=preferences.radialSide;api?.setInterface?.(preferences.interfaceStyle,preferences.radialSide)?.catch(error=>message(error.message));syncVisibility();syncRecovery();return true;}
  catch {message('Could not save this setting. Please try again.');return false;}
}
function toggleCurrentSongBehavior() {
  if(savePreferences({keepCurrentSongPosition:!preferences.keepCurrentSongPosition})){const row=nav.current.rows.find(row=>row.action==='current-song');if(row)row.detail=preferences.keepCurrentSongPosition?'On':'Off';drawNavigation();}
}
let pinQueue=Promise.resolve();
function togglePin(){pinQueue=pinQueue.then(performPinToggle);return pinQueue;}
function toggleIdlePin(){
  if(!savePreferences({idlePinned:!preferences.idlePinned}))return;
  for(const page of nav.stack){const row=page.rows?.find(item=>item.action==='idle-pin');if(row)row.detail=preferences.idlePinned?'On':'Off';}
  noteActivity();drawNavigation();message(preferences.idlePinned?'Widget pinned · idle paused':'Widget unpinned · idle resumed');
}
async function performPinToggle() { if(!api)return;try{const next=await api.pin(!pinned);if(!savePreferences({keepOnTop:next})){await api.pin(pinned);return;}pinned=next;$('#pin').textContent=pinned?'◆':'◇';$('#pin').setAttribute('aria-pressed',String(pinned));const row=nav.current.rows.find(r=>r.action==='pin');if(row)row.detail=pinned?'On':'Off';drawNavigation();message(pinned?'Always on Top enabled':'Always on Top disabled');}catch(e){message(e.message);} }
function demoLibrary(kind,playlist) {
  if(kind==='playlists')return {items:[{id:'demo-night',name:'After Hours',demoIndexes:[0,1]},{id:'demo-sunday',name:'Slow Days',demoIndexes:[2]}],next:null};
  const indexes=playlist?.demoIndexes||[0,1,2];return {items:indexes.map(i=>({item:demos[i],demoIndex:i})),next:null};
}
function playable(item) { return item && !item.is_local && item.is_playable!==false && !item.restrictions && /^spotify:(track|episode):[A-Za-z0-9]{22}$/.test(item.uri||''); }
const likedSongs=new window.LikedSongsCache();let lastLiked=null;
// Load more is a shortcut row: press it, or rest on it (Hover Shortcuts) to load the next page.
function moreRow(offset){return {label:'Load more',action:'more',offset,icon:'more',control:true};}
function libraryRows(page,items,offset){return items.map((entry,i)=>{
  if(page.libraryKind==='playlists')return {label:entry.name||'Untitled playlist',action:'playlist',playlist:entry,branch:true};
  const item=entry.item||entry.track;
  return {label:item?.name||'Unavailable item',action:'song',item,position:offset+i,contextUri:page.playlist?.uri,demoIndex:entry.demoIndex,queue:page.playlist?.demoIndexes,disabled:!demo&&!playable(item),detail:time(demo?item.duration:item?.duration_ms||0)};
});}
// Redraw a Liked Songs page from the cache, keeping the highlighted song selected if it is still there.
function showCachedSongs(page,data){
  const selectedUri=page.rows[page.selected]?.item?.uri,items=data.items||[];
  page.total=data.total;page.rows=libraryRows(page,items,0);
  if(data.next)page.rows.push(moreRow(items.length));
  if(!page.rows.length)page.rows=[{label:'No items found',disabled:true}];
  const index=selectedUri?page.rows.findIndex(row=>row.item?.uri===selectedUri):-1;
  page.selected=index>=0?index:Math.min(page.selected,page.rows.length-1);
  if(nav.current===page)drawNavigation();
}
function likedSongPages(){return [...new Set([...nav.stack,...(Array.isArray(nav.musicPath)?nav.musicPath:[]),lastSongListPage].filter(page=>page?.libraryKind==='songs'&&!page.loading))];}
function syncLikedSongPages(){const data=likedSongs.snapshot();if(data)for(const page of likedSongPages())showCachedSongs(page,data);}
// Show cached Liked Songs at once, then check Spotify's first page unless it was checked in the last 30 seconds.
async function refreshLikedSongs(page){
  if(likedSongs.isFresh()||page.refreshing)return;page.refreshing=true;
  try{if(likedSongs.applyFirstPage(await api.library('songs',undefined,0)))syncLikedSongPages();}
  catch(e){if(nav.current===page)message(e.message);}finally{page.refreshing=false;}
}
async function loadLibrary(page,offset=0) {
  if(!demo&&page.libraryKind==='songs'&&!offset){const cached=likedSongs.snapshot();if(cached){showCachedSongs(page,cached);refreshLikedSongs(page);return;}}
  if(page.loading)return;page.loading=true;
  const baseRows=page.rows.filter(row=>row.action!=='more'&&row.action!=='retry'&&row.action!=='placeholder');
  if(!offset)page.rows=[...baseRows,{label:'Loading…',action:'placeholder',disabled:true}];
  else{const more=page.rows.find(row=>row.action==='more');if(more)more.label='Loading…';}
  if(nav.current===page)drawNavigation();
  try{
    const data=demo?demoLibrary(page.libraryKind,page.playlist):await api.library(page.libraryKind,page.playlist?.id,offset);
    page.total=data.total;
    if(!demo&&page.libraryKind==='songs'){if(offset)likedSongs.appendPage(offset,data);else likedSongs.applyFirstPage(data);}
    const rows=libraryRows(page,data.items||[],offset);
    page.rows=[...baseRows,...rows];
    if(data.next)page.rows.push(moreRow(offset+(data.items?.length||50)));
    // The Back row is not an item: an empty list still says so.
    if(!page.rows.some(row=>row.action!=='nav-back'))page.rows=[...page.rows,{label:'No items found',disabled:true}];
  }catch(e){
    page.rows=[...baseRows,{label:'Retry loading',action:'retry',offset,branch:true}];
    if(nav.current===page)message(e.status===403?'Spotify denied browsing. Reconnect for library permissions; playlist contents require ownership or collaboration.':e.message);
  }finally{page.loading=false;page.selected=Math.min(page.selected,Math.max(0,page.rows.length-1));if(nav.current===page)drawNavigation();if(page.selectPlayingOnLoad){page.selectPlayingOnLoad=false;selectPlayingSong(page);}}
}
let lastSongListPage=null;
function lastSongListRow(){return {label:'Last Song List',action:'last-song-list',detail:preferences.lastSongList?.name||'',branch:true,showDetail:true};}
function rememberSongList(page){
  if(!['songs','playlist'].includes(page.libraryKind))return;
  lastSongListPage=page;
  const source=cleanLastSongList({kind:page.libraryKind,name:page.playlist?.name||'Liked Songs',playlist:page.playlist});
  if(JSON.stringify(source)!==JSON.stringify(preferences.lastSongList))savePreferences({lastSongList:source});
  const home=nav.stack[0],row=home.rows.find(row=>row.action==='last-song-list');if(row)Object.assign(row,lastSongListRow());else home.rows.push(lastSongListRow());
}
function openLastSongList(){
  if(lastSongListPage&&!lastSongListPage.loading){const page=push(lastSongListPage);lastSongListPage=page;nav.rememberMusic();return;}
  const source=preferences.lastSongList;if(source)showLibrary(source.kind,source.playlist);
}
// Returning from Now Playing turns the song list to the playing song, so nobody has to search for it.
// A list that is still loading does this once its songs arrive.
function selectPlayingSong(page=nav.current){
  if(!['songs','playlist'].includes(page?.libraryKind))return false;
  if(page.loading){page.selectPlayingOnLoad=true;return false;}
  const current=page.rows.findIndex(isCurrentSong);if(current<0||current===page.selected)return false;
  page.selected=current;if(nav.current!==page)return true;
  if(preferences.interfaceStyle==='radial')radial.animateTo(current);drawNavigation();return true;
}
let pendingSkipFollow=null;
function followSkippedSong(){
  const pending=pendingSkipFollow,key=demo?'demo:'+index:playback?.item?.uri;
  if(!pending)return;
  if(Date.now()>pending.until||pending.page!==nav.current){pendingSkipFollow=null;return;}
  if(!key||key===pending.key)return;
  pendingSkipFollow=null;
  const page=nav.current;
  if(preferences.interfaceStyle!=='radial'||!['songs','playlist'].includes(page.libraryKind))return;
  const current=page.rows.findIndex(isCurrentSong);if(current<0)return;
  page.selected=current;
  if(visibilityState.invisible||visibilityState.minimized)radial.snapTo(current);
  drawNavigation();
}
function followIdleSong(faded=false){
  const page=nav.current,fade=preferences.visibility;
  // Fully hidden widgets follow the native fade completion, before their next reveal.
  const wait=fade.mode==='idle'?fade.timeout*1000+650:10000;
  const ready=faded||(fade.mode==='idle'&&fade.idleOpacity===0?visibilityState.invisible:Date.now()-lastVisualActivity>=wait);
  if(!preferences.idleFollowSong||preferences.idlePinned||preferences.interfaceStyle!=='radial'||page.kind!=='list'||!['songs','playlist'].includes(page.libraryKind)||page.loading||$('#settings').open||!ready||!(demo?(playing||progress>0):playback?.item))return;
  const key=demo?'demo:'+index:playback?.item?.uri,last=followIdleSong.last;
  if(last?.page===page&&last.rows===page.rows&&last.key===key)return;
  followIdleSong.last={page,rows:page.rows,key};
  const current=page.rows.findIndex(isCurrentSong);if(current<0||current===page.selected)return;
  page.selected=current;radial.animateTo(current);drawNavigation();
}
function showLibrary(kind,playlist) {
  const page=push({title:playlist?.name||(kind==='playlists'?'Playlists':'Liked Songs'),libraryKind:kind,playlist,rows:playlist?[{label:'Play this playlist',action:'play-playlist',playlist}]:[],hint:kind==='playlists'?'Select a playlist to see its songs':demo?'Demo songs · press to play':'Press to play · MENU goes back'});
  nav.rememberMusic();rememberSongList(page);loadLibrary(page);
}
async function showDevices(preferred=false) {
  const page=push({preferred,title:preferred?'Preferred Device':'Playback Device',rows:[{label:'Looking for devices…',disabled:true}]});
  if(demo){page.rows=[{label:'Connect Spotify',action:'connect',branch:true}];drawNavigation();return;}
  try{const data=await api.devices();page.rows=(data.devices||[]).map(d=>({label:d.name,action:preferred?'preferred-device':'device',device:d,disabled:d.is_restricted||!d.id,detail:preferred?(d.id===preferences.preferredDevice?.id?'✓':''):d.is_active?'Active':''}));if(!page.rows.length)page.rows=[{label:'Open Spotify, then refresh',disabled:true}];}
  catch(e){page.rows=[];if(nav.current===page)message(e.message);}
  if(preferred)page.rows.unshift({label:'Automatic',action:'preferred-device',device:null,detail:preferences.preferredDevice?'':'✓'});
  page.rows.push({label:'Refresh devices',action:'refresh-devices'});if(nav.current===page)drawNavigation();
}
function finishSongSelection(){if(preferences.songOpensNowPlaying)showNow();else {drawNavigation();render();}}
async function playRow(row) {
  const sourcePath=nav.rememberMusic();
  if(preferences.keepCurrentSongPosition && isCurrentSong(row)){if(sourcePath)nav.musicPath=sourcePath;finishSongSelection();return;}
  if(demo){demoQueue=row.playlist?.demoIndexes||row.queue||[0,1,2];index=row.demoIndex??demoQueue[0];progress=0;updated=Date.now();playing=true;if(sourcePath)nav.musicPath=sourcePath;finishSongSelection();return;}
  const value=row.action==='play-playlist'?{contextUri:row.playlist.uri}:row.contextUri?{contextUri:row.contextUri,position:row.position}:{uri:row.item.uri};
  // A known song is shown at once; the main process reverts it if Spotify rejects the request.
  if(row.action==='song'&&row.item){value.item=row.item;const request=command('play-item',value);if(sourcePath)nav.musicPath=sourcePath;finishSongSelection();await request;return;}
  if(await command('play-item',value)){if(sourcePath)nav.musicPath=sourcePath;finishSongSelection();}
}
async function selectItem(fromDial=false) {
  wheelFeedback(true);
  noteActivity();
  clickSound();
  if($('#settings').open){const focused=document.activeElement;if(focused?.matches('button,a,summary'))focused.click();return;}
  if(nav.current.kind==='color'){const page=nav.current;if(savePreferences({[page.key]:page.value})){nav.back();const row=nav.current.rows.find(item=>item.key===page.key);if(row)row.detail=radialColorName(page.value);drawNavigation();}return;}
  if(nav.current.kind==='visibility'){const page=nav.current;if(savePreferences(page.key==='radialBackground'?{radialBackground:page.value}:{visibility:{...preferences.visibility,[page.key]:page.value}})){nav.back();const row=nav.current.rows.find(item=>item.key===page.key||(page.key==='radialBackground'&&item.action==='radial-background'));if(row)row.detail=page.value+(page.key==='timeout'?' sec':'%');drawNavigation();}return;}
  if(nav.current.kind==='now'){if(preferences.interfaceStyle==='zune')showZunePlaybackOptions();else returnToSongList();return;}
  if(nav.current.kind!=='list'){menuBack();return;}
  const row=nav.select();if(!row)return;message();
  switch(row.action){
    case 'nav-back':nav.back();drawNavigation();break;
    case 'song-list':returnToSongList();break;
    case 'last-song-list':openLastSongList();break;
    case 'back-now':nav.back();drawNavigation();render();break;
    case 'visibility':showTransparency();break;
    case 'visibility-mode':{const modes=['off','always','idle'];if(savePreferences({visibility:{...preferences.visibility,mode:modes[(modes.indexOf(preferences.visibility.mode)+1)%3]}})){nav.back();showTransparency();}break;}
    case 'visibility-adjust':push({title:row.label,kind:'visibility',visibilitySettings:true,key:row.key,value:preferences.visibility[row.key]});break;
    case 'music':showMusic();break;
    case 'now':showNow();break;
    case 'settings':showSettings();break;
    case 'playlists':showLibrary('playlists');break;
    case 'songs':showLibrary('songs');break;
    case 'playlist':showLibrary('playlist',row.playlist);break;
    case 'song':case 'play-playlist':await playRow(row);break;
    case 'more':case 'retry':await loadLibrary(nav.current,row.offset);break;
    case 'volume':push({title:'Volume',kind:'volume'});break;
    case 'connect':openSettings();break;
    case 'pin':await togglePin();break;
    case 'idle-pin':toggleIdlePin();break;
    case 'current-song':toggleCurrentSongBehavior();break;
    case 'screen-theme':if(savePreferences({screenTheme:preferences.screenTheme==='light'?'dark':'light'})){row.detail=preferences.screenTheme==='dark'?'Dark':'Light';drawNavigation();}break;
    case 'interface':showInterfaces();break;
    case 'radial-color':push({title:row.label,kind:'color',visibilitySettings:true,key:row.key,value:preferences[row.key]});break;
    case 'radial-background':push({title:'Smoky Background',kind:'visibility',visibilitySettings:true,key:'radialBackground',value:preferences.radialBackground});break;
    case 'radial-side':if(savePreferences({radialSide:preferences.radialSide==='left'?'right':'left'})){nav.current.rows.find(item=>item.action==='radial-side').detail=preferences.radialSide==='left'?'Left':'Right';drawNavigation();}break;
    case 'set-interface':if(savePreferences({interfaceStyle:row.style})){nav.back();const setting=nav.current.rows.find(item=>item.action==='interface');if(setting)setting.detail=interfaceName(row.style);if(row.style!=='radial')nav.current.rows=nav.current.rows.filter(item=>!['radial-side','radial-background','radial-color'].includes(item.action));if(row.style==='radial'&&!nav.current.rows.some(item=>item.action==='radial-side'))nav.current.rows.push(...radialSettingsRows());drawNavigation();render();}break;
    case 'case-theme':showCaseThemes();break;
    case 'theme':if(savePreferences({appearance:row.theme})){for(const page of nav.stack){for(const item of page.rows){if(item.action==='case-theme')item.detail=themeName(preferences.appearance);if(item.action==='theme')item.detail=item.theme===preferences.appearance?'✓':'';}}nav.back();drawNavigation();}break;
    case 'playback-preference':if(savePreferences({[row.key]:!preferences[row.key]})){row.detail=preferences[row.key]?'On':'Off';noteActivity();drawNavigation();}break;
    case 'clicker':if(savePreferences({clicker:!preferences.clicker})){row.detail=preferences.clicker?'On':'Off';drawNavigation();}break;
    case 'devices':await showDevices();break;
    case 'refresh-devices':{const preferred=!!nav.current.preferred;nav.back();await showDevices(preferred);break;}
    case 'preferred-devices':await showDevices(true);break;
    case 'preferred-device':if(savePreferences({preferredDevice:row.device?{id:row.device.id,name:row.device.name,type:row.device.type}:null})){nav.back();const setting=nav.current.rows.find(item=>item.action==='preferred-devices');if(setting)setting.detail=preferences.preferredDevice?.name||'Automatic';drawNavigation();}break;
    case 'device':if(await command('device',row.device.id))menuBack();break;
  }
}
const centerClick=new window.CenterClick(()=>selectItem(true),()=>menuBack());
const transportHold=new window.TransportHold(direction=>command(direction>0?'next':'previous'),delta=>{if(!preferences.dialOnlyWake)noteActivity();seek(currentProgress()+delta);});
function hardwareEvent(event){
  const previous=silentHardwareActivity;
  silentHardwareActivity=preferences.dialOnlyWake&&widgetAsleep()&&event.type!=='dial'&&!['center-down','center-up','center-click','select'].includes(event.command)&&event.type!=='wake';
  try{return handleHardwareEvent(event);}finally{silentHardwareActivity=previous;}
}
function handleHardwareEvent(event) {
  if(event.type==='heartbeat')return;
  if(event.type==='wake'){centerClick.cancel();noteActivity();return;}
  if(event.type==='command'&&event.command==='center-down'){wheelFeedback(true);noteActivity();return;}
  if(event.type==='command'&&event.command==='center-click'){noteActivity();centerClick.click();return;}
  if(!(event.type==='command'&&event.command==='touch'))centerClick.flush();
  if(event.type==='dial')return rotate(preferences.reverseDial?-event.delta:event.delta);
  if(event.type!=='command')return;
  const cmd=event.command;
  if(['next-down','previous-down','next-up','previous-up'].includes(cmd)){
    noteActivity();const direction=cmd.startsWith('next')?1:-1;
    return cmd.endsWith('-down')?transportHold.down(direction):transportHold.up(direction);
  }
  if(cmd==='menu-down'){if(preferences.interfaceStyle==='zune')beginZuneBack();else menuBack();return;}
  if(cmd==='menu-up'){if(preferences.interfaceStyle==='zune')endZuneBack();return;}
  if(cmd==='touch'){wheelFeedback(true);noteActivity();return;}
  if(cmd==='select')return selectItem(true);if(cmd==='menu')return menuBack();
  if(cmd==='back'){
    noteActivity();wheelFeedback();clickSound();
    if($('#settings').open){$('#settings').close();return;}
    nav.back();drawNavigation();message();return;
  }
  if(cmd==='volume-up'||cmd==='volume-down')return changeVolume(volume+(cmd==='volume-up'?5:-5));
  if(cmd==='seek-forward'||cmd==='seek-back')return seek(currentProgress()+(cmd==='seek-forward'?10000:-10000));
  command(cmd);
}
document.querySelectorAll('[data-command]').forEach(b=>{
  const direction=b.dataset.command==='next'?1:b.dataset.command==='previous'?-1:0;
  if(!direction){b.addEventListener('click',()=>command(b.dataset.command));return;}
  b.addEventListener('pointerdown',event=>{if(event.button!==0)return;noteActivity();b.setPointerCapture(event.pointerId);transportHold.down(direction);});
  b.addEventListener('pointerup',()=>transportHold.up(direction));
  b.addEventListener('pointercancel',()=>transportHold.cancel());
  b.addEventListener('lostpointercapture',()=>{if(transportHold.direction===direction)transportHold.cancel();});
  b.addEventListener('click',event=>{if(event.detail===0)command(b.dataset.command);});
});
function zuneHome(){noteActivity();nav.goHome();drawNavigation();render();}
function zuneCategory(kind){if(!['playlists','songs'].includes(nav.current.libraryKind))return;nav.back();showLibrary(kind);}
document.querySelectorAll('[data-zune-tab]').forEach(button=>button.onclick=()=>zuneCategory(button.dataset.zuneTab));
function zuneVertical(delta){rotate(nav.current.kind==='now'?-delta:delta);}
$('#zuneUp').onclick=()=>zuneVertical(-1);$('#zuneDown').onclick=()=>zuneVertical(1);$('#zuneSelect').onclick=()=>selectItem();
$('#zunePad').addEventListener('wheel',event=>{event.preventDefault();rotate(event.deltaY>0?1:-1);},{passive:false});
let backTimer,backHeld=false;
function beginZuneBack(){clearTimeout(backTimer);backHeld=false;noteActivity();backTimer=setTimeout(()=>{backHeld=true;zuneHome();},550);}
function endZuneBack(){clearTimeout(backTimer);if(!backHeld)menuBack();}
$('#zuneBack').onpointerdown=event=>{if(event.button!==0)return;$('#zuneBack').setPointerCapture(event.pointerId);beginZuneBack();};
$('#zuneBack').onpointerup=endZuneBack;
$('#zuneBack').onpointercancel=()=>clearTimeout(backTimer);
$('#zuneBack').onclick=event=>{if(event.detail===0)menuBack();};
document.querySelectorAll('[data-zune-direction]').forEach(button=>{
  const direction=Number(button.dataset.zuneDirection);
  const navigate=()=>{if(['playlists','songs'].includes(nav.current.libraryKind)){zuneCategory(nav.current.libraryKind==='playlists'?'songs':'playlists');}else if(direction<0)menuBack();else selectItem();};
  let playbackPress=false;
  button.onpointerdown=event=>{if(event.button!==0)return;button.setPointerCapture(event.pointerId);playbackPress=nav.current.kind==='now';if(playbackPress)transportHold.down(direction);else navigate();};
  button.onpointerup=()=>{if(playbackPress)transportHold.up(direction);playbackPress=false;};
  button.onpointercancel=()=>{transportHold.cancel();playbackPress=false;};
  button.onclick=event=>{if(event.detail===0){if(nav.current.kind==='now')command(direction>0?'next':'previous');else navigate();}};
});
$('#menu').onclick=menuBack;$('#select').onclick=()=>selectItem();$('#connect').onclick=openSettings;
$('.dismiss').onclick=()=>$('#settings').close();
$('#volume').oninput=e=>changeVolume(Number(e.target.value));$('#adjustVolume').oninput=e=>changeVolume(Number(e.target.value));$('#seek').onchange=e=>seek(Number(e.target.value));
$('#wheel').addEventListener('wheel',e=>{e.preventDefault();rotate(e.deltaY>0?1:-1);},{passive:false});
let drag;
const angle = event => {const rect=$('#wheel').getBoundingClientRect();return Math.atan2(event.clientY-rect.top-rect.height/2,event.clientX-rect.left-rect.width/2)*180/Math.PI;};
$('#wheel').addEventListener('pointerdown',event=>{
  if(event.button!==0||event.target.closest('button'))return;
  noteActivity();drag={id:event.pointerId,angle:angle(event),distance:0};$('#wheel').setPointerCapture(event.pointerId);$('#wheel').classList.add('dragging');event.preventDefault();
});
$('#wheel').addEventListener('pointermove',event=>{
  if(!drag||drag.id!==event.pointerId)return;
  const next=angle(event);let delta=next-drag.angle;if(delta>180)delta-=360;if(delta< -180)delta+=360;drag.angle=next;
  drag.distance+=delta;const steps=Math.trunc(drag.distance/18);if(steps){drag.distance-=steps*18;rotate(steps);}
});
function finishDrag(){drag=null;$('#wheel').classList.remove('dragging');}
$('#wheel').addEventListener('pointerup',finishDrag);$('#wheel').addEventListener('pointercancel',finishDrag);$('#wheel').addEventListener('lostpointercapture',finishDrag);
new ResizeObserver(measureVisibleTitles).observe($('.screen'));
document.addEventListener('keydown',e=>{
  if(e.target.closest('dialog')||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
  if([' ','Enter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Backspace','Escape'].includes(e.key))e.preventDefault();
  if(e.key===' '&&!e.repeat)command('toggle');if(e.key==='Enter'&&!e.repeat)selectItem();
  if(e.key==='ArrowUp')preferences.interfaceStyle==='zune'?zuneVertical(-1):rotate(-1);if(e.key==='ArrowDown')preferences.interfaceStyle==='zune'?zuneVertical(1):rotate(1);
  if(preferences.interfaceStyle==='zune'&&!e.shiftKey&&['ArrowLeft','ArrowRight'].includes(e.key)&&['playlists','songs'].includes(nav.current.libraryKind)){zuneCategory(nav.current.libraryKind==='playlists'?'songs':'playlists');return;}
  if(preferences.interfaceStyle==='zune'&&!e.shiftKey&&nav.current.kind!=='now'&&['ArrowLeft','ArrowRight'].includes(e.key)){e.key==='ArrowLeft'?menuBack():selectItem();return;}
  if(e.key==='ArrowLeft')e.shiftKey?seek(currentProgress()-10000):command('previous');
  if(e.key==='ArrowRight')e.shiftKey?seek(currentProgress()+10000):command('next');
  if(e.key==='Escape'||e.key==='Backspace')menuBack();
});
$('#visibilityRange').oninput=event=>{if(nav.current.kind==='visibility'){nav.current.value=Number(event.target.value);drawNavigation();}};
$('#settings').addEventListener('toggle',syncVisibility);
let lastMouseActivity=0;
document.addEventListener('pointermove',()=>{if(preferences.mousePassthrough)return;if(Date.now()-lastMouseActivity>250){lastMouseActivity=Date.now();lastVisualActivity=Date.now();syncGamingMode();api?.activity();}},{passive:true});
document.addEventListener('pointerdown',()=>noteActivity(),{passive:true,capture:true});
document.addEventListener('keydown',()=>noteActivity(),{capture:true});
$('#pin').onclick=togglePin;$('#minimize').onclick=()=>api?.minimize();$('#close').onclick=()=>api?.close();
$('#dashboard').onclick=e=>{if(api){e.preventDefault();api.openExternal(e.currentTarget.href).catch(error=>message(error.message));}};
$('#connectionForm').onsubmit=async e=>{
  e.preventDefault();if(!api)return $('#settingsMessage').textContent='Run npm start to connect Spotify.';
  $('#login').disabled=true;$('#settingsMessage').textContent='Opening Spotify authorization…';
  try{await api.configure($('#clientId').value);await api.login();}catch(error){$('#settingsMessage').textContent=error.message;}finally{$('#login').disabled=false;}
};
$('#logout').onclick=async()=>{try{likedSongs.clear();lastLiked=null;transportHold.cancel();seekControl.reset(0);volumeControl.reset(volume);volumeDeviceId=null;await api?.logout();demo=true;playing=false;progress=0;updated=Date.now();playback=null;nav.reset(root());drawNavigation();$('#settingsMessage').textContent='Disconnected.';render();}catch(e){$('#settingsMessage').textContent=e.message;}};
$('#deviceBtn').onclick=showDevices;
if(api){
  syncRecovery();
  api.pin(preferences.keepOnTop).then(value=>{pinned=value;$('#pin').textContent=pinned?'◆':'◇';$('#pin').setAttribute('aria-pressed',String(pinned));const row=nav.current.rows.find(item=>item.action==='pin');if(row)row.detail=pinned?'On':'Off';drawNavigation();}).catch(error=>message(error.message));
  api.onState(data=>{if(!demo)acceptPlayback(data);});
  api.onAuth(auth=>{if(auth.error){message(auth.error);$('#settingsMessage').textContent=auth.error;return;}if(auth.connected){demo=false;$('#settingsMessage').textContent='Connected.';$('#settings').close();nav.reset(root());drawNavigation();refresh();}else if(!auth.authorizing){demo=true;playing=false;nav.reset(root());drawNavigation();render();}});
  api.onDeviceEvent(hardwareEvent);api.onBridgeError(message);
  api.status().then(auth=>{$('#clientId').value=auth.clientId;if(auth.connected){demo=false;refresh();}drawNavigation();render();}).catch(e=>message(e.message));
  setInterval(async()=>{try{const h=await api.hardware();$('#hardware').textContent=h.pluginOnline?'D100H plugin online':'D100H plugin offline';if(h.error)message(h.error);}catch(e){message(e.message);}},3000);
  api.onVisibility?.(state=>{const wasHidden=visibilityState.invisible||visibilityState.minimized;Object.assign(visibilityState,state);const hidden=visibilityState.invisible||visibilityState.minimized;document.body.dataset.renderSuspended=String(hidden);if(hidden){if(state.invisible&&preferences.visibility.mode==='idle')followIdleSong(true);radial.stop();trackTransition.reset();}else if(wasHidden){renderStamp=null;drawNavigation();render();poll();}});
  poll();document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
}else message('Preview only. Run npm start for Spotify and D100H.');
setInterval(()=>{if(demo&&playing&&!transportHold.direction&&currentProgress()>=duration())command('next');if(idle.tick(!preferences.idlePinned&&preferences.idleNowPlaying&&!$('#settings').open&&!nav.current.loading&&!nav.current.visibilitySettings)){drawNavigation();}followIdleSong();syncGamingMode();renderProgress();},250);
drawNavigation();render();

$('#radial').addEventListener('wheel',event=>{event.preventDefault();rotate(event.deltaY>0?1:-1);},{passive:false});
$('#radial').addEventListener('click',event=>{if(nav.current.kind!=='list'&&event.target.closest('.radial-label'))selectItem();});

$('#radialVolume').oninput=event=>changeVolume(Number(event.target.value));
$('#radialSeek').onchange=event=>{seek(Number(event.target.value));event.target.blur();};
$('#radialSongList').onclick=returnToSongList;



$('#radialHue').oninput=event=>{if(nav.current.kind==='color'){noteActivity();nav.current.value=Number(event.target.value);drawNavigation();}};
$('#radialColorSave').onclick=()=>selectItem();
$('#radialColorCancel').onclick=menuBack;
