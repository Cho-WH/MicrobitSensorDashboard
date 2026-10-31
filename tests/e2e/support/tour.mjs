import { expect } from '@playwright/test';

export async function chooseTourDevice(page) {
  const dialog=page.getByRole('dialog',{name:'연결할 micro:bit 선택'});
  await dialog.getByRole('radio').check();
  await dialog.getByRole('button',{name:'연결',exact:true}).click();
  await expect(dialog).toBeHidden();
}

// Persistence tests use the real app/storage path and replace only native hardware.
export async function installSimulatedHardware(context,sensor) {
  await context.route('**/tests/fixtures/bluetooth-diagnostics.mjs',route=>route.fulfill({contentType:'application/javascript',path:'tests/fixtures/bluetooth-diagnostics.mjs'}));
  await context.addInitScript(sensor=>{
    const pending=Promise.all([import('/tests/fixtures/bluetooth-diagnostics.mjs'),import('/src/catalog/index.js')])
      .then(async ([{bluetoothFixture},{getExperiment,getSensorRuntime}])=>{
        const fixture=bluetoothFixture(),runtime=getSensorRuntime(getExperiment(sensor));
        let timer=null;
        const stopStreaming=()=>{clearInterval(timer);timer=null;};
        const startStreaming=(lineAt=runtime.mockLine)=>{
          stopStreaming();timer=setInterval(()=>{if(fixture.state.uartSubscribed)fixture.line(lineAt(performance.now())+'\n');},runtime.definition.firmware.sampleIntervalMs);
        };
        const preparation=runtime.preparation?.createMock({emit:line=>fixture.line(line+'\n'),startStreaming,stopStreaming,timers:globalThis});
        if(preparation){
          const uart=await fixture.server.getPrimaryService('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
          const tx=(await uart.getCharacteristics()).find(characteristic=>characteristic.properties.write);
          const write=tx.writeValueWithResponse;
          tx.writeValueWithResponse=async bytes=>{await write(bytes);preparation.command(new TextDecoder().decode(bytes).trim());};
        }else setInterval(()=>{
          if(fixture.state.uartSubscribed&&fixture.writes.includes(runtime.definition.firmware.startCommand+'\n'))
            fixture.line(runtime.mockLine(performance.now())+'\n');
        },runtime.definition.firmware.sampleIntervalMs);
        return fixture;
      });
    sessionStorage.setItem('sensor-lab:last-device','test-device-only');
    Object.defineProperty(navigator,'bluetooth',{configurable:true,value:{
      requestDevice:()=>pending.then(f=>f.device),getDevices:()=>pending.then(f=>[f.device]),
    }});
  },sensor);
}
