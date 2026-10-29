// Geometry reused from Cho-WH/bme280@59c5c149. See ../README.md for provenance.
import { Group as ye, MeshStandardMaterial as In } from '../../../vendor/three-r180.js';
import { material as xe, box as At, disc as ei, plate as kl, ring as Un, label as re } from '../shared/legacy-primitives.js';
const _n=2.54,Qe=xe('#d6b55f',.72,.28),be=xe('#252a30'),Ce=xe('#aab4bd',.75,.27);
import { addHeader as jh } from '../shared/connectors.js';
import { bmp280Spec } from './spec.js';
function b_() { let i = new ye; i.name = "bmp280-module"; let t = [[-5.2, -3.7, 1.3], [5.2, -3.7, 1.3]], e = kl(i, 15.2, 12, 1.6, xe("#76359d"), t, 1); e.name = "bmp280-pcb", t.forEach(([n, s, r]) => { Un(i, n, s, .83, r, r + .25); let o = Un(i, n, s, -.83, r, r + .25); o.rotation.y = Math.PI; }); for (let n = 0; n < 6; n++) {
    let s = bmp280Spec.ports[["VCC","GND","SCL","SDA","CSB","SDO"][n]].point[0];
    jh(i, s, 4, .8, !1);
    let r = re(i, ["VCC", "GND", "SCL", "SDA", "CSB", "SDO"][n], s, .25, .87, 1.5, "#ffffff");
    r.rotation.z = Math.PI / 2;
    let o = Un(i, s, 4, -.85, .3, .8, Ce);
    o.rotation.y = Math.PI;
} return At(i, 2, 2.5, .95, 0, -3, 1.275, Ce), ei(i, .15, .04, .5, -2.4, 1.77, be), At(i, 1, .6, .5, -2.4, -3.8, 1.05, xe("#b3a189")), At(i, 1, .6, .5, 2.4, -3.8, 1.05, xe("#b3a189")), re(i, "BMP280", 0, -.7, -.85, 2, "#f0e9f6", !0), re(i, "6-pin module", 0, -3, -.85, 1.3, "#e0d2eb", !0), i; }

export { b_ as createBmp280 };
