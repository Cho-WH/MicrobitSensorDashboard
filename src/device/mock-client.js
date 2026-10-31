// A simulated BLE boundary. Decoding, timing and readiness use the real Transport.
import { getSensorRuntime, getActivityTour } from '../catalog/index.js';
import { createSampleReplay, prepareSampleFrames } from './sample-replay.js';

/** @param {()=>ReturnType<import('../catalog/index.js').getExperiment>} getContext
 * @param {{timers?:any,now?:()=>number,chooseDevice?:(device:any)=>Promise<any>,cancelChoice?:()=>void,connectionDelay?:()=>number,getPlayback?:()=>{state:string,key:string}|null,onReplayEnd?:()=>void,onReplayNote?:(note:string)=>void}} options */
export function createMockBleClient(getContext, { timers = globalThis, now = () => performance.now(),
  chooseDevice = device => Promise.resolve(device), cancelChoice = () => {}, connectionDelay = () => 0,
  getPlayback = () => null, onReplayEnd = () => {}, onReplayNote = () => {} } = {}) {
  let notify = null, timer = null, preparation = null;
  let connecting = null;
  let replay=null,replayKey='';
  function stopStreaming() { timers.clearInterval(timer); timer = null; }
  function startStreaming(lineAt = null) {
    if (timer !== null) return;
    const context=getContext(), runtime = getSensorRuntime(context), firmware = runtime.definition.firmware;
    const tour=getPlayback()?getActivityTour(context):null;
    const line = lineAt ?? tour?.lineAt ?? runtime.mockLine;
    const key=`${context.sensor.id}@${context.sensor.version}/${context.activity?.id??''}@${context.activity?.version??''}`;
    if(getPlayback() && (!replay||replayKey!==key||lineAt)) {
      const frames=prepareSampleFrames(line,firmware.sampleIntervalMs,tour?.durationMs);
      if(replay&&replayKey===key)replay.replaceFrames(frames);
      else replay=createSampleReplay(frames,(tour?.notes??[]).map(({atMs,note})=>({frameIndex:Math.round(atMs/firmware.sampleIntervalMs),note})));
      replayKey=key;
    }
    timer = timers.setInterval(() => {
      const playback=getPlayback();
      if(playback&&replay){
        const next=replay.read(playback);notify?.(next.frame);
        for(const note of next.notes??[])onReplayNote(note);
        if(next.ended)onReplayEnd();
      }
      else notify?.(line(now()));
    }, firmware.sampleIntervalMs);
  }
  const device = { name: 'BBC micro:bit [LAB]' };
  return {
    isSupported: () => true,
    requestDevice: () => chooseDevice(device),
    async connect() {
      const delay=connectionDelay();
      if(delay)await new Promise((resolve,reject)=>{
        const timer=timers.setTimeout(()=>{connecting=null;resolve(undefined);},delay);
        connecting=()=>{timers.clearTimeout(timer);connecting=null;reject(new DOMException('연결을 취소했어요.','AbortError'));};
      });
      preparation?.dispose();
      preparation = getSensorRuntime(getContext()).preparation?.createMock({emit:line=>notify?.(line),startStreaming,stopStreaming,timers}) ?? null;
    },
    async startNotifications(handler) { notify = handler; },
    setDisconnectedListener() {},
    async sendStartCommand(command) {
      if (preparation) preparation.command(command); else startStreaming();
    },
    async disconnect() { cancelChoice();connecting?.();preparation?.dispose(); preparation = null; stopStreaming(); notify = null; },
  };
}
