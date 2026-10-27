// V2.21 photo-referenced educational model. Dimensions in mm; front +Z, top +Y.
// Front geometry and sockets adapted from the existing BMP280 wiring model.
import { Group, Mesh, Shape, Path, ShapeGeometry, ExtrudeGeometry, PlaneGeometry, MeshBasicMaterial, CanvasTexture } from '../../../vendor/three-r180.js';
import { material, box, disc, label, addBoardPorts } from '../shared/legacy-primitives.js';
import { addRearDetails } from './rear.js';
import { contactLayout } from './contact-layout.js';

export const boardSpec = Object.freeze({ version:'2.21', width:51.6, height:42, thickness:1.6,
  ports:{ usb:[0,21.3,-2.15], battery:[-19,21,-3.4] },
  parts:{ processor:[13.4,4.2,-1.6], motion:[17.1,-8.9,-1.6], speaker:[0,1,-3.6], microphone:[7.2,10.7,-1.6], interface:[-15.2,3.3,-1.6] } });
const pinX=contactLayout.x,pinY=contactLayout.y;
const gold=material('#d4b567',.72,.3), silver=material('#b7c4cc',.78,.28), ink=material('#171d24',.08,.65);
const ledPanels=new WeakMap();
let ledGlowTexture;
function glowTexture() {
  if(ledGlowTexture)return ledGlowTexture;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
  const context=canvas.getContext('2d'), gradient=context.createRadialGradient(16,16,2,16,16,16);
  gradient.addColorStop(0,'rgba(255,255,255,.8)');gradient.addColorStop(.35,'rgba(255,255,255,.45)');
  gradient.addColorStop(.7,'rgba(255,255,255,.12)');gradient.addColorStop(1,'rgba(255,255,255,0)');
  context.fillStyle=gradient;context.fillRect(0,0,32,32);
  ledGlowTexture=new CanvasTexture(canvas);return ledGlowTexture;
}

/** Set one front LED: column/row 0–4 from the top left, brightness 0–1. */
export function setMicrobitLed(board,column,row,brightness=1) {
  if(!Number.isInteger(column)||!Number.isInteger(row)||column<0||column>4||row<0||row>4)return;
  const entry=ledPanels.get(board)?.[row*5+column];
  if(!entry)return;
  const {led,glow}=entry;
  const level=Number.isFinite(brightness)?Math.max(0,Math.min(1,brightness)):0;
  if(led.userData.brightness===level)return;
  led.userData.brightness=level;
  led.material.emissive.set('#ff6b73');led.material.emissiveIntensity=level*2.5;
  glow.visible=level>0;glow.material.opacity=Math.sqrt(level)*.9;
}

