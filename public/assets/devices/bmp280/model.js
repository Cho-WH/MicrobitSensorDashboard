// Geometry reused from Cho-WH/bme280@59c5c149. See ../README.md for provenance.
import { Group as ye, MeshStandardMaterial as In } from '../../../vendor/three-r180.js';
import { material as xe, box as At, disc as ei, plate as kl, ring as Un, label as re } from '../shared/legacy-primitives.js';
const _n=2.54,Qe=xe('#d6b55f',.72,.28),be=xe('#252a30'),Ce=xe('#aab4bd',.75,.27);
function jh(i, t, e, n, s = !0) { if (s) {
    At(i, 2.45, 2.45, .8, t, e, n + .4, be);
    for (let r of [-1, 1])
        At(i, .45, 2.45, 6.7, t + r, e, n + 4, be), At(i, 1.55, .45, 6.7, t, e + r, n + 4, be);
    At(i, .7, .7, .25, t, e, n + 1, Qe);
}
else
    At(i, 2.45, 2.45, 2.4, t, e, n + 1.2, be), At(i, .64, .64, 7, t, e, n + 4.9, Qe); }
function Qh(i, t, e, n, s, r, o = !1) { At(i, t, e, .8, n, s, r, be); for (let a of [-1, 1])
    for (let l = -1; l <= 1; l++)
        At(i, .55, .45, .35, n + a * (t / 2 + .25), s + l * e / 3, r, Ce); o && re(i, "IC", n, s, r - .45, 1, "#bdc5cf", !0); }
function $h(i, t, e, n, s, color) { let r = new ye; r.name = `cable-${n}-${s}-${e ? "male" : "female"}`, r.position.copy(t), r.userData.gender = e ? "male" : "female", r.userData.end = s, i.add(r); let o = new In({ color: "#252b34", roughness: .65 }), a = new In({ color: "#bfc4c8", metalness: .7, roughness: .3 }); if (e)
    At(r, 2.4, 2.4, 8.2, 0, 0, 4.1, o), At(r, .64, .64, 6, 0, 0, -3, a).name = "exposed-male-pin";
else {
    for (let c of [-1, 1])
        At(r, .4, 2.4, 7.4, c, 0, 3.7, o), At(r, 1.6, .4, 7.4, 0, c, 3.7, o), At(r, .15, .65, 2.8, c * .58, 0, 3.4, a);
    At(r, 2.4, 2.4, .8, 0, 0, 7.8, o).name = "female-cavity-roof";
} At(r, 1, .04, 2.2, 0, -1.21, 5, a); return At(r, 2.43, 2.43, .75, 0, 0, 7.7, new In({ color })), r; }
function S_() { let i = new ye; i.name = "sensorbit"; let t = [[-24, -16.2, 2.4], [24, -16.2, 2.4], [-24, -8.2, 1.6], [24, -8.2, 1.6]], e = kl(i, 57, 42, 1.6, xe("#e8e9e7"), t, 4); e.name = "sensorbit-pcb", t.forEach(([s, r, o]) => { Un(i, s, r, .82, o, o + .35); let a = Un(i, s, r, -.82, o, o + .35); a.rotation.y = Math.PI; }), At(i, 55.8, 12.6, 7, 0, 4.4, 4.3, be), At(i, 55.8, 12.6, 3, 0, 4.4, 11, be), At(i, 55.8, 1, 11.7, 0, -1.4, 6.65, be); for (let s of [-27.3, 27.3])
    At(i, 1.2, 12.6, 11.7, s, 4.4, 6.65, be); for (let s = 0; s < 40; s++) {
    let r = (s - 19.5) * 1.27;
    At(i, .45, 3.3, .6, r, -3, 1.1, Ce), At(i, .45, .5, 8.8, r, -1.9, 5.2, Ce);
} for (let s = 0; s < 16; s++) {
    let r = (s - 7.5) * _n;
    for (let [o, a] of [[0, "#ebbe16"], [1, "#e54b45"], [2, "#20262c"]]) {
        let l = -9 - o * _n;
        At(i, 2.45, 2.45, 2.4, r, l, 2, xe(a)), At(i, .64, .64, 7, r, l, 4.7, Qe);
    }
    re(i, String(s + 1), r, -6, .85, 1.75);
} re(i, "analog ~", -12, -3.9, .85, 1.65), re(i, "S   I   O \u2014 SPI", 15, -3.9, .85, 1.5), re(i, "V", -22, -11.5, .85, 1.8), re(i, "G", -22, -14.1, .85, 1.8); for (let s of ["left", "right"]) {
    let r = s === "left" ? -19.05 : 11.43;
    for (let o = 0; o < 4; o++)
        jh(i, r + o * _n, -18.6, .8, s === "left"), re(i, ["G", "V", "CL", "DA"][o], r + o * _n, -16.1, .85, 1.55);
} re(i, "sensor:bit", 0, -18.5, .86, 2.4, "#9d7904"), At(i, 10, 6, 5.5, -20, 16.3, 3.55, be); let n = ei(i, 1.75, 1, -25.2, 16.3, 3.55, Ce); n.rotation.y = Math.PI / 2, At(i, 8, 8, 4.5, 0, 16.1, 3.05, be), ei(i, 1.4, .1, 0, 16.1, 5.36, xe("#13181e")), At(i, 7.5, 5.5, 2.7, 22, 16.2, 2.15, Ce), At(i, .2, 4.7, 1.7, 25.85, 16.2, 2.15, be), Qh(i, 3.5, 3, 12, 16, 1.25), re(i, "ELECFREAKS \xB7 sensor:bit", 0, 2, -.85, 3, "#53606b", !0), re(i, "EF03415 / V1.6", 0, -4, -.85, 2, "#53606b", !0); for (let s = 0; s < 16; s++)
    for (let r = 0; r < 3; r++) {
        let o = Un(i, (s - 7.5) * _n, -9 - r * _n, -.85, .3, .8, Ce);
        o.rotation.y = Math.PI;
    } return i; }
function b_() { let i = new ye; i.name = "bmp280-module"; let t = [[-5.2, -3.7, 1.3], [5.2, -3.7, 1.3]], e = kl(i, 15.2, 12, 1.6, xe("#76359d"), t, 1); e.name = "bmp280-pcb", t.forEach(([n, s, r]) => { Un(i, n, s, .83, r, r + .25); let o = Un(i, n, s, -.83, r, r + .25); o.rotation.y = Math.PI; }); for (let n = 0; n < 6; n++) {
    let s = (n - 2.5) * _n;
    jh(i, s, 4, .8, !1);
    let r = re(i, ["VCC", "GND", "SCL", "SDA", "CSB", "SDO"][n], s, .25, .87, 1.5, "#ffffff");
    r.rotation.z = Math.PI / 2;
    let o = Un(i, s, 4, -.85, .3, .8, Ce);
    o.rotation.y = Math.PI;
} return At(i, 2, 2.5, .95, 0, -3, 1.275, Ce), ei(i, .15, .04, .5, -2.4, 1.77, be), At(i, 1, .6, .5, -2.4, -3.8, 1.05, xe("#b3a189")), At(i, 1, .6, .5, 2.4, -3.8, 1.05, xe("#b3a189")), re(i, "BMP280", 0, -.7, -.85, 2, "#f0e9f6", !0), re(i, "6-pin module", 0, -3, -.85, 1.3, "#e0d2eb", !0), i; }
export { S_ as createExpansionBoard, b_ as createBmp280, $h as addJumperEnd, jh as addHeader, Qh as addChip };
