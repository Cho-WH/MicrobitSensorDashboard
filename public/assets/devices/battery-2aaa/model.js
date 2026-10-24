import { Group, Mesh, CylinderGeometry, BufferGeometry, Line, LineBasicMaterial } from '../../../vendor/three-r180.js';
import { material, box, label } from '../shared/legacy-primitives.js';

export const batterySpec=Object.freeze({cellCount:2,cellType:'AAA',cellVoltage:1.5,nominalVoltage:3,connection:'series'});
const metal=material('#b8c7d0',.85,.25),plastic=material('#28343c',.05,.62);
function cylinder(parent,radius,length,x,y,z,mat,name) {
  const mesh=new Mesh(new CylinderGeometry(radius,radius,length,48),mat);mesh.position.set(x,y,z);mesh.name=name;parent.add(mesh);return mesh;
}
function spring(parent,x,y,z,direction) {
  const points=[];for(let i=0;i<=120;i++){const t=i/120,angle=t*Math.PI*10;points.push({x:x+Math.cos(angle)*(1.5-.65*t),y:y+direction*t*3,z:z+Math.sin(angle)*(1.5-.65*t)});}
  const mesh=new Line(new BufferGeometry().setFromPoints(points),new LineBasicMaterial({color:'#d2dce1'}));mesh.name='negative-spring';parent.add(mesh);
}
export function createBatteryPack() {
  const root=new Group();root.name='battery-2aaa';root.userData={...batterySpec,assetId:'battery-2aaa'};
  // Open face points toward -Z, matching the rear of the micro:bit.
  box(root,28,54,1.5,0,0,5.7,plastic);box(root,.9,50,8,0,0,1,plastic);
  for(const x of [-13.35,13.35])box(root,1.3,54,11,x,0,.95,plastic);
  for(const y of [-26.25,26.25])box(root,28,1.5,11,0,y,.95,plastic);
  const cells=new Group();cells.name='aaa-cells';root.add(cells);
  for(const [index,x,direction] of [[0,-6.5,1],[1,6.5,-1]]){
    const cell=new Group();cell.name='aaa-cell-'+(index+1);cell.userData={positiveEnd:direction,voltage:1.5};cells.add(cell);
    cylinder(cell,5.2,42.5,x,0,0,material('#c7cfd1',.65,.32),'cell-can');
    cylinder(cell,5.24,27,x,-direction*5.5,0,material('#a36536',.35,.4),'cell-wrapper');
    cylinder(cell,5.27,1.5,x,direction*14,0,plastic,'positive-band');
    cylinder(cell,4.9,.7,x,direction*21.4,0,metal,'positive-cap');
    cylinder(cell,1.75,1.5,x,direction*22,0,metal,'positive-button');
    cylinder(cell,4.6,.4,x,-direction*21.5,0,metal,'negative-base');
    const text=label(cell,'AAA  1.5 V',x,-1,-5.25,2.05,'#fff0dc',true);text.rotation.z=Math.PI/2;
    label(cell,'+',x,direction*17,-5.26,3,'#26343c',true);label(cell,'−',x,-direction*17,-5.26,3,'#fff0dc',true);
    spring(root,x,-direction*25,0,direction);
    box(root,5,.65,5,x,direction*24,0,metal);
    label(root,direction===1?'+':'−',x,26.3,-4.64,1.8,'#edf1ee',true);
    label(root,direction===1?'−':'+',x,-26.3,-4.64,1.8,'#edf1ee',true);
  }
  // Series bridge joins opposite terminals at the far end. Red/black leads leave the other end.
  box(root,15,.45,2,0,-25.3,1,metal).name='series-bridge';
  root.userData.leads={positive:[-6.5,26,0],negative:[6.5,26,0]};
  return root;
}
export function createBatteryPlug() {
  const root=new Group();root.name='jst-battery-plug';root.userData={insertionAxis:[0,-1,0]};
  const ivory=material('#e9e5d5',.03,.6);
  box(root,5.8,5.8,3.7,0,2.9,0,ivory);box(root,2.7,2,.55,0,3.6,-2.1,ivory);
  for(const x of [-1,1]){box(root,.9,.05,.9,x,-.03,0,material('#535d61'));box(root,.45,3.9,.4,x,2,0,metal);}
  return root;
}
