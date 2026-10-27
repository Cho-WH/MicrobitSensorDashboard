/**
 * @typedef {ReturnType<import('../catalog/index.js').getExperiment>} ExperimentContext
 * @typedef {{id:string,group:string,groupLabel:string,title:string,description:string,scope:string,
 * kind:string,action?:string,required:boolean,model?:{view:string,wire:string|null,explosion:number},
 * instructions?:string[],quickConfirm?:boolean,complete?:boolean,evidence?:string|null}} GuideStep
 * @typedef {{id:string,name:string,help:string}} Equipment
 * @typedef {{src:string,alt:string}} GuideImage
 * @typedef {{equipment:Record<string,GuideImage>,usb:GuideImage,battery:GuideImage}} DeviceIllustrations
 * @typedef {{id:string,board:string,sensor:string,role:string,description:string}} Wire
 * @typedef {{label:string,title:string,image:string|null,alt:string,caption:string,instructions:string[][],flow?:string[][],caution?:string}} ExperimentGuidePage
 * @typedef {{id:string,version:number,title:string,label?:string,buttonLabel?:string,pages:ExperimentGuidePage[]}} ExperimentGuide
 * @typedef {{equipment:Equipment[],equipmentDescription:string,beforeProgram?:GuideStep[],afterConnect?:GuideStep[],experimentGuide?:ExperimentGuide,
 * wiring?:Wire[],cableHelp?:string,calibrationInstructions?:string[],illustrations?:DeviceIllustrations,
 * viewer?:{url:string,title:string,tableCaption:string,boardLabel:string,sensorLabel:string,noteTitle:string,note:string}}} SensorGuide
 * @typedef {{equipment:Equipment[],afterReception:GuideStep[],
 * setupImage?:{src:string,alt:string,caption:string},
 * experimentGuide?:ExperimentGuide}} ActivityGuide
 * @typedef {{mode?:string,usbRequired?:boolean,status?:string,phase?:string,busy?:boolean,progress?:number|null,message?:string,deviceName?:string}} ProgramState
 * @typedef {{attemptId?:number|string,connected?:boolean,connecting?:boolean,receptionReady?:boolean,
 * receivedAt?:number|null,latest?:{values:Record<string,number|null>,validity:Record<string,string>}|null,
 * calibration?:string,devicePreparation?:{phase:string,calibration:string,allowReadings:boolean}|null,firmwareInstalled?:ExperimentContext['firmware']|false,programmerState?:ProgramState,
 * busy?:boolean,recording?:boolean,mock?:boolean,canInstall?:boolean,canConnect?:boolean,
 * canReconnect?:boolean,deviceMessage?:string,deviceName?:string,unsupported?:boolean}} GuideFacts
 * @typedef {{onInstall?:()=>unknown,onInstallMode?:(mode:string)=>unknown,onCancelInstall?:()=>unknown,onConnect?:(options:{reuseDevice:boolean})=>unknown,
 * onDisconnect?:()=>unknown,onChange?:(progress:ReturnType<ReturnType<import('./progress.js').createGuideProgress>['getState']>)=>void,
 * onMeasure?:()=>unknown,onDeviceAction?:(action:string)=>unknown,onError?:(message:string)=>void,
 * viewerOptions?:Parameters<import('./viewer-adapter.js').createViewerAdapter>[2]}} GuideCallbacks
 */
export {};
