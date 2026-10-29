// Geometry, label and hollow socket helpers adapted from Cho-WH/bme280@59c5c149.
// Original application-code license qualification: see ../README.md.
import { id, to, In, ge, qn, Fs, Rn, Cn, Qi, Xs, Ls, we, pi, _i, ye, ts, P, mi, Ee, Yn, Ki, qs, ra, _o, Ds, $s, Zs, ns, Pe, la, js, up, $n, Ks, nt } from "../../../vendor/three-r180.js";
const Bl=new Map(), zl=new Map(), sharedMaterials=new WeakSet();
function xe(i, t = 0, e = .55) { let n = `${i}/${t}/${e}`; if(!Bl.has(n)){const value=new In({ color: i, metalness: t, roughness: e });Bl.set(n,value);sharedMaterials.add(value);} return Bl.get(n); }
export const isSharedMaterial = value => sharedMaterials.has(value);
function At(i, t, e, n, s, r, o, a) { let l = new ge(new qn(t, e, n), a); return l.position.set(s, r, o), i.add(l), l; }
function ei(i, t, e, n, s, r, o) { let a = new ge(new Fs(t, t, e, 24), o); return a.rotation.x = Math.PI / 2, a.position.set(n, s, r), i.add(a), a; }
function Kh(i, t, e) { let n = new Rn, s = -i / 2, r = -t / 2; return n.moveTo(s + e, r), n.lineTo(s + i - e, r), n.quadraticCurveTo(s + i, r, s + i, r + e), n.lineTo(s + i, r + t - e), n.quadraticCurveTo(s + i, r + t, s + i - e, r + t), n.lineTo(s + e, r + t), n.quadraticCurveTo(s, r + t, s, r + t - e), n.lineTo(s, r + e), n.quadraticCurveTo(s, r, s + e, r), n; }
function kl(i, t, e, n, s, r = [], o = 2) { let a = Kh(t, e, o); r.forEach(([h, f, d]) => { let u = new Cn; u.absarc(h, f, d, 0, Math.PI * 2, !0), a.holes.push(u); }); let l = new Qi(a, { depth: n, bevelEnabled: !1, curveSegments: 16 }); l.translate(0, 0, -n / 2); let c = new ge(l, s); return i.add(c), c; }
function Un(i, t, e, n, s, r, o = Qe) { let a = new ge(new Xs(s, r, 36), o); return a.position.set(t, e, n), i.add(a), a; }
function y_(i, t, e) { let n = `${i}/${t}/${e}`; if (zl.has(n))
    return zl.get(n); let s = document.createElement("canvas"), r = s.getContext("2d"); r.font = "600 52px Arial, sans-serif"; let o = Math.ceil(r.measureText(i).width + 24), a = 80, l = 3; s.width = o * l, s.height = a * l, r.setTransform(l, 0, 0, l, 0, 0), e && (r.fillStyle = e, r.fillRect(0, 0, o, a)), r.font = "600 52px Arial, sans-serif", r.fillStyle = t, r.textAlign = "center", r.textBaseline = "middle", r.fillText(i, o / 2, 41); let c = new Ls(s); return c.colorSpace = we, zl.set(n, c), c; }
function re(i, t, e, n, s, r = 1.7, o = "#25303c", a = !1) { let l = y_(t, o), c = new pi({ map: l, transparent: !0, depthWrite: !1, polygonOffset: !0, polygonOffsetFactor: -1 }), h = new ge(new _i(r * l.image.width / l.image.height, r), c); return h.position.set(e, n, s), a && (h.rotation.y = Math.PI), i.add(h), h; }
function v_(i) { let t = new ye; t.name = "microbit-usb-port", i.add(t); let e = new Rn; e.moveTo(-3.7, -.75), e.lineTo(-2.95, -1.35), e.lineTo(2.95, -1.35), e.lineTo(3.7, -.75), e.lineTo(3.7, 1.35), e.lineTo(-3.7, 1.35), e.closePath(); let n = new Cn; n.moveTo(-3.35, -.6), n.lineTo(-2.8, -1.03), n.lineTo(2.8, -1.03), n.lineTo(3.35, -.6), n.lineTo(3.35, 1.02), n.lineTo(-3.35, 1.02), n.closePath(), e.holes.push(n); let s = new ge(new Qi(e, { depth: 5.4, bevelEnabled: !1 }), Ce); s.rotation.x = Math.PI / 2, s.position.set(0, 21.3, -2.15), s.name = "usb-hollow-shell", t.add(s), At(t, 6.6, .45, 2.1, 0, 16.1, -2.15, be), At(t, 5.35, 4.2, .48, 0, 18.45, -1.52, be).name = "usb-tongue"; for (let a = 0; a < 5; a++)
    At(t, .28, 2.8, .07, (a - 2) * .65, 19.1, -1.79, Qe).name = `usb-contact-${a + 1}`; for (let a of [-3, 3])
    At(t, .7, 1.4, .18, a, 17.4, -3.56, xe("#788591", .7)), At(t, 1.2, 1.8, .2, a, 16.3, -.91, Ce); re(i, "USB", 0, 14, -.87, 1.7, "#edf2f8", !0); let r = new ye; r.name = "microbit-battery-port", r.position.set(-19, 18, 0), i.add(r); let o = xe("#eeece1", 0, .65); At(r, 7.9, 6, .55, 0, 0, -1.075, o), At(r, 7.9, .75, 5.5, 0, -2.625, -3.55, o); for (let a of [-3.6, 3.6])
    At(r, .7, 6, 5.5, a, 0, -3.55, o); for (let a of [-2.6, 2.6])
    At(r, 2, 6, .65, a, 0, -5.975, o); At(r, 3.2, 3.4, .65, 0, -1.3, -5.975, o); for (let a of [-1, 1])
    At(r, .5, 4.6, .5, a, .05, -3.4, Ce).name = "battery-contact", At(r, .5, .5, 2.3, a, -2.1, -2.25, Ce), At(r, .55, 2.4, .2, a, -3.5, -.9, Ce); for (let a of [-3.75, 3.75])
    At(r, .8, 2, .2, a, -1.4, -.92, Ce); re(i, "BAT 3V", -19, 12.8, -.87, 1.6, "#edf2f8", !0); }
const Qe=xe("#d6b55f",.72,.28), be=xe("#252a30"), Ce=xe("#aab4bd",.75,.27);
export { xe as material, At as box, ei as disc, Kh as roundedShape, kl as plate, Un as ring, re as label, v_ as addBoardPorts };
