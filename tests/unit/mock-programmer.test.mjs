import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockProgrammer } from '../../src/device/mock-programmer.js';

const flush = async () => { for(let i=0;i<5;i++) await Promise.resolve(); };
test('tour installation completes only after selection and progress, and dispose stops unfinished work', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  let allowed=true;
  const states=[];
  const programmer=createMockProgrammer({firmwareId:'example',version:1,canInstall:()=>allowed,
    chooseDevice:async()=>({name:'example'}),onState:state=>states.push(state)});
  await programmer.prepare();
  const install=programmer.install();await flush();
  assert.equal(programmer.getState().installedThisSession,false);
  for(let i=0;i<5;i++){t.mock.timers.tick(400);await flush();}
  await install;
  assert.equal(programmer.getState().installedThisSession,true);
  assert.equal(programmer.getState().busy,false);
  allowed=false;
  await programmer.install();
  assert.equal(programmer.getState().canInstall,false);
  allowed=true;
  const retry=programmer.install();await flush();
  assert.equal(programmer.getState().installedThisSession,false);
  await programmer.dispose();await retry;
  const last=states.length;t.mock.timers.tick(10000);await flush();
  assert.equal(states.length,last);
  assert.equal(programmer.getState().canInstall,false);
});
