// Inspect only the local turnbit plugin WebView through Studio's debug API.
async function main() {
  const targets=await (await fetch('http://127.0.0.1:9292/json/list')).json();
  const target=targets.find(item=>item.url.includes('com.turnbit.spotify.ulanziPlugin/app.html'));
  if(!target)throw new Error('turnbit main service is not loaded in Studio.');
  const ws=new WebSocket(target.webSocketDebuggerUrl);let nextId=0;const pending=new Map();
  const errors=new Set();
  ws.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.id){const handlers=pending.get(data.id);pending.delete(data.id);data.error?handlers.reject(data.error):handlers.resolve(data.result);}else if(data.method==='Log.entryAdded'){const entry=data.params.entry;if(entry.level==='error'&&!errors.has(entry.text)&&errors.size<5){errors.add(entry.text);console.log('Plugin error:',entry.text);}}else if(data.method==='Runtime.exceptionThrown')console.log('Plugin exception:',JSON.stringify(data.params.exceptionDetails));});
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  await call('Log.enable');await call('Runtime.enable');
  const expression=process.argv[2]||`JSON.stringify({sdk:typeof $UD,location:location.href,port:typeof $UD==='object'?$UD.port:null,uuid:typeof $UD==='object'?$UD.uuid:null,socketState:typeof $UD==='object'?$UD.websocket?.readyState:null,fetch:typeof fetch,timeout:typeof AbortSignal.timeout})`;
  const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});console.log('Inspection:',JSON.stringify(result));
  await new Promise(resolve=>setTimeout(resolve,1000));ws.close();
}
main().catch(error=>{console.error(error);process.exitCode=1;});