function pcbOutline() {
  const s=new Shape(); s.moveTo(-24.2,-21);
  for (const x of pinX) {s.lineTo(x-1.7,-21);s.quadraticCurveTo(x,-18.7,x+1.7,-21);}
  s.lineTo(24.2,-21);s.quadraticCurveTo(25.8,-21,25.8,-19.4);s.lineTo(25.8,18);
  s.quadraticCurveTo(25.8,21,22.8,21);s.lineTo(-22.8,21);s.quadraticCurveTo(-25.8,21,-25.8,18);
  s.lineTo(-25.8,-19.4);s.quadraticCurveTo(-25.8,-21,-24.2,-21);
  // The PCB bore is slightly wider than the plated contact bore. No coincident walls.
  for(const x of pinX){const h=new Path();h.absarc(x,pinY,contactLayout.radius+.06,0,Math.PI*2,true);s.holes.push(h);} return s;
}
function copperPad(parent,x) {
  const {bottom,padHalfWidth:half,padOuterRadius:radius}=contactLayout;
  const joinAngle=Math.acos(half/radius),joinY=pinY-Math.sqrt(radius*radius-half*half);
  const s=new Shape();s.moveTo(x-half,bottom);s.lineTo(x-1.7,bottom);s.quadraticCurveTo(x,bottom+2.3,x+1.7,bottom);
  // Equal-width, vertical stems. The circular head joins at the same height on both sides.
  s.lineTo(x+half,bottom);s.lineTo(x+half,joinY);s.absarc(x,pinY,radius,-joinAngle,Math.PI+joinAngle,false);s.closePath();
  const h=new Path();h.absarc(x,pinY,contactLayout.radius,0,Math.PI*2,true);s.holes.push(h);
  // A single solid includes front/rear copper and the plated hole wall.
  // The former 0.02 mm-separated faces flickered at distant, oblique camera angles.
  const geometry=new ExtrudeGeometry(s,{depth:1.8,bevelEnabled:false,curveSegments:40});geometry.translate(0,0,-.9);
  const mesh=new Mesh(geometry,gold);mesh.name='plated-edge-contact';parent.add(mesh);
}
function fineContact(parent,x,column){
  const {fingerWidth:width,bottom,fingerTop:top,columnCount}=contactLayout;
  if(column!==0&&column!==columnCount-1){
    const mesh=box(parent,width,top-bottom,1.8,x,(top+bottom)/2,0,gold);mesh.name='edge-finger';return;
  }
  // Only the two outer strips follow the PCB's rounded corner; all interior ends share a baseline.
  const sign=Math.sign(x),left=Math.abs(x)-width/2,right=Math.abs(x)+width/2;
  const cornerY=px=>{
    const t=1-Math.sqrt(Math.max(0,1-(px+.06-24.2)/1.6));
    return -21+1.6*t*t+.06;
  };
  const s=new Shape();s.moveTo(left,top);s.lineTo(left,cornerY(left));
  for(let i=1;i<=16;i++){const px=left+(right-left)*i/16;s.lineTo(px,cornerY(px));}
  s.lineTo(right,top);s.closePath();
  const geometry=new ExtrudeGeometry(s,{depth:1.8,bevelEnabled:false});geometry.translate(0,0,-.9);
  const mesh=new Mesh(geometry,gold);mesh.name='edge-finger-corner';
  if(sign<0)mesh.rotation.y=Math.PI;parent.add(mesh);
}
export function createMicrobitV2() {
  const root=new Group();root.name='microbit-v2';root.userData={assetId:'microbit-v2',revision:'2.21',units:'mm'};
  const pcb=new Mesh(new ExtrudeGeometry(pcbOutline(),{depth:1.6,bevelEnabled:false,curveSegments:24}),material('#172126',.12,.62));
  pcb.geometry.translate(0,0,-.8);pcb.name='pcb';root.add(pcb);
  pinX.forEach((x,i)=>{copperPad(root,x);label(root,['0','1','2','3V','GND'][i],x,-18.1,.94,1.65,'#202a30');});
  for(const {x,column} of contactLayout.fingers)fineContact(root,x,column);
  const leds=[];ledPanels.set(root,leds);
  for(let row=0;row<5;row++)for(let col=0;col<5;col++){
    const x=(col-2)*4,y=7-row*4;box(root,1.15,1.8,.45,x,y,1.02,silver);
    // Every LED owns its emissive material, including across separate board instances.
    const led=box(root,.65,1.18,.12,x,y,1.3,material('#444444',.15,.4).clone());
    led.name=`led-${col}-${row}`;led.userData.brightness=0;
    // A small shared alpha texture suggests diffusion without lights or full-screen bloom.
    // Keep its red out of filmic tone mapping, which otherwise washes it toward orange.
    const glow=new Mesh(new PlaneGeometry(3.2,3.8),new MeshBasicMaterial({
      map:glowTexture(),color:'#ff1528',transparent:true,opacity:0,depthWrite:false,toneMapped:false,
    }));
    glow.position.z=.1;glow.visible=false;led.add(glow);leds.push({led,glow});
  }
  for(const [x,t] of [[-20,'A'],[20,'B']]){
    box(root,6.2,6.2,1.6,x,0,1.6,silver);disc(root,1.95,2.1,x,0,3.05,ink);
    for(const dx of [-2.15,2.15])for(const dy of [-2.15,2.15])disc(root,.42,.12,x+dx,dy,2.45,ink);
    label(root,t,x,-5.2,.85,2.4,'#67c7d4');
  }
  // Gold capacitive logo, microphone opening and front status LED.
  const logo=new Shape();logo.absellipse(0,0,4.5,2.5,0,Math.PI*2,false);
  const hole=new Path();hole.absellipse(0,0,3.25,1.3,0,Math.PI*2,true);logo.holes.push(hole);
  const logoMesh=new Mesh(new ShapeGeometry(logo,32),gold);logoMesh.position.set(0,14,.83);root.add(logoMesh);
  for(const x of [-1.5,1.5])disc(root,.45,.04,x,14,.85,gold);
  disc(root,.38,.03,9.4,13.3,.84,gold);disc(root,.22,.04,9.4,13.3,.87,ink);
  box(root,.6,1,.2,11.4,14,.95,material('#7f293c'));label(root,'V2',21,-9,.85,1.8,'#dbc47f');
  for(const [x,w] of [[-24,11],[-12,5],[-6,3]]){
    const s=new Shape();s.moveTo(x,19);s.lineTo(x+w,19);s.lineTo(x,19-w);s.closePath();
    const m=new Mesh(new ShapeGeometry(s),material('#278fa0'));m.position.z=.83;root.add(m);
  }
  const priorChildren=new Set(root.children);
  addBoardPorts(root);
  // Replace the legacy standalone port labels with the photo's grouped silkscreen.
  for(const child of [...root.children])if(!priorChildren.has(child)&&child.material?.map){root.remove(child);child.geometry.dispose();child.material.dispose();}
  box(root,6.4,6.4,1.3,-10,17.2,-1.45,silver);disc(root,1.8,1.2,-10,17.2,-2.7,ink);
  box(root,.85,1.8,.5,4.7,18,-1.08,material('#c03543'));box(root,.85,1.8,.5,-4.7,18,-1.08,material('#cda743'));
  addRearDetails(root);
  return root;
}
