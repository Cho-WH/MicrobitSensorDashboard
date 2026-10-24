import { Group, Mesh, Shape, Path, ExtrudeGeometry } from '../../../vendor/three-r180.js';
import { material, box, label } from '../shared/legacy-primitives.js';
import { cable } from '../shared/cable.js';

// Plug nose at origin, inserts along -Y. Micro-B, not USB-C.
export function createUsbCable() {
  const root=new Group();root.name='usb-data-cable';root.userData={assetId:'usb-micro-b',insertionAxis:[0,-1,0]};
  const metal=material('#b7c4cd',.85,.24),rubber=material('#38414a',.06,.58);
  const s=new Shape();s.moveTo(-3.1,-.65);s.lineTo(-2.6,-1);s.lineTo(2.6,-1);s.lineTo(3.1,-.65);s.lineTo(3.1,.85);s.lineTo(-3.1,.85);s.closePath();
  const h=new Path();h.moveTo(-2.65,-.45);h.lineTo(-2.3,-.7);h.lineTo(2.3,-.7);h.lineTo(2.65,-.45);h.lineTo(2.65,.55);h.lineTo(-2.65,.55);h.closePath();s.holes.push(h);
  const plug=new Mesh(new ExtrudeGeometry(s,{depth:5.2,bevelEnabled:false}),metal);plug.rotation.x=Math.PI/2;plug.position.y=5.2;plug.name='micro-b-plug';root.add(plug);
  box(root,4.8,3.8,.35,0,2.6,.25,material('#151d24'));for(let i=0;i<5;i++)box(root,.3,2.7,.07,(i-2)*.65,1.9,.03,material('#d6b55f',.7));
  box(root,8.2,8.2,4,0,8.8,0,rubber);for(let y=10;y<16;y+=1.25)box(root,4.5,.6,3.8,0,y,0,rubber);
  label(root,'USB',0,8.5,-2.04,1.5,'#c8d1d5',true);
  cable(root,[[0,15,0],[0,41,0],[34,45,0],[43,23,0]],1.6,'#333f49');
  const host=new Group();host.name='usb-a-plug';host.position.set(43,23,0);host.rotation.z=-.38;root.add(host);
  box(host,13,14,6,0,-7,0,rubber);box(host,12,12,4.5,0,-19,0,metal);
  box(host,10.4,.08,3,0,-25.04,0,material('#18212a'));
  for(const x of [-2.8,2.8])box(host,2.2,3,.06,x,-19,-2.28,material('#27313a'));
  return root;
}
