// Rear layout based on the user's V2.21 photograph. Not an electrical routing model.
// Local +X is right as seen from the rear; +Z points out of the rear surface.
import { Group, Mesh, ShapeGeometry, MeshStandardMaterial, CanvasTexture, SRGBColorSpace } from '../../../vendor/three-r180.js';
import { material, box, disc, label, roundedShape } from '../shared/legacy-primitives.js';
import { clipRearStroke } from './contact-layout.js';

const silk='#e0e7e8',silver=material('#b3bec3',.72,.3),gold=material('#d6b873',.68,.34);
const dark=material('#22282c',.05,.78),ceramic=material('#9c9682',.05,.65);
function stroke(parent,points,width=.12,mat=material(silk),z=.86) {
  for(const [a,b] of clipRearStroke(points,width)){
    const mesh=box(parent,Math.hypot(b[0]-a[0],b[1]-a[1]),width,.025,(a[0]+b[0])/2,(a[1]+b[1])/2,z,mat);
    mesh.rotation.z=Math.atan2(b[1]-a[1],b[0]-a[0]);
  }
}
function text(parent,words,x,y,height=1.2,color=silk) {
  const mesh=label(parent,words,x,y,.89,height,color);mesh.position.x+=mesh.geometry.parameters.width/2;return mesh;
}
function smallPart(parent,x,y,angle=0,isCeramic=false,scale=1){
  const g=new Group();g.position.set(x,y,.85);g.rotation.z=angle;g.scale.setScalar(scale);parent.add(g);
  box(g,.52,1.05,.3,0,0,.15,isCeramic?ceramic:dark);
  for(const y of [-.4,.4])box(g,.57,.23,.32,0,y,.16,silver);
}
function ic(parent,name,x,y,size,angle,leadCount){
  const g=new Group();g.name=name;g.position.set(x,y,.84);g.rotation.z=angle;parent.add(g);
  box(g,size,size,.65,0,0,.42,dark);
  for(let i=0;i<leadCount;i++){
    const p=(i-(leadCount-1)/2)*(size-.5)/leadCount;
    for(const sign of [-1,1]){box(g,.18,.36,.1,p,sign*(size/2+.08),.13,silver);box(g,.36,.18,.1,sign*(size/2+.08),p,.13,silver);}
  }
  disc(g,.13,.02,-size*.35,size*.35,.76,material('#5b666b'));return g;
}
let speakerMaterial;
function grainMaterial(){
  if(speakerMaterial)return speakerMaterial;
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
  const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(128,128);let seed=5197;
  for(let i=0;i<pixels.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const n=64+(seed>>>27);pixels.data.set([n,n+3,n+5,255],i);}
  ctx.putImageData(pixels,0,0);const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;
  return speakerMaterial=new MeshStandardMaterial({map,roughness:.95,metalness:.02});
}
function metalCan(parent,name,x,y,w,h,angle){
  const g=new Group();g.name=name;g.position.set(x,y,.86);g.rotation.z=angle;parent.add(g);
  box(g,w+.35,h+.35,.18,0,0,.1,silver);box(g,w,h,.52,0,0,.41,gold);
  box(g,w-.3,h-.3,.04,0,0,.69,material('#c8c1a3',.6,.35));return g;
}

