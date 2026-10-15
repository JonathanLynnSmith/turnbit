const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('dial bursts coalesce without losing steps or crossing command and direction boundaries',async()=>{
  const handlers={},events=[];let release;
  const ud={connect:()=>{}};
  for(const name of ['onConnected','onKeyDown','onKeyUp','onRun','onDialDown','onDialUp','onDialRotate'])ud[name]=fn=>{handlers[name]=fn;};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../ulanzi-plugin/com.ulanzi.dialpod.ulanziPlugin/app.js'),'utf8'),{
    $UD:ud,fetch:async(_,options)=>{events.push(JSON.parse(options.body));if(events.length===1)await new Promise(resolve=>{release=resolve;});return {ok:true};},AbortSignal,WebSocket:{OPEN:1},setTimeout,clearTimeout,setInterval:()=>{},console
  });
  for(let i=0;i<35;i++)handlers.onDialRotate({rotateEvent:'right'});
  handlers.onKeyDown({uuid:'com.ulanzi.ulanzistudio.dialpod.menu'});handlers.onKeyUp({uuid:'com.ulanzi.ulanzistudio.dialpod.menu'});
  handlers.onDialRotate({rotateEvent:'left'});handlers.onDialRotate({rotateEvent:'hold-left'});
  assert.equal(events.length,1);release();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(events.map(event=>event.command||event.delta),[1,20,14,'menu-down','menu-up',-1,-1]);
  assert.equal(events.at(-2).held,false);assert.equal(events.at(-1).held,true);
});

