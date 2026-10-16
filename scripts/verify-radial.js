const {app,BrowserWindow,screen}=require('electron');
const path=require('node:path'),assert=require('node:assert/strict'),fs=require('node:fs');
app.disableHardwareAcceleration();app.setPath('userData',path.join(app.getPath('temp'),'dialpod-radial-test'));
process.env.DIALPOD_BRIDGE_PORT='4771';require('../src/main');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
  try{
    await wait(1200);const window=BrowserWindow.getAllWindows()[0],js=code=>window.webContents.executeJavaScript(code);
    const errors=[];window.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
    const command=async payload=>{const r=await fetch('http://127.0.0.1:4771/device/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});assert.equal(r.status,204);await wait(100);};
    const turn=delta=>command({type:'dial',delta}),select=()=>command({type:'command',command:'select'}),back=()=>command({type:'command',command:'menu'});
    const check=async code=>assert.equal(await js(code),true,code);
    await js(`savePreferences({visibility:{mode:'off',opacity:70,idleOpacity:20,timeout:10},interfaceStyle:'ipod',radialSide:'left',radialBackground:24,idlePinned:false,keepOnTop:false,primaryHue:360,accentHue:145});nav.reset(root());showSettings();nav.current.selected=nav.current.rows.findIndex(row=>row.action==='interface');drawNavigation();`);
    await js(`pinned=false;api.pin(false);`);
    await select();await turn(-1);await select();await wait(400);
    await check(`preferences.interfaceStyle==='radial' && getComputedStyle(document.querySelector('.ipod')).display==='none' && getComputedStyle(document.querySelector('#radial')).display==='block'`);
    const leftBounds=window.getBounds(),leftArea=screen.getDisplayMatching(leftBounds).bounds;assert.equal(leftBounds.x,leftArea.x);assert.equal(leftBounds.y,leftArea.y);assert.equal(leftBounds.height,leftArea.height);
    await js(`nav.reset(root());drawNavigation();`);const settingsRow=await js(`nav.current.rows.findIndex(r=>r.action==='settings')`);await turn(settingsRow-1);await wait(60);
    await check(`radial.position>1 && radial.position<${settingsRow}`);await wait(500);
    await check(`radial.position===${settingsRow} && document.querySelector('#radial-item-${settingsRow}').getAttribute('aria-selected')==='true'`);
    await select();await turn(10);await select();await wait(400);
    await check(`preferences.radialSide==='right' && document.body.dataset.edge==='right'`);
    const bounds=window.getBounds(),area=screen.getDisplayMatching(bounds).bounds;assert.equal(bounds.x+bounds.width,area.x+area.width);
    await js(`nav.reset(root());showLibrary('songs');`);await wait(400);await turn(1);
    await check(`radial.nodes.get(2).lastChild.textContent==='turnbit demo · 3:07'`);
    await js(`nav.current.rows[2].item.artists=[{name:'First artist'},{name:'Second artist'}];drawNavigation();`);
    await check(`radial.nodes.get(2).lastChild.textContent==='First artist, Second artist · 3:07'`);
    await js(`delete nav.current.rows[2].item.artists;drawNavigation();`);await select();
    await check(`nav.current.kind==='now' && index===1 && playing`);
    await wait(350);
    await check(`(()=>{const host=document.querySelector('#radial').getBoundingClientRect(),bar=document.querySelector('#radialSeek').getBoundingClientRect(),text=document.querySelector('.radial-track').getBoundingClientRect(),art=document.querySelector('.radial-art').getBoundingClientRect();return Math.abs(bar.left-host.left-30)<2 && Math.abs(text.left-bar.left)<2 && Math.abs(art.right-bar.right)<2 && bar.width>370;})()`);
    await check(`!document.querySelector('#radialNow').hidden && document.querySelector('#radialLabels').hidden && document.querySelector('#radialTitle').textContent==='A Little Further' && Number(document.querySelector('#radialSeek').max)===187000 && document.querySelector('#radialDuration').textContent==='3:07'`);
    await js(`command('next');`);
    await check(`document.querySelectorAll('.radial-now-snapshot').length===1 && document.querySelector('.radial-now-snapshot .radial-title').textContent==='A Little Further' && document.querySelector('#radialTitle').textContent==='Sunday Morning'`);
    await wait(110);await check(`Number(getComputedStyle(document.querySelector('#radialNow .radial-track')).opacity)>0 && Number(getComputedStyle(document.querySelector('#radialNow .radial-track')).opacity)<1 && getComputedStyle(document.querySelector('#radialNow .radial-volume')).opacity==='1'`);
    await wait(450);await check(`document.querySelectorAll('.radial-now-snapshot').length===0`);
    await js(`command('next');command('next');command('previous');`);await wait(500);
    await check(`document.querySelectorAll('.radial-now-snapshot').length===0 && document.querySelector('#radialTitle').textContent===demos[index].name && document.querySelectorAll('#radialTitle').length===1`);
    await js(`trackTransition.reducedMotion=()=>true;command('next');`);await check(`document.querySelectorAll('.radial-now-snapshot').length===0`);
    await js(`trackTransition.reducedMotion=()=>reducedMotion.matches;index=1;render();`);await wait(450);
    await js(`document.querySelector('#radialVolume').value=64;document.querySelector('#radialVolume').dispatchEvent(new Event('input'));`);await check(`volume===64 && document.querySelector('#radialVolumeValue').textContent==='64%'`);
    await js(`document.querySelector('#radialSeek').value=30000;document.querySelector('#radialSeek').dispatchEvent(new Event('change'));`);await check(`currentProgress()>=30000 && currentProgress()<32000`);
    await js(`window.savedDemo=demo;demo=false;playback={item:{name:'Artwork check',artists:[{name:'Test artist'}],duration_ms:187000,album:{name:'Test album',images:[{url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#37665c"/></svg>')}]}}};render();`);
    await check(`!document.querySelector('#radialArt').hidden && document.querySelector('#radialArt').src===document.querySelector('#art').src && document.querySelector('#radialTitle').textContent==='Artwork check'`);
    await js(`demo=true;playback=null;volume=50;render();`);
    await turn(1);await check(`volume===52`);await select();await check(`nav.current.libraryKind==='songs'`);
    await check(`document.querySelectorAll('.radial-label.has-mini').length===1 && radial.nodes.get(2).classList.contains('has-mini') && radial.nodes.get(2).querySelector('.mini-times').lastChild.textContent==='3:07' && !radial.nodes.get(2).querySelector('small').textContent.includes('Playing')`);
    await check(`getComputedStyle(radial.nodes.get(2).children[0]).fontSize===getComputedStyle(radial.nodes.get(1).children[0]).fontSize && getComputedStyle(radial.nodes.get(2).children[0]).display!=='none' && radial.nodes.get(2).querySelector('.mini-cover').offsetHeight===62 && getComputedStyle(radial.nodes.get(2).querySelector('.mini-times')).display!=='none'`);
    await check(`getComputedStyle(radial.nodes.get(2).querySelector('.mini-info small')).display==='none' && Math.abs(radial.nodes.get(2).querySelector('.mini-info').getBoundingClientRect().right-radial.nodes.get(2).firstChild.getBoundingClientRect().right)<2`);
    await check(`Math.abs(radial.nodes.get(2).querySelector('.mini-info').getBoundingClientRect().left-radial.nodes.get(2).firstChild.getBoundingClientRect().left)<2 && radial.nodes.get(2).querySelector('.mini-times').getBoundingClientRect().top>radial.nodes.get(2).querySelector('.mini-progress').getBoundingClientRect().bottom`);
    await js(`window.savedMiniTitle=nav.current.rows[2].label;window.savedMiniWidth=radial.nodes.get(2).querySelector('.mini-progress').getBoundingClientRect().width;nav.current.rows[2].label='A very long song title that should scroll smoothly without changing the playback timeline width';drawNavigation();`);
    await check(`radial.nodes.get(2).firstChild.classList.contains('scrolling-title') && Math.abs(radial.nodes.get(2).querySelector('.mini-progress').getBoundingClientRect().width-window.savedMiniWidth)<2`);
    await check(`getComputedStyle(radial.nodes.get(2).firstChild.firstChild).animationDirection==='normal' && radial.nodes.get(2).firstChild.querySelector('[aria-hidden=true]').textContent===nav.current.rows[2].label`);
    await js(`playing=false;nav.current.selected=1;drawNavigation();`);
    await check(`!radial.nodes.get(2).firstChild.classList.contains('scrolling-title')`);
    await js(`nav.current.selected=2;drawNavigation();`);
    await check(`radial.nodes.get(2).firstChild.classList.contains('scrolling-title')`);
    await js(`playing=true;drawNavigation();`);
    await js(`nav.current.rows[2].label=window.savedMiniTitle;drawNavigation();`);
    await js(`playing=false;render();`);await check(`radial.nodes.get(2).querySelector('.radial-mini small').textContent.includes('Paused')`);
    await js(`playing=true;command('next');`);await check(`!radial.nodes.get(2).classList.contains('has-mini') && radial.nodes.get(3).classList.contains('has-mini') && document.querySelectorAll('.radial-label.has-mini').length===1`);
    await js(`index=1;progress=42000;updated=Date.now();render();`);await wait(300);
    try{fs.writeFileSync(path.join(__dirname,'../artifacts/dialpod-song-list-mini.png'),(await window.webContents.capturePage()).toPNG());}catch{}

    // Large libraries retain only the nearby labels and keep exact selection.
    await js(`push({title:'Long library',rows:Array.from({length:1000},(_,i)=>({label:'Song '+i,action:'placeholder'}))});`);
    for(let i=0;i<12;i++)await turn(20);await wait(600);
    await check(`nav.current.selected===241 && radial.position===241 && radial.nodes.size<=2*Math.ceil(radial.reach)+5`);
    await back();await js(`showSettings();nav.current.selected=nav.current.rows.findIndex(row=>row.action==='interface');drawNavigation();`);await select();await turn(1);await select();
    await check(`preferences.interfaceStyle==='ipod' && !nav.current.rows.some(row=>row.action==='radial-side')`);
    await js(`savePreferences({interfaceStyle:'radial',radialSide:'left'});nav.reset(root());push({title:'Playlists',rows:['After Hours','Night Drive','On Repeat','Discover Weekly','Daily Mix 01','Liked Songs','Release Radar','Focus','Sunday Morning','Slow Days','New discoveries'].map(label=>({label,action:'placeholder'})),selected:5});`);await wait(700);
    await check(`getComputedStyle(document.body).backgroundColor==='rgba(0, 0, 0, 0)' && getComputedStyle(document.querySelector('.radial-label')).backgroundColor==='rgba(0, 0, 0, 0)'`);
    await js(`radial.reducedMotion=()=>true;rotate(1);`);await check(`radial.position===nav.current.selected`);await js(`radial.reducedMotion=()=>reducedMotion.matches;rotate(-1);`);await wait(500);
    await check(`(()=>{const bounds=document.querySelector('#radialLabels').getBoundingClientRect(),selected=radial.nodes.get(nav.current.selected).getBoundingClientRect(),next=radial.nodes.get(nav.current.selected+1).getBoundingClientRect();return Math.abs(bounds.top+bounds.height/2-innerHeight/2)<1 && Math.abs(selected.top+selected.height/2-innerHeight/2)<2 && Math.abs((next.top+next.height/2)-(selected.top+selected.height/2)-76)<2;})()`);
    await wait(200);
    const hazeImage=await window.webContents.capturePage(),hazeSize=hazeImage.getSize(),pixels=hazeImage.toBitmap();
    const alpha=x=>pixels[(Math.floor(hazeSize.height/2+40*hazeSize.width/window.getBounds().width)*hazeSize.width+Math.floor(x*hazeSize.width/window.getBounds().width))*4+3];
    const bottomAlpha=pixels[((hazeSize.height-2)*hazeSize.width+Math.floor(100*hazeSize.width/window.getBounds().width))*4+3];assert.ok(bottomAlpha>=50,'Smoke must remain visible at the bottom edge');
    
    const lowerCurveAlpha=pixels[((hazeSize.height-2)*hazeSize.width+Math.floor(650*hazeSize.width/window.getBounds().width))*4+3];assert.ok(alpha(650)>45 && lowerCurveAlpha<15,'Fade must bow inward at center and narrow at the bottom');
    const hazeSamples=[490,600,800,1000].map(alpha);console.log('Smoke alpha at/past text:',hazeSamples);
    assert.ok(hazeSamples[1]>=50,'Haze must retain strength at least 100px beyond the text');
    assert.ok(hazeSamples[2]>5 && hazeSamples[2]<hazeSamples[1],'Haze fades gradually across the extended region');
    assert.ok(hazeSamples[3]<5,'Far edge must blend to transparent');
    await js(`showNow();progress=42000;updated=Date.now();render();`);await wait(400);
    // Composite over a neutral desktop solely for a legible review artifact.
    await js(`document.documentElement.style.background='#9da9b1';`);
    try{const image=await Promise.race([window.webContents.capturePage(),wait(6000).then(()=>{throw Error('capture timeout');})]);fs.writeFileSync(path.join(__dirname,'../artifacts/dialpod-radial-now.png'),image.toPNG());}catch(error){console.warn('Screenshot unavailable:',error.message);}
    const shot=async name=>{try{const image=await Promise.race([window.webContents.capturePage(),wait(5000).then(()=>{throw Error('capture timeout');})]);fs.writeFileSync(path.join(__dirname,'../artifacts',name),image.toPNG());}catch(error){console.warn('Screenshot unavailable:',error.message);}};
    await js(`nav.back();drawNavigation();`);await wait(350);await shot('dialpod-radial-polished-menu.png');
    await js(`savePreferences({radialSide:'right'});showNow();`);await wait(400);await shot('dialpod-radial-polished-right.png');
    await check(`getComputedStyle(document.querySelector('#radialContext')).textAlign==='right' && getComputedStyle(document.querySelector('#radialNow')).right==='72px'`);
    await js(`savePreferences({radialSide:'left'});`);
    await js(`nav.reset(root());showSettings();nav.current.selected=nav.current.rows.findIndex(row=>row.action==='radial-background');drawNavigation();`);
    await select();await turn(16);await check(`nav.current.value===40 && preferences.radialBackground===24 && document.querySelector('#radial').style.getPropertyValue('--smoke-opacity')==='0.4'`);
    await back();await check(`preferences.radialBackground===24 && document.querySelector('#radial').style.getPropertyValue('--smoke-opacity')==='0.24'`);
    await select();await turn(-20);await turn(-4);await select();await check(`preferences.radialBackground===0 && document.querySelector('#radial').style.getPropertyValue('--smoke-opacity')==='0'`);
    window.webContents.reload();await wait(1200);await check(`preferences.interfaceStyle==='radial' && preferences.radialSide==='left' && preferences.radialBackground===0`);
    await js(`savePreferences({radialBackground:24});`);
    await js(`pinned=false;savePreferences({keepOnTop:false});api.pin(false);`);await wait(200);
    await js(`showSettings();nav.current.selected=nav.current.rows.findIndex(row=>row.action==='pin');drawNavigation();`);await select();
    await wait(400);assert.equal(window.isAlwaysOnTop(),true,JSON.stringify(await js(`({pinned,keep:preferences.keepOnTop,page:nav.current.title,selected:nav.current.selected,row:nav.current.rows[nav.current.selected],message:document.querySelector('#message').textContent})`)));await check(`preferences.keepOnTop && nav.current.rows.find(row=>row.action==='pin').detail==='On'`);
    window.webContents.reload();await new Promise(resolve=>window.webContents.once('did-finish-load',resolve));await wait(400);assert.equal(window.isAlwaysOnTop(),true,JSON.stringify(await js(`({pinned,keep:preferences.keepOnTop,page:nav.current.title,stored:localStorage.getItem('dialpod-preferences')})`)));await check(`preferences.keepOnTop && pinned`);
    await js(`showSettings();nav.current.selected=nav.current.rows.findIndex(row=>row.action==='pin');drawNavigation();`);await select();await wait(400);assert.equal(window.isAlwaysOnTop(),false);await check(`!preferences.keepOnTop`);
    await js(`nav.current.selected=nav.current.rows.findIndex(row=>row.key==='accentHue');drawNavigation();`);await select();
    await check(`nav.current.kind==='color' && nav.current.value===145 && !document.querySelector('#radialColor').hidden && nav.current.visibilitySettings`);
    await turn(20);await check(`nav.current.value===165 && preferences.accentHue===145 && document.querySelector('#radial').style.getPropertyValue('--radial-accent')==='hsl(165 75% 68%)'`);
    await back();await check(`preferences.accentHue===145 && document.querySelector('#radial').style.getPropertyValue('--radial-accent')==='hsl(145 75% 68%)'`);
    await select();await turn(20);await select();await check(`nav.current.title==='Settings' && preferences.accentHue===165`);
    await js(`nav.current.selected=nav.current.rows.findIndex(row=>row.key==='primaryHue');drawNavigation();`);await select();await turn(1);
    await check(`nav.current.value===0 && preferences.primaryHue===360`);await select();await check(`preferences.primaryHue===0`);
    window.webContents.reload();await new Promise(resolve=>window.webContents.once('did-finish-load',resolve));await wait(400);await check(`preferences.primaryHue===0 && preferences.accentHue===165`);
    await js(`nav.reset(root());showLibrary('songs');`);await wait(200);await js(`index=1;playing=true;render();`);await wait(100);
    await check(`getComputedStyle(radial.nodes.get(2).children[0]).color!==getComputedStyle(radial.nodes.get(1).children[0]).color && radial.nodes.get(2).classList.contains('has-mini')`);
    await js(`showSettings();nav.current.selected=nav.current.rows.findIndex(row=>row.key==='accentHue');drawNavigation();`);await select();await wait(300);
    try{fs.writeFileSync(path.join(__dirname,'../artifacts/dialpod-color-picker.png'),(await window.webContents.capturePage()).toPNG());}catch{}
    await back();await js(`savePreferences({primaryHue:360,accentHue:145});drawNavigation();`);
    await check(`!nav.current.rows.some(row=>row.action==='background-blur') && !('backgroundBlur' in window.dialpod)`);
    await js(`demo=true;nav.reset(root());render();`);
    await command({type:'command',command:'like'});await check(`document.querySelector('#actionNotice').textContent.includes('Liked Songs') && !document.querySelector('#actionNotice').hidden && nav.current.kind==='list'`);
    await command({type:'command',command:'shuffle'});await check(`demoShuffle && document.querySelector('#actionNotice').textContent==='Shuffle on'`);
    await command({type:'command',command:'shuffle'});await check(`!demoShuffle`);
    for(const mode of ['context','track','off']){await command({type:'command',command:'repeat'});await check(`demoRepeat==='${mode}'`);}
    await js(`showNow();render();`);await check(`document.querySelector('#radialNow [data-mode=like]').dataset.active==='true'`);
    await command({type:'command',command:'like'});await check(`document.querySelector('#radialNow [data-mode=like]').dataset.active==='false' && nav.current.kind==='now'`);
    await js(`demo=false;playback={item:{uri:'spotify:track:aaaaaaaaaaaaaaaaaaaaaa',name:'Indicator check',artists:[{name:'Artist'}],album:{name:'Album'},duration_ms:200000},liked:true,shuffle_state:true,repeat_state:'track'};render();`);
    await check(`document.querySelectorAll('#radialNow .playback-indicators [data-active=true]').length===3 && getComputedStyle(document.querySelector('#radialNow .repeat-one')).display!=='none'`);
    await wait(600);try{fs.writeFileSync(path.join(__dirname,'../artifacts/dialpod-playback-icons.png'),(await window.webContents.capturePage()).toPNG());}catch{}
    await js(`savePreferences({keepOnTop:false,idlePinned:false});pinned=false;api.pin(false);`);
    await command({type:'command',command:'pin'});await wait(400);assert.equal(window.isAlwaysOnTop(),false);await check(`preferences.idlePinned&&!preferences.keepOnTop&&!pinned`);
    await js(`savePreferences({idleNowPlaying:true,visibility:{mode:'idle',opacity:70,idleOpacity:0,timeout:1}});nav.reset(root());idle.lastActivity=Date.now()-11000;drawNavigation();lastMouseActivity=Date.now()+60000;`);await wait(2200);
    assert.ok(window.getOpacity()>.99);await check(`nav.current.kind==='list'`);
    await command({type:'command',command:'pin'});await wait(400);assert.equal(window.isAlwaysOnTop(),false);await check(`!preferences.idlePinned&&!preferences.keepOnTop&&!pinned`);
    await wait(2200);assert.equal(window.getOpacity(),0);
    await js(`savePreferences({visibility:{mode:'off',opacity:70,idleOpacity:20,timeout:10}});`);

    assert.deepEqual(errors,[]);console.log('Radial interface selection, curved animation, mirrored docking, Spotify demo navigation, volume, large-library bounds, switching and persistence passed.');app.quit();
  }catch(error){console.error(error);app.exit(1);}
});
