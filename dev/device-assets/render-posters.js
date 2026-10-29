import { Scene, Group, PerspectiveCamera, WebGLRenderer, HemisphereLight, DirectionalLight, Vector3, SRGBColorSpace, ACESFilmicToneMapping } from '../../public/vendor/three-r180.js';
import { createDeviceScene } from '../../public/assets/devices/scenes.js';
import { boardSpec } from '../../public/assets/devices/microbit-v2/model.js';
import { createBmp280 } from '../../public/assets/devices/bmp280/model.js';
import { createExpansionBoard } from '../../public/assets/devices/sensorbit/model.js';
import { addJumperEnd } from '../../public/assets/devices/shared/connectors.js';
import { cable } from '../../public/assets/devices/shared/cable.js';
import { createProbe } from '../../public/assets/devices/ds18b20/model.js';
import { createTerminalAdapter } from '../../public/assets/devices/terminal-3p/model.js';
import { modelBounds } from '../../public/assets/devices/shared/bounds.js';

// Derived images only: geometry stays in the shared device factories.
const width=1440;
// Coordinates use the board factory's front-facing axes, not rear.js local axes.
const sensorViews={
  'sensor-temperature':{point:boardSpec.parts.processor,radius:5.4},
  'sensor-motion':{point:boardSpec.parts.motion,radius:2.4},
  'sensor-light':{point:[0,-1,2],radius:13,front:true},
};
const renderer=new WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.outputColorSpace=SRGBColorSpace;
renderer.toneMapping=ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
renderer.setClearColor('#edf1eb',0);
const requested = new URLSearchParams(location.search).get('only')?.split(',');
for(const kind of ['board','usb','battery','reset','bmp280','expansion-board','jumper-wires','ds18b20','terminal-3p',...Object.keys(sensorViews)].filter(id=>!requested||requested.includes(id))){
  const sensorView=sensorViews[kind];
  const height=sensorView?1100:['board','reset'].includes(kind)?600:900;renderer.setSize(width,height);
  const scene=new Scene(),root=new Group();scene.add(root);
  scene.add(new HemisphereLight('#ffffff','#a2aea4',2.6));
  for(const [x,y,z,color,power] of [[-70,100,-130,'#ffffff',3.3],[80,10,110,'#d7eaff',2.4],[-20,-80,-40,'#ffe2bb',.9]]){
    const light=new DirectionalLight(color,power);light.position.set(x,y,z);scene.add(light);
  }
  const factories={bmp280:createBmp280,'expansion-board':createExpansionBoard,'jumper-wires':createJumperWires,'ds18b20':createProbe,'terminal-3p':createTerminalAdapter};
  const asset=factories[kind]?{root:factories[kind]()} : createDeviceScene(kind==='reset'||sensorView?'board':kind);root.add(asset.root);
  if(kind==='board'){
    asset.root.position.x=-30;
    const front=createDeviceScene('board').root;front.rotation.y=Math.PI;front.position.x=30;root.add(front);
  }
  const {corners,min,max}=modelBounds(root);
  const camera=new PerspectiveCamera(32,width/height,2,1000);
  const center=min.clone().add(max).multiplyScalar(.5);
  // Frame only the rear USB, reset switch and battery socket, not the whole board.
  if(kind==='reset'){
    center.set(-9,15,-2);
    corners.length=0;
    for(const x of [-26,8])for(const y of [8,22])for(const z of [-7,0])corners.push(new Vector3(x,y,z));
  }
  camera.position.copy(center).add(sensorView?new Vector3(24,28,sensorView.front?200:-200):kind==='reset'?new Vector3(42,55,-200):new Vector3(-18,kind==='board'?22:55,factories[kind]?200:-200));camera.lookAt(center);camera.updateMatrixWorld();
  // Fit projected corners, leaving consistent margins without cropping plugs or wires.
  const extent=Math.max(...corners.map(point=>{const p=point.clone().project(camera);return Math.max(Math.abs(p.x),Math.abs(p.y));}));
  camera.zoom=(kind==='reset'?.82:sensorView?.78:.9)/extent;camera.updateProjectionMatrix();
  renderer.render(scene,camera);
  const figure=document.createElement('figure'),img=document.createElement('img'),link=document.createElement('a');
  img.id=kind;img.alt=kind;
  let output=renderer.domElement;
  if(kind==='reset'||sensorView){
    // The shared V2 model places its rear reset switch at (-10, 17.2, -2.7).
    // Project the actual location so the callout follows this render's camera.
    output=document.createElement('canvas');output.width=width;output.height=height;
    const ctx=output.getContext('2d');ctx.drawImage(renderer.domElement,0,0);
    const target=sensorView?new Vector3(...sensorView.point):new Vector3(-10,17.2,-3.3);
    const point=target.clone().applyMatrix4(asset.root.matrixWorld).project(camera);
    const x=(point.x+1)*width/2,y=(1-point.y)*height/2;
    const edge=target.clone().add(new Vector3(sensorView?.radius??3.1,0,0)).applyMatrix4(asset.root.matrixWorld).project(camera);
    const radius=Math.abs(edge.x-point.x)*width/2;
    // White edging keeps the orange callout clear on both dark PCB and metal.
    for(const [color,lineWidth] of [['#ffffff',18],['#f5783c',10]]){
      ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.stroke();
    }
    const tip=sensorView?{x:x+radius+16,y}:{x,y:y+radius+16};
    const tail=sensorView?{x:Math.min(width-70,tip.x+210),y:Math.min(height-60,y+220)}:{x:x-120,y:Math.min(height-60,y+radius+280)};
    const angle=Math.atan2(tip.y-tail.y,tip.x-tail.x),head=54;
    const path=()=>{
      ctx.beginPath();ctx.moveTo(tail.x,tail.y);ctx.lineTo(tip.x,tip.y);
      ctx.moveTo(tip.x-head*Math.cos(angle-.55),tip.y-head*Math.sin(angle-.55));
      ctx.lineTo(tip.x,tip.y);ctx.lineTo(tip.x-head*Math.cos(angle+.55),tip.y-head*Math.sin(angle+.55));
    };
    ctx.lineCap='round';ctx.lineJoin='round';
    for(const [color,lineWidth] of [['#ffffff',30],['#f5783c',18]]){ctx.strokeStyle=color;ctx.lineWidth=lineWidth;path();ctx.stroke();}
  }
  img.src=output.toDataURL('image/png');
  link.href=img.src;link.download=`${kind}.png`;link.textContent=`${kind}.png 저장`;
  figure.append(img,link);document.querySelector('main').append(figure);
}
renderer.dispose();

