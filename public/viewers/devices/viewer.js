import { Scene, PerspectiveCamera, WebGLRenderer, HemisphereLight, DirectionalLight, OrbitControls, Vector3, SRGBColorSpace, ACESFilmicToneMapping } from '../../vendor/three-r180.js';
import { createDeviceScene } from '../../assets/devices/scenes.js';
import { boardSpec } from '../../assets/devices/microbit-v2/model.js';

const $=id=>document.getElementById(id), stage=$('stage');
const descriptions={
  board:{chapter:'01 / 본체',title:'micro:bit V2',description:'작은 보드 뒷면에 소리, 움직임, 자기장을 다루는 부품들이 모여 있어요.',fact:'V2의 앞면과 뒷면',detail:'앞면에는 버튼과 LED, 뒷면에는 주요 회로와 USB·배터리 단자가 있어요.'},
  usb:{chapter:'02 / USB',title:'USB 데이터 케이블',description:'작은 Micro-B 단자를 보드 위쪽의 USB 소켓에 연결해요. 다른 쪽은 컴퓨터의 USB 단자에 꽂아요.',fact:'데이터 전송이 가능한 케이블',detail:'프로그램을 설치하려면 데이터 전송이 가능한 케이블이 필요해요. 충전 전용인지 외형만으로 구분하기는 어려워요.',note:'슬라이더로 커넥터를 분리해 단자의 모양과 연결 방향을 살펴보세요.'},
  battery:{chapter:'03 / 배터리',title:'AAA 두 개, 3 V',description:'열린 케이스 안에 1.5 V AAA 전지 두 개가 직렬로 놓여 있어요. 빨강·검정 전선을 따라 배터리 단자까지 살펴보세요.',fact:'1.5 V + 1.5 V = 3 V',detail:'전지의 +와 − 방향을 케이스 표시와 맞춰요. 스프링은 전지의 평평한 −극에 닿아요.',note:'USB와 다른 흰색 배터리 커넥터예요. 단자의 모양과 방향을 맞춰 연결해요.'},
};
let renderer,controls,scene,camera,current,kind='board',view='back';
const models=new Map();
try {
  renderer=new WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.outputColorSpace=SRGBColorSpace;renderer.toneMapping=ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
  renderer.setClearColor('#edf1eb',0);stage.append(renderer.domElement);renderer.domElement.tabIndex=0;
  renderer.domElement.setAttribute('aria-label','3D 장치. 방향키로 회전, +와 −로 확대·축소, Home으로 시점 초기화');renderer.domElement.setAttribute('role','img');
  scene=new Scene();scene.add(new HemisphereLight('#ffffff','#a2aea4',2.6));
  for(const [x,y,z,color,power] of [[-70,100,-130,'#ffffff',3.3],[80,10,110,'#d7eaff',2.4],[-20,-80,-40,'#ffe2bb',.9]]){const l=new DirectionalLight(color,power);l.position.set(x,y,z);scene.add(l);}
  // Keep depth precision sufficient for thin PCB copper even in the wide battery view.
  camera=new PerspectiveCamera(32,1,2,1000);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.minDistance=25;controls.maxDistance=500;controls.addEventListener('change',render);
  const resize=new ResizeObserver(()=>{const {width,height}=stage.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();render();});resize.observe(stage);
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();$('error').hidden=false;});
  renderer.domElement.addEventListener('keydown',e=>{
    const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'];if(!keys.includes(e.key))return;e.preventDefault();
    if(e.key==='Home')setView(kind==='board'?'back':'iso');else if(['+','=','-'].includes(e.key))zoom(e.key==='-'?1.15:.87);
    else {const offset=camera.position.clone().sub(controls.target);const axis=new Vector3(...(e.key==='ArrowLeft'||e.key==='ArrowRight'?[0,1,0]:[1,0,0]));offset.applyAxisAngle(axis,['ArrowLeft','ArrowUp'].includes(e.key)?.12:-.12);camera.position.copy(controls.target).add(offset);controls.update();render();}
  });
  $('loading').hidden=true;selectScene('board');document.body.dataset.ready='true';
  window.addEventListener('pagehide',event=>{if(event.persisted)return;resize.disconnect();controls.dispose();const geometries=new Set(),materials=new Set(),textures=new Set();for(const asset of models.values())asset.root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});for(const m of materials){if(m.map)textures.add(m.map);m.dispose();}textures.forEach(t=>t.dispose());geometries.forEach(g=>g.dispose());renderer.dispose();});
} catch(error){$('loading').hidden=true;$('error').hidden=false;document.body.dataset.ready='error';console.error(error);for(const b of document.querySelectorAll('button,input'))b.disabled=true;}

