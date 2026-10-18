const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fitWindow, readWindowState, writeWindowState } = require('../src/window-state');

test('saved windows fit a smaller or disconnected display, including negative monitor coordinates', () => {
  assert.deepEqual(fitWindow({ x:2000,y:-900,width:1600,height:1200 }, { x:-1280,y:24,width:1280,height:776 }), { x:-1280,y:24,width:1280,height:776 });
  assert.deepEqual(fitWindow({ x:-900,y:80,width:600,height:520 }, { x:-1280,y:24,width:1280,height:776 }), { x:-900,y:80,width:600,height:520 });
});

test('window state migrates the original mode file and discards malformed placements', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'turnbit-state-'));
  t.after(() => fs.rmSync(dir,{recursive:true,force:true}));
  const file = path.join(dir,'window-mode.json');
  fs.writeFileSync(file,JSON.stringify({enabled:true}));
  assert.deepEqual(readWindowState(file),{enabled:true,bounds:{}});
  const radial = {x:10,y:40,width:960,height:720};
  writeWindowState(file,{enabled:false,bounds:{radial,ipod:{x:null,y:0,width:-1,height:710}}});
  assert.deepEqual(readWindowState(file),{enabled:false,bounds:{radial}});
  fs.writeFileSync(file,'{broken');
  assert.deepEqual(readWindowState(file),{enabled:false,bounds:{}});
});