// The compass fallback is the first pose of the actual demonstration, with the same camera.
if(!requested||requested.includes('calibration')){
const {createCalibrationScene}=await import('../../src/catalog/sensors/magnetometer/calibration-scene.js');
const calibrationCanvas=document.createElement('canvas'), calibration=createCalibrationScene(calibrationCanvas);
calibration.resize(720,540);calibration.render(0);
const calibrationFigure=document.createElement('figure'), calibrationImage=document.createElement('img'), calibrationLink=document.createElement('a');
calibrationImage.id='calibration';calibrationImage.alt='보정 시범 시작 자세';calibrationImage.src=calibrationCanvas.toDataURL('image/png');
calibrationLink.href=calibrationImage.src;calibrationLink.download='calibration.png';calibrationLink.textContent='calibration.png 저장';
calibrationFigure.append(calibrationImage,calibrationLink);document.querySelector('main').append(calibrationFigure);calibration.dispose();
}

function createJumperWires(){
  const group=new Group();
  for(const [index,color] of ['#e34b55','#354255','#d69b08','#008bb7'].entries()){
    const x=(index-1.5)*9;
    cable(group,[[x,-12,0],[x-3,-6,1],[x+3,6,1],[x,12,0]],.65,color,`jumper-${index}`);
    addJumperEnd(group,new Vector3(x,-20,0),true,index,'source',color).rotation.x=-Math.PI/2;
    addJumperEnd(group,new Vector3(x,20,0),false,index,'target',color).rotation.x=Math.PI/2;
  }
  return group;
}
