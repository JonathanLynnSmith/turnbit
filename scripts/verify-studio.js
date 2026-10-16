// Live cross-application check: requires Studio --webRemoteDebug and
// DialPod --remote-debugging-port=9223. Does not issue playback commands.
async function connect(port,match) {
  const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target=targets.find(item=>match(item.url));if(!target)throw new Error(`Debug target missing on ${port}`);
  const ws=new WebSocket(target.webSocketDebuggerUrl);let nextId=0;const pending=new Map();
  ws.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.id){const cb=pending.get(data.id);pending.delete(data.id);data.error?cb.reject(data.error):cb.resolve(data.result);}});
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  return {close:()=>ws.close(),evaluate:async expression=>{
    const result=await new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));});
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result.value;
  }};
}
async function main() {
  const widget=await connect(9223,url=>url.includes('/renderer/index.html'));
  const studio=await connect(9292,url=>url.includes('com.ulanzi.dialpod.ulanziPlugin/app.html'));
  const delay=()=>new Promise(resolve=>setTimeout(resolve,200));
  const snapshot=await widget.evaluate('JSON.stringify(nav.stack)');
  try{
    await widget.evaluate('nav.reset(root());drawNavigation();');
    const before=await (await fetch('http://127.0.0.1:4765/device/state')).json();
    await studio.evaluate(`$UD.emit('dialrotate',{uuid:'com.ulanzi.ulanzistudio.dialpod.encoder',rotateEvent:'right'});`);await delay();
    if(!await widget.evaluate(`nav.current.selected===1 && document.querySelector('.menurow.selected').textContent.includes('Now Playing')`))throw new Error('Studio dial event did not change widget selection');
    await studio.evaluate(`$UD.emit('dialup',{uuid:'com.ulanzi.ulanzistudio.dialpod.encoder'});`);await delay();
    if(!await widget.evaluate(`nav.current.kind==='now'`))throw new Error('Studio dial press did not select');
    await studio.evaluate(`$UD.emit('run',{uuid:'com.ulanzi.ulanzistudio.dialpod.menu'});`);await delay();
    if(!await widget.evaluate(`nav.current.title==='turnbit' && nav.current.selected===1`))throw new Error('Studio Menu key did not return');
    const after=await (await fetch('http://127.0.0.1:4765/device/state')).json();
    if(after.eventCount<before.eventCount+3)throw new Error('Expected three real WebView-to-widget bridge events');
    console.log('Live Studio → installed plugin → packaged widget: navigation, selection, Menu passed. Plugin online:',after.pluginOnline);
  }finally{await widget.evaluate(`nav.stack=${snapshot};drawNavigation();`);widget.close();studio.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
