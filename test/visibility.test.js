const {test}=require('node:test');
const assert=require('node:assert/strict');
const {VisibilityControl,normalizeVisibility}=require('../src/visibility');
function fixture(){let now=0;const values=[];const control=new VisibilityControl(value=>values.push(value),{now:()=>now});return {control,values,at:value=>{now=value;control.tick();}};}
test('idle fades smoothly after timeout, reaches zero, and input restores immediately',()=>{
  const {control,at}=fixture();control.configure({mode:'idle',idleOpacity:0,timeout:10});
  at(9999);assert.equal(control.opacity,1);at(10000);assert.equal(control.opacity,1);
  at(10325);assert.equal(control.opacity,.5);at(10650);assert.equal(control.opacity,0);
  control.wake();assert.equal(control.opacity,1);at(20649);assert.equal(control.opacity,1);
});
test('fixed opacity stays fixed on activity, off restores solid',()=>{
  const {control,at}=fixture();control.configure({mode:'always',opacity:35});at(650);assert.equal(control.opacity,.35);
  at(100000);control.wake();assert.equal(control.opacity,.35);
  control.configure({mode:'off'});at(100650);assert.equal(control.opacity,1);
});
test('settings protection and unchanged UI redraws do not reset the idle deadline',()=>{
  const {control,at}=fixture(),settings={mode:'idle',idleOpacity:20,timeout:1};
  control.configure(settings);at(900);control.configure(settings);at(1000);at(1650);assert.equal(control.opacity,.2);
  control.configure(settings,true);assert.equal(control.opacity,1);at(100000);assert.equal(control.opacity,1);
  control.configure(settings,false);at(101000);at(101650);assert.equal(control.opacity,.2);
});
test('fixed invisible mode and recovery give a visible grace period',()=>{
  const {control,at}=fixture();control.configure({mode:'always',opacity:0});at(9999);assert.equal(control.opacity,1);
  at(10000);at(10650);assert.equal(control.opacity,0);control.wake();assert.equal(control.opacity,1);
  at(20650);at(21300);assert.equal(control.opacity,0);control.wake(true);assert.equal(control.opacity,1);
});
test('visibility settings clamp bad input',()=>{
  assert.deepEqual(normalizeVisibility({mode:'invalid',opacity:Infinity,idleOpacity:-1,timeout:9000}),{mode:'off',opacity:70,idleOpacity:0,timeout:600});
  assert.deepEqual(normalizeVisibility(null),{mode:'off',opacity:70,idleOpacity:20,timeout:10});
});