function render(){if(renderer&&scene&&camera)renderer.render(scene,camera);}
function zoom(factor){camera.position.sub(controls.target).multiplyScalar(factor).clampLength(controls.minDistance,controls.maxDistance).add(controls.target);controls.update();render();}
function setView(next){
  view=next;const center=kind==='battery'?[-30,8,0]:kind==='usb'?[14,13,0]:[0,0,0];
  let offset;
  if(next==='ports'){controls.target.set(-8,19,-3);offset=[-20,50,-65];}
  else {controls.target.set(...center);const distance=kind==='board'?125:kind==='usb'?190:225;
    offset=next==='front'?[0,0,distance]:next==='back'?[0,0,-distance]:[-distance*.3,distance*.38,-distance*.85];}
  camera.position.copy(controls.target).add(new Vector3(...offset));controls.update();
  for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===next));
  for(const b of document.querySelectorAll('[data-part]'))b.setAttribute('aria-pressed','false');
  $('view-label').textContent={front:'앞면 · 버튼과 LED',back:'뒷면 · 주요 부품',ports:'USB · 배터리 단자',iso:'전체 모습 · 연결 위치'}[next];render();
}
function selectScene(next){
  kind=next;if(current)current.root.visible=false;
  if(!models.has(next)){const asset=createDeviceScene(next);models.set(next,asset);scene.add(asset.root);}
  current=models.get(next);current.root.visible=true;current.setSeparation(0);current.setCellsVisible(true);$('separation').value='0';$('cells').checked=true;
  const d=descriptions[next];$('chapter').textContent=d.chapter;$('scene-title').textContent=d.title;$('scene-description').textContent=d.description;
  $('fact-title').textContent=d.fact;$('fact-description').textContent=d.detail;$('connection-note').textContent=d.note??'';
  $('parts').hidden=next!=='board';$('connection').hidden=next==='board';$('cells-control').hidden=next!=='battery';
  for(const b of document.querySelectorAll('[data-scene]'))b.setAttribute('aria-pressed',String(b.dataset.scene===next));
  setView(next==='board'?'back':'iso');
}
for(const b of document.querySelectorAll('[data-scene]'))b.addEventListener('click',()=>selectScene(b.dataset.scene));
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>setView(b.dataset.view));
for(const b of document.querySelectorAll('[data-part]'))b.addEventListener('click',()=>{
  controls.target.set(...boardSpec.parts[b.dataset.part]);camera.position.copy(controls.target).add(new Vector3(0,12,-65));controls.update();
  for(const other of document.querySelectorAll('[data-part]'))other.setAttribute('aria-pressed',String(other===b));
  for(const v of document.querySelectorAll('[data-view]'))v.setAttribute('aria-pressed','false');$('view-label').textContent=b.querySelector('span').firstChild.textContent;render();
});
$('separation').addEventListener('input',e=>{current.setSeparation(e.target.value);render();});
$('cells').addEventListener('change',e=>{current.setCellsVisible(e.target.checked);render();});
$('zoom-in').addEventListener('click',()=>zoom(.85));$('zoom-out').addEventListener('click',()=>zoom(1.18));$('reset').addEventListener('click',()=>setView(kind==='board'?'back':'iso'));
$('save-image').addEventListener('click',()=>{render();renderer.domElement.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`microbit-v2-${kind}-${view}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});});
