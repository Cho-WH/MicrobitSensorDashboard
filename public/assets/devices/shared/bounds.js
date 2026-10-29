import { Vector3 } from '../../../vendor/three-r180.js';

export function modelBounds(root) {
  root.updateMatrixWorld(true);
  const corners = [], min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
  root.traverseVisible(node => {
    if (!node.geometry) return;
    node.geometry.computeBoundingBox(); const bounds = node.geometry.boundingBox;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const point = new Vector3(x, y, z).applyMatrix4(node.matrixWorld); corners.push(point); min.min(point); max.max(point);
    }
  });
  return { corners, min, max, center: min.clone().add(max).multiplyScalar(.5), size: max.clone().sub(min) };
}
