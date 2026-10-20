const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname,'../ulanzi-plugin/com.turnbit.spotify.ulanziPlugin');
// Shared turnbit mark; preserve action UUIDs and assignments.
fs.copyFileSync(path.join(__dirname,'../assets/branding/turnbit-64.png'),path.join(dir,'icon.png'));
const names = {pin:'Pin Widget',like:'Like Current Song',shuffle:'Shuffle',repeat:'Repeat',encoder:'Navigation Wheel',toggle:'Play / Pause',previous:'Previous Track',next:'Next Track','volume-up':'Volume Up','volume-down':'Volume Down','seek-back':'Seek Back 10s','seek-forward':'Seek Forward 10s',menu:'Menu / Back'};
const manifest={Name:'turnbit',Author:'turnbit',Description:'Desktop Spotify controller for Ulanzi D100H.',Version:'0.2.0',UUID:'com.turnbit.spotify',Type:'JavaScript',CodePath:'app.html',Icon:'icon.png',Category:'Music',OS:[{Platform:'windows',MinimumVersion:'10'},{Platform:'mac',MinimumVersion:'10.15'}],Software:{MinVersion:'3.0.11'},Actions:Object.entries(names).map(([id,name])=>({Name:name,UUID:`com.turnbit.spotify.${id}`,Icon:'icon.png',Controllers:[id==='encoder'?'Encoder':'Keypad'],Devices:['Dial'],PropertyInspectorPath:'pi/index.html',States:[{Name:'Default',Image:'icon.png'}]}))};
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Ulanzi plugin prepared:',dir);
