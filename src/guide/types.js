/**
 * @typedef {ReturnType<import('../catalog/index.js').getExperiment>} ExperimentContext
 * @typedef {{id:string,group:string,groupLabel:string,title:string,description:string,scope:string,
 * kind:string,action?:string,required:boolean,model?:{view:string,wire:string|null,explosion:number},
 * quickConfirm?:boolean,complete?:boolean,evidence?:string|null}} GuideStep
 * @typedef {{id:string,name:string,help:string}} Equipment
 * @typedef {{id:string,board:string,sensor:string,role:string,description:string}} Wire
 * @typedef {{equipment:Equipment[],equipmentDescription:string,beforeProgram?:GuideStep[],afterConnect?:GuideStep[],
 * wiring?:Wire[],cableHelp?:string,calibrationInstructions?:string[],
 * viewer?:{url:string,title:string,tableCaption:string,boardLabel:string,sensorLabel:string,noteTitle:string,note:string}}} SensorGuide
 * @typedef {{equipment:Equipment[],afterReception:GuideStep[],
 * setupImage?:{src:string,alt:string,caption:string},
 * experimentGuide?:typeof import('../catalog/activities/gay-lussac/content.js').experimentGuide}} ActivityGuide
 * @typedef {{status?:string,busy?:boolean,progress?:number|null,message?:string,deviceName?:string}} ProgramState
 * @typedef {{attemptId?:number|string,connected?:boolean,connecting?:boolean,receptionReady?:boolean,
 * receivedAt?:number|null,latest?:{values:Record<string,number|null>,validity:Record<string,string>}|null,
 * calibration?:string,firmwareInstalled?:ExperimentContext['firmware']|false,programmerState?:ProgramState,
 * busy?:boolean,recording?:boolean,mock?:boolean,canInstall?:boolean,canConnect?:boolean,
 * canReconnect?:boolean,deviceMessage?:string,deviceName?:string,unsupported?:boolean}} GuideFacts
 * @typedef {{onInstall?:()=>unknown,onConnect?:(options:{reuseDevice:boolean})=>unknown,
 * onDisconnect?:()=>unknown,onChange?:(progress:ReturnType<ReturnType<import('./progress.js').createGuideProgress>['getState']>)=>void,
 * onMeasure?:()=>unknown,onError?:(message:string)=>void,
 * viewerOptions?:Parameters<import('./viewer-adapter.js').createViewerAdapter>[2]}} GuideCallbacks
 */
export {};
