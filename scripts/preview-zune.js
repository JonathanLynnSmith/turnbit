// Isolated, offline visual check of both Zune screen modes.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path');
app.disableHardwareAcceleration();
app.setPath('userData',path.join(app.getPath('temp'),'turnbit-zune-preview'));
process.env.TURNBIT_BRIDGE_PORT='4768';require('../src/main');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
  try{
    await wait(1000);const window=BrowserWindow.getAllWindows()[0];
    for(const screen of ['light','dark']){
      await window.webContents.executeJavaScript(`savePreferences({appearance:'${screen==='dark'?'black':'silver'}',interfaceStyle:'zune',screenTheme:'${screen}'});nav.reset(root());showNow();`);
      await wait(400);
      const fits=await window.webContents.executeJavaScript(`(()=>{const screen=document.querySelector('.screen').getBoundingClientRect(),artist=document.querySelector('#artist').getBoundingClientRect();return artist.bottom<screen.bottom-6 && artist.height>0;})()`);
      if(!fits)throw new Error('Zune playback controls overflow: '+screen);
      fs.writeFileSync(path.join(__dirname,`../artifacts/turnbit-zune-now-${screen}.png`),(await window.webContents.capturePage()).toPNG());
      await window.webContents.executeJavaScript(`nav.reset(root());drawNavigation();`);await wait(300);fs.writeFileSync(path.join(__dirname,`../artifacts/turnbit-zune-home-${screen}.png`),(await window.webContents.capturePage()).toPNG());
    }
    for(const size of [[360,700],[460,700]]){window.setSize(...size);await wait(300);const fits=await window.webContents.executeJavaScript(`(()=>{const screen=document.querySelector('.screen').getBoundingClientRect(),pad=document.querySelector('#zuneControls').getBoundingClientRect(),footer=document.querySelector('footer').getBoundingClientRect();return pad.top>screen.bottom && pad.bottom<footer.top && footer.bottom<innerHeight;})()`);if(!fits)throw new Error('Zune body overflows at '+size.join('x'));}
    await window.webContents.executeJavaScript(`savePreferences({interfaceStyle:'ipod'});nav.reset(root());drawNavigation();`);await wait(250);
    const restored=await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('#wheel')).display!=='none' && getComputedStyle(document.querySelector('#zuneControls')).display==='none' && document.querySelector('.screen').getBoundingClientRect().height===270`);if(!restored)throw new Error('iPod body did not restore');
    console.log('Zune Light/Dark visual bounds, body sizes, and iPod restoration passed.');app.quit();
  }catch(error){console.error(error);app.exit(1);}
});
