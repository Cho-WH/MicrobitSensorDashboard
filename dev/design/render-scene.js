import { Scene, PerspectiveCamera, WebGLRenderer, HemisphereLight, DirectionalLight, SRGBColorSpace, ACESFilmicToneMapping, Vector3 } from '../../public/vendor/three-r180.js';
import { createDeviceScene } from '../../public/assets/devices/scenes.js';
const renderer = new WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setSize(1200,1000); renderer.outputColorSpace=SRGBColorSpace;
renderer.toneMapping=ACESFilmicToneMapping;renderer.toneMappingExposure=1.4;
for (const kind of ['board','usb']) {
  const scene = new Scene(), device = createDeviceScene(kind); scene.add(device.root);
  // Existing geometry and inserted connectors stay unchanged. Only staging changes.
  device.root.rotation.z=-.13;
  scene.add(new HemisphereLight('#e4efff','#23426c',2.8));
  for(const [x,y,z,color,power] of [[-80,100,130,'#fff0dd',4.2],[90,30,-40,'#82b8ff',3.3],[10,-50,80,'#ffc191',1.1]]) {
    const light=new DirectionalLight(color,power);light.position.set(x,y,z);scene.add(light);
  }
  device.root.updateMatrixWorld(true);
  const corners=[], min=new Vector3(Infinity,Infinity,Infinity), max=new Vector3(-Infinity,-Infinity,-Infinity);
  device.root.traverse(node=>{
    if(!node.geometry)return;node.geometry.computeBoundingBox();const box=node.geometry.boundingBox;
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]) {
      const point=new Vector3(x,y,z).applyMatrix4(node.matrixWorld);corners.push(point);min.min(point);max.max(point);
    }
  });
  const center=min.clone().add(max).multiplyScalar(.5);
  const camera=new PerspectiveCamera(30,1.2,2,1000);
  camera.position.copy(center).add(new Vector3(33,28,180));camera.lookAt(center);camera.updateMatrixWorld();
  const extent=Math.max(...corners.map(point=>{const p=point.clone().project(camera);return Math.max(Math.abs(p.x),Math.abs(p.y));}));
  camera.zoom=.85/extent;camera.updateProjectionMatrix();renderer.render(scene,camera);
  const figure=document.createElement('figure'),img=document.createElement('img'),link=document.createElement('a');
  img.id=kind;img.alt=kind==='usb'?'micro:bit V2와 연결된 Micro-B USB 케이블':'micro:bit V2 앞면';
  img.src=renderer.domElement.toDataURL('image/png');link.href=img.src;link.download=`luminous-${kind}.png`;link.textContent=link.download;
  figure.append(img,link);document.querySelector('main').append(figure);
}
renderer.dispose();document.body.dataset.ready='true';
