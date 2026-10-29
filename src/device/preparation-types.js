/**
 * Optional, locally registered sensor preparation contract. Transport owns the
 * connection lifetime; a sensor session owns its protocol and readiness gate.
 * reconnecting is explicit user-flow intent, independent of chooser/device reuse.
 * @typedef {{phase:string,calibration:string,allowReadings:boolean,requiredStep?:string|null}} PreparationState
 * @typedef {{getState:()=>PreparationState,start:()=>void,accept:(input:any)=>void,
 * act:(action:string)=>Promise<boolean>,dispose:()=>void}} PreparationSession
 * @typedef {{supports:(step:any)=>boolean,handlesProgression:(id:string)=>boolean,
 * describe:(facts:import('../guide/types.js').GuideFacts)=>{phase:string,stepId:string,title:string,description:string,hideValues:boolean},
 * render:(facts:import('../guide/types.js').GuideFacts,visible:boolean)=>void,dispose:()=>void}} PreparationView
 * @typedef {{createSession:(options:{send:(command:string)=>Promise<any>,onChange:(state:PreparationState)=>void,onError:(message:string)=>void,timers:any,reconnecting?:boolean})=>PreparationSession,
 * createMock:(options:{emit:(line:string)=>void,startStreaming:()=>void,stopStreaming:()=>void,timers:any})=>{command:(command:string)=>void,dispose:()=>void},
 * createView:(host:HTMLElement,callbacks:{onAction:(action:string)=>void})=>PreparationView}} SensorPreparation
 */
export {};
