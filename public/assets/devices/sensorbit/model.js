// Geometry reused from Cho-WH/bme280@59c5c149. See ../README.md for provenance.
import { Group as ye, MeshStandardMaterial as In } from '../../../vendor/three-r180.js';
import { material as xe, box as At, disc as ei, plate as kl, ring as Un, label as re } from '../shared/legacy-primitives.js';
const _n=2.54,Qe=xe('#d6b55f',.72,.28),be=xe('#252a30'),Ce=xe('#aab4bd',.75,.27);
import { addHeader as jh, addChip as Qh } from '../shared/connectors.js';
import { sensorbitSpec } from './spec.js';
function S_() { let i = new ye; i.name = "sensorbit"; let t = [[-24, -16.2, 2.4], [24, -16.2, 2.4], [-24, -8.2, 1.6], [24, -8.2, 1.6]], e = kl(i, 57, 42, 1.6, xe("#e8e9e7"), t, 4); e.name = "sensorbit-pcb", t.forEach(([s, r, o]) => { Un(i, s, r, .82, o, o + .35); let a = Un(i, s, r, -.82, o, o + .35); a.rotation.y = Math.PI; }), At(i, 55.8, 12.6, 7, 0, 4.4, 4.3, be), At(i, 55.8, 12.6, 3, 0, 4.4, 11, be), At(i, 55.8, 1, 11.7, 0, -1.4, 6.65, be); for (let s of [-27.3, 27.3])
    At(i, 1.2, 12.6, 11.7, s, 4.4, 6.65, be); for (let s = 0; s < 40; s++) {
    let r = (s - 19.5) * 1.27;
    At(i, .45, 3.3, .6, r, -3, 1.1, Ce), At(i, .45, .5, 8.8, r, -1.9, 5.2, Ce);
} for (let s = 0; s < 16; s++) {
    let r = sensorbitSpec.ports[`P${s+1}.S`].point[0];
    for (let [o, a] of [[0, "#ebbe16"], [1, "#e54b45"], [2, "#20262c"]]) {
        let l = sensorbitSpec.ports[`P${s+1}.${["S","V","G"][o]}`].point[1];
        At(i, 2.45, 2.45, 2.4, r, l, 2, xe(a)), At(i, .64, .64, 7, r, l, 4.7, Qe);
    }
    re(i, String(s + 1), r, -6, .85, 1.75);
} re(i, "analog ~", -12, -3.9, .85, 1.65), re(i, "S   I   O \u2014 SPI", 15, -3.9, .85, 1.5), re(i, "V", -22, -11.5, .85, 1.8), re(i, "G", -22, -14.1, .85, 1.8); for (let s of ["left", "right"]) {
    let r = s === "left" ? -19.05 : 11.43;
    for (let o = 0; o < 4; o++)
        { const name=["G","V","CL","DA"][o], port=sensorbitSpec.ports[`${s === "left" ? "socket" : "pin"}.${name}`]; jh(i, port.point[0], port.point[1], .8, port.contact === "socket"); re(i, name, port.point[0], port.point[1]+2.5, .85, 1.55); }
} re(i, "sensor:bit", 0, -18.5, .86, 2.4, "#9d7904"), At(i, 10, 6, 5.5, -20, 16.3, 3.55, be); let n = ei(i, 1.75, 1, -25.2, 16.3, 3.55, Ce); n.rotation.y = Math.PI / 2, At(i, 8, 8, 4.5, 0, 16.1, 3.05, be), ei(i, 1.4, .1, 0, 16.1, 5.36, xe("#13181e")), At(i, 7.5, 5.5, 2.7, 22, 16.2, 2.15, Ce), At(i, .2, 4.7, 1.7, 25.85, 16.2, 2.15, be), Qh(i, 3.5, 3, 12, 16, 1.25), re(i, "ELECFREAKS \xB7 sensor:bit", 0, 2, -.85, 3, "#53606b", !0), re(i, "EF03415 / V1.6", 0, -4, -.85, 2, "#53606b", !0); for (let s = 0; s < 16; s++)
    for (let r = 0; r < 3; r++) {
        let o = Un(i, (s - 7.5) * _n, -9 - r * _n, -.85, .3, .8, Ce);
        o.rotation.y = Math.PI;
    } return i; }

export { S_ as createExpansionBoard };
