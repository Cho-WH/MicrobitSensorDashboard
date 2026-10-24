import { Group } from '../../vendor/three-r180.js';
import { createMicrobitV2, boardSpec } from './microbit-v2/model.js';
import { createUsbCable } from './usb-micro-b/model.js';
import { createBatteryPack, createBatteryPlug } from './battery-2aaa/model.js';
import { cable } from './shared/cable.js';

// Scene assembly owns placement only. It never connects to hardware or changes lab state.
export function createDeviceScene(kind='board') {
  if(!['board','usb','battery'].includes(kind))throw new Error('Unknown device scene');
  const root=new Group();root.name='device-scene-'+kind;
  const board=createMicrobitV2();root.add(board);
  let connector,pack,leads;
  if(kind==='usb'){connector=createUsbCable();root.add(connector);}
  if(kind==='battery'){
    pack=createBatteryPack();pack.position.set(-72,-1,-1);root.add(pack);
    connector=createBatteryPlug();root.add(connector);leads=new Group();root.add(leads);
  }
  function setSeparation(mm=0){
    const gap=Math.max(0,Math.min(20,Number(mm)||0));
    if(kind==='usb')connector.position.set(0,17.4+gap,boardSpec.ports.usb[2]);
    if(kind==='battery'){
      connector.position.set(-19,17.6+gap,-3.4);
      leads.traverse(o=>o.geometry?.dispose());leads.clear();
      cable(leads,[[-78.5,25,-1],[-80,56,-1],[-20,58+gap,-3.4],[-20,23.4+gap,-3.4]],.63,'#cb4345','positive-lead');
      cable(leads,[[-65.5,25,-1],[-65,49,-1],[-18,50+gap,-3.4],[-18,23.4+gap,-3.4]],.63,'#27343d','negative-lead');
    }
    root.updateMatrixWorld(true);return gap;
  }
  setSeparation();
  return {root,board,connector,pack,setSeparation,
    setCellsVisible(visible){if(pack)pack.getObjectByName('aaa-cells').visible=!!visible;},
  };
}
