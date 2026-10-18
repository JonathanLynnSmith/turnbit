// Official Ulanzi HTML SDK owns the Studio WebSocket connection.
// A Studio connection indicates plugin availability, not physical BLE pairing.
const UUID = 'com.turnbit.spotify';
const BRIDGE = 'http://127.0.0.1:4765/device/event';
const actions = new Set(['pin','like','shuffle','repeat','toggle','previous','next','volume-up','volume-down','seek-back','seek-forward','menu']);
const pendingEvents=[];
let sending=false;
function send(event) {
  const tail=pendingEvents[pendingEvents.length-1];
  // Merge only consecutive steps with the same direction and held state.
  // Never combine across a press/release, key action, or reversal.
  if(event.type==='dial'&&tail?.type==='dial'&&tail.held===event.held&&Math.sign(tail.delta)===Math.sign(event.delta)&&Math.abs(tail.delta+event.delta)<=20)tail.delta+=event.delta;
  else pendingEvents.push({...event});
  if(!sending)return drain();
}
async function drain() {
  sending=true;
  try{while(pendingEvents.length){
    const event=pendingEvents.shift();
    try { const response=await fetch(BRIDGE,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event),signal:AbortSignal.timeout(2000)});if(!response.ok)throw new Error(`Bridge HTTP ${response.status}`); }
    catch(error){pendingEvents.length=0;console.warn('[turnbit] Keep the desktop widget running:',error.message);break;}
  }}finally{sending=false;}
}
function action(message) { return (message.uuid || message.context?.split('___')[0] || '').split('.').pop(); }
$UD.onConnected(()=>send({type:'heartbeat'}));
let likeHeld=false,likeReleasedAt=0;
const transportKeys=new Set(['next','previous','menu']);
$UD.onKeyDown(message=>{const command=action(message);if(command==='like'){if(!likeHeld)send({type:'command',command:'like'});likeHeld=true;return;}if(transportKeys.has(command))send({type:'command',command:command+'-down'});else if(actions.has(command))send({type:'command',command:'touch'});});
$UD.onKeyUp(message=>{const command=action(message);if(command==='like'){likeHeld=false;likeReleasedAt=Date.now();return;}if(transportKeys.has(command))send({type:'command',command:command+'-up'});});
$UD.onRun(message=>{const command=action(message);if(command==='like'&&(likeHeld||Date.now()-likeReleasedAt<500))return;if(actions.has(command)&&!transportKeys.has(command))send({type:'command',command});});
let heldRotation=false,dialPressed=false;
$UD.onDialDown(()=>{
  heldRotation=false;dialPressed=true;
  send({type:'command',command:'center-down'});
});
$UD.onDialUp(()=>{
  // Double-click timing belongs in the widget, not Studio's hidden WebView.
  if(dialPressed)send({type:'command',command:'center-up'});
  if(dialPressed&&!heldRotation)send({type:'command',command:'center-click'});
  dialPressed=false;
});
$UD.onDialRotate(message=>{
  const direction=message.rotateEvent; const held=direction==='hold-left'||direction==='hold-right';
  if(held)heldRotation=true;
  if(['left','right','hold-left','hold-right'].includes(direction))send({type:'dial',delta:direction.endsWith('right')?1:-1,held});
});
setInterval(()=>{if($UD.websocket?.readyState===WebSocket.OPEN)send({type:'heartbeat'});else $UD.connect(UUID);},5000);
$UD.connect(UUID);
