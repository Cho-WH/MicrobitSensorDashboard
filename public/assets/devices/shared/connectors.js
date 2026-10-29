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
function $h(i, t, e, n, s, color) { let r = new ye; r.name = `cable-${n}-${s}-${e ? "male" : "female"}`, r.position.copy(t), r.userData.gender = e ? "male" : "female", r.userData.end = s, i.add(r); let o = xe("#252b34",0,.65), a = xe("#bfc4c8",.7,.3); if (e)
    At(r, 2.4, 2.4, 8.2, 0, 0, 4.1, o), At(r, .64, .64, 6, 0, 0, -3, a).name = "exposed-male-pin";
else {
    for (let c of [-1, 1])
        At(r, .4, 2.4, 7.4, c, 0, 3.7, o), At(r, 1.6, .4, 7.4, 0, c, 3.7, o), At(r, .15, .65, 2.8, c * .58, 0, 3.4, a);
    At(r, 2.4, 2.4, .8, 0, 0, 7.8, o).name = "female-cavity-roof";
} At(r, 1, .04, 2.2, 0, -1.21, 5, a); return At(r, 2.43, 2.43, .75, 0, 0, 7.7, xe(color)), r; }

export { $h as addJumperEnd, jh as addHeader, Qh as addChip };
