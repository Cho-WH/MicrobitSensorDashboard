import { Scene, Group, PerspectiveCamera, WebGLRenderer, HemisphereLight, DirectionalLight, Vector3, SRGBColorSpace, ACESFilmicToneMapping } from '../../public/vendor/three-r180.js';
import { createDeviceScene } from '../../public/assets/devices/scenes.js';
import { createExpansionBoard, createBmp280, addJumperEnd } from '../../public/assets/devices/bmp280/model.js';
import { cable } from '../../public/assets/devices/shared/cable.js';

// Derived images only: geometry stays in the shared device factories.
const width=1440;
const renderer=new WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.outputColorSpace=SRGBColorSpace;
renderer.toneMapping=ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
renderer.setClearColor('#edf1eb',0);
for(const kind of ['board','usb','battery','bmp280','expansion-board','jumper-wires']){
  const height=kind==='board'?600:900;renderer.setSize(width,height);
  const scene=new Scene(),root=new Group();scene.add(root);
  scene.add(new HemisphereLight('#ffffff','#a2aea4',2.6));
  for(const [x,y,z,color,power] of [[-70,100,-130,'#ffffff',3.3],[80,10,110,'#d7eaff',2.4],[-20,-80,-40,'#ffe2bb',.9]]){
    const light=new DirectionalLight(color,power);light.position.set(x,y,z);scene.add(light);
  }
  const factories={bmp280:createBmp280,'expansion-board':createExpansionBoard,'jumper-wires':createJumperWires};
  const asset=factories[kind]?{root:factories[kind]()} : createDeviceScene(kind);root.add(asset.root);
  if(kind==='board'){
    asset.root.position.x=-30;
    const front=createDeviceScene('board').root;front.rotation.y=Math.PI;front.position.x=30;root.add(front);
  }
  root.updateMatrixWorld(true);
  const corners=[],min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);
  root.traverse(node=>{
    if(!node.geometry)return;
    node.geometry.computeBoundingBox();const box=node.geometry.boundingBox;
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
      const point=new Vector3(x,y,z).applyMatrix4(node.matrixWorld);corners.push(point);min.min(point);max.max(point);
    }
  });
  const camera=new PerspectiveCamera(32,width/height,2,1000);
  const center=min.clone().add(max).multiplyScalar(.5);
  camera.position.copy(center).add(new Vector3(-18,kind==='board'?22:55,factories[kind]?200:-200));camera.lookAt(center);camera.updateMatrixWorld();
  // Fit projected corners, leaving consistent margins without cropping plugs or wires.
  const extent=Math.max(...corners.map(point=>{const p=point.clone().project(camera);return Math.max(Math.abs(p.x),Math.abs(p.y));}));
  camera.zoom=.9/extent;camera.updateProjectionMatrix();
  renderer.render(scene,camera);
  const figure=document.createElement('figure'),img=document.createElement('img'),link=document.createElement('a');
  img.id=kind;img.alt=kind;img.src=renderer.domElement.toDataURL('image/png');
  link.href=img.src;link.download=`${kind}.png`;link.textContent=`${kind}.png 저장`;
  figure.append(img,link);document.querySelector('main').append(figure);
}
renderer.dispose();

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