export function addRearDetails(root){
  const rear=new Group();rear.name='v2-21-rear';rear.rotation.y=Math.PI;root.add(rear);
  // Shell slots, folded edges and the four reset-switch rivets remain visible in close-up.
  for(const x of [-2.35,2.35]){
    box(rear,.48,1.65,.035,x,18.75,3.53,material('#505b61'));
    box(rear,.13,1.7,.04,x-.3,18.75,3.55,silver);
    box(rear,1.1,.65,.1,x,16.25,3.55,dark);
  }
  stroke(rear,[[0,17.5],[0,20.4]],.035,material('#87959c'),3.54);
  for(const x of [7.7,12.3])for(const y of [14.9,19.5])disc(rear,.5,.12,x,y,2.15,material('#4a555c'));
  box(rear,6.8,6.5,.45,10,17.2,1,material('#182228'));
  for(const x of [16.9,21.1])box(rear,1,1.5,.12,x,13.8,1,silver);
  const traces=new Group();traces.name='simplified-pcb-routing';rear.add(traces);
  const traceMat=material('#29383b',.12,.7),viaMat=material('#0d171b');
  // Narrow, low-contrast routed bundles. They support the layout, not circuit instruction.
  for(let i=0;i<11;i++){
    const d=i*.26;
    stroke(traces,[[-18+d,7],[-18+d,12],[-15+d,15],[-7+d,15],[-4+d,12]],.065,traceMat,.835);
    stroke(traces,[[-11+d,3],[-8+d,0],[-8+d,-3],[-12+d,-6],[-12+d,-11]],.065,traceMat,.835);
    stroke(traces,[[10+d,4],[8+d,2],[8+d,-1],[13+d,-6],[20+d,-6]],.065,traceMat,.835);
    stroke(traces,[[-17+d,-10],[-14+d,-12],[-4+d,-12],[-1+d,-14]],.065,traceMat,.835);
    stroke(traces,[[6+d,16],[6+d,9],[10+d,6],[17+d,6],[21+d,10]],.065,traceMat,.835);
  }
  for(let i=0;i<46;i++){
    const x=-20+(i*7.13)%41,y=-10+(i*3.79)%26;
    // Small dark via openings, avoiding the antenna and the central speaker.
    if((x<-13&&y>13)||(Math.abs(x)<6&&Math.abs(y-1)<6))continue;
    disc(traces,.085,.012,x,y,.85,viaMat);
  }
  // Larger meander matches the distinctive upper-left gold antenna in the photograph.
  stroke(rear,[[-20.8,8.5],[-24,11.8],[-20.5,15.2],[-18.4,13.1],[-16.1,15.4],[-18.2,17.5],[-15.8,19.8],[-13.8,17.9],[-11.7,20]],.43,gold,.87);
  stroke(rear,[[-20.8,8.5],[-19.9,9.3]],.48,silver,.89);

  const processor=ic(rear,'processor',-13.4,4.2,6.6,Math.PI/4,12);
  const usbIf=ic(rear,'usb-interface',15.2,3.3,5.4,Math.PI/4,10);
  // Surface markings are deliberately subtle, as on the physical packages.
  label(processor,'nRF52833',0,0,.78,.68,'#424b50');label(usbIf,'nRF52',0,0,.78,.66,'#424b50');
  const motion=ic(rear,'motion-sensor',-17.1,-8.9,2.1,0,4);motion.userData.description='가속도·자기장 센서';

  const speaker=box(rear,8.5,8.5,2.7,0,1,2.25,grainMaterial());speaker.rotation.z=Math.PI/4;speaker.name='speaker';
  for(const [x,y] of [[0,7.1],[0,-5.1],[-6.1,1],[6.1,1]]){const m=box(rear,1.15,1.15,.2,x,y,1.02,silver);m.rotation.z=Math.PI/4;}
  const mic=metalCan(rear,'microphone',-7.2,10.7,2.5,3.1,Math.PI/4);
  label(mic,'MEMS',0,.35,.73,.55,'#80775d');disc(mic,.12,.035,0,-.8,.73,dark);
  metalCan(rear,'left-crystal',-20.5,-1,2.55,3.1,Math.PI/4);
  metalCan(rear,'right-crystal',17.9,-5.6,2.4,3.1,Math.PI/4);

  // SMD components grouped around their parent chips, rather than scattered uniformly.
  const clusters=[
    [-13.4,4.2,[[-4,3],[-3,4],[-1,5],[2,4.4],[3.4,3.8],[4.3,2],[4.9,0],[3.8,-2.8],[2.5,-4.1],[.5,-4.7],[-1.6,-4.4],[-3,-3.1],[-4.7,-1.4]]],
    [15.2,3.3,[[-4.2,2.8],[-3.3,4],[-1.2,5],[1.2,4.8],[3.6,3.4],[4.6,1.5],[4.5,-.6],[3.5,-2.7],[1.2,-4.6],[-1,-4],[-3.6,-3],[-4.4,-1]]],
    [-7.2,10.7,[[-2.1,2.4],[-1.3,3.6],[1.3,2.6],[2.5,1.2],[2.5,-.5],[1.6,-2.2],[-.2,-2.5],[-2,-1.6]]],
    [-17.1,-8.9,[[-2.5,1.3],[-2.6,-.7],[-1.6,-2.1],[0,-2.3],[1.6,-1.7],[2.2,.1],[2.5,1.7]]],
    [17,11,[[-4,1.5],[-2.5,.5],[-1,1.4],[.5,2],[2,.5],[3.7,1.7],[-3,-1],[-1.7,-2],[.2,-1.5],[2,-2],[4,-.6]]],
  ];
  for(const [x,y,parts] of clusters)parts.forEach(([dx,dy],i)=>smallPart(rear,x+dx,y+dy,(i%3===0?0:Math.PI/4),i%4===0,.85));
  for(const [x,y] of [[-5,-.4],[-5.8,-.5],[-5,-1.6],[-5.8,-1.6],[6.5,3],[7.5,3],[7.7,1.6],[9,1.4],[-21,6],[-21,5],[-23,-3],[-22.5,-4.5],[-19.5,-4],[-12,-5.5],[-11,-5.5],[-10,-5.5],[22,3],[22,1],[22,-1],[22,-6],[21,-7.5]])smallPart(rear,x,y,Math.PI/2,(x+y)%2===0,.85);
  for(const [x,y] of [[5.6,15.2],[8.3,12.4],[9.6,12.8],[22.4,12.2],[11,-1],[8.9,1.3],[7.2,-.2],[16.7,-.8],[18,-2.7],[18.7,-4.3]])disc(rear,.46,.045,x,y,.87,gold);
  for(const y of [7,-3.5]){const pad=new Mesh(new ShapeGeometry(roundedShape(1.45,3.3,.65)),gold);pad.position.set(24,y,.89);rear.add(pad);}
  for(const x of [-24,24]){disc(rear,.52,.025,x,0,.86,gold);disc(rear,.34,.03,x,0,.89,material('#141e21'));}

  // Printed legend, leader lines and marks are the most recognizable rear features.
  const top=[['USB',14.4],['ANTENNA',13.2],['MICROPHONE',12],['RESET / ⏻',10.8],['BATTERY',9.6]];
  for(const [words,y] of top)text(rear,words,-3.4,y,1.25);
  stroke(rear,[[-3.8,13.2],[-5,13.2],[-7.7,15.2],[-12.5,15.2]],.15);
  stroke(rear,[[-3.8,12],[-4.8,12],[-5.6,12.8]],.15);
  stroke(rear,[[3.6,10.8],[6.7,10.8],[10,14.2]],.15);
  stroke(rear,[[3.2,9.6],[7,9.6],[13.4,15.2],[16,15.2]],.15);
  const bottom=[['SPEAKER',-5.8],['PROCESSOR',-7.05],['ACCELEROMETER',-8.3],['COMPASS',-9.55],['PINS',-10.8]];
  for(const [words,y] of bottom)text(rear,words,-10.1,y,1.22);
  stroke(rear,[[-3.7,-5.8],[-2.5,-5.8],[-2.5,-4.7]],.15);
  stroke(rear,[[-10.5,-7.05],[-13.3,-7.05],[-16,-4.2],[-16,.2]],.15);
  stroke(rear,[[-10.5,-8.3],[-12.5,-8.3],[-13.8,-9],[-15.5,-9]],.15);
  stroke(rear,[[-10.5,-9.55],[-15.5,-9.55]],.15);
  stroke(rear,[[-6.6,-10.8],[-5.3,-11.6],[-5.3,-14.5]],.15);
  // Horizontal legend line stops before every gold ring.
  for(const [a,b] of [[-25,-24],[-18.4,-14.9],[-8.9,-2.2],[3.9,8.1],[14.2,18.2],[24.8,25.4]])stroke(rear,[[a,-14.5],[b,-14.5]],.14);
  for(let i=0;i<3;i++){
    const x=7.4+i*2.25;box(rear,1.95,1.95,.025,x,-2.3,.865,material(silk));label(rear,'BBC'[i],x,-2.3,.91,1.75,'#253237');
  }
  const badge=roundedShape(6.4,3.4,1.65),opening=roundedShape(4.6,1.8,.85);badge.holes.push(opening);
  const mark=new Mesh(new ShapeGeometry(badge,32),material(silk));mark.position.set(10,-6,.88);rear.add(mark);
  for(const x of [8.6,11.4])disc(rear,.43,.03,x,-6,.9,material(silk));
  text(rear,'micro:bit',2.5,-9.6,4.5);text(rear,'V2',23,-10.3,1.35);text(rear,'.21',23.5,-11.35,.9);
  return rear;
}
