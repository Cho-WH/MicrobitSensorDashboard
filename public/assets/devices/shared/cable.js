import { Mesh, Vector3, CubicBezierCurve3, TubeGeometry } from '../../../vendor/three-r180.js';
import { material } from './legacy-primitives.js';

export function cable(parent,points,radius,color,name='cable') {
  const curve=new CubicBezierCurve3(...points.map(p=>new Vector3(...p)));
  const mesh=new Mesh(new TubeGeometry(curve,64,radius,12,false),material(color,.08,.55));
  mesh.name=name;parent.add(mesh);return mesh;
}
