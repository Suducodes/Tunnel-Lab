// The energy landscape: conduction-band potential as a 3D terrain, Fermi seas as liquid,
// island levels as glowing rings, and electrons that move at their true energy.
import * as THREE from 'three';
import type { Store } from '../state';
import * as R from '../physics/rtd';
import * as D from '../physics/dot';
import { M, label } from './materials';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Flyers } from './flyers';
import type { Hop } from './mc';

const NX = 240, NZ = 96, W = 13, DEPTH = 6.4;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sig = (x: number) => 1 / (1 + Math.exp(-x));

const LOW = new THREE.Color('#1d5a60'), MID = new THREE.Color('#3b4954'), HIGH = new THREE.Color('#b9874a'), TOPC = new THREE.Color('#ecd6a6');

interface DotTargets { muS: number; muD: number; floor: number; A: number; }

export class Landscape {
  group = new THREE.Group();
  private geo = new THREE.PlaneGeometry(W, DEPTH, NX, NZ);
  private wgeo = new THREE.PlaneGeometry(W, DEPTH, 120, 48);
  private surf: THREE.Mesh;
  private skirt!: THREE.Mesh;
  private edge: number[] = [];
  private wire: THREE.Mesh;
  private seaS: THREE.Mesh; private seaD: THREE.Mesh;
  private rings: THREE.Mesh[] = [];
  private ringEls: THREE.Mesh[] = [];
  private sheets: THREE.Mesh[] = [];
  private parts: THREE.InstancedMesh;
  private pstate: { x: number; z: number; E: number; v: number; pass: number; inCol: boolean }[] = [];
  flyers = new Flyers(0.09);
  private cur: DotTargets = { muS: 0, muD: 0, floor: -0.02, A: 0.03 };
  private tgt: DotTargets = { ...this.cur };
  private Hs = 50;
  private mode: 'rtd' | 'set' | 'qd' = 'qd';
  private lbls: Record<string, CSS2DObject> = {};
  private dirty = true;

  constructor(private store: Store) {
    this.geo.rotateX(-Math.PI / 2);
    this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array((NX + 1) * (NZ + 1) * 3), 3));
    this.surf = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.05, side: THREE.DoubleSide }));
    this.surf.receiveShadow = true; this.surf.castShadow = true;
    this.wgeo.rotateX(-Math.PI / 2);
    this.wire = new THREE.Mesh(this.wgeo, new THREE.MeshBasicMaterial({ color: '#ebe7dc', wireframe: true, transparent: true, opacity: 0.07, depthWrite: false }));
    this.wire.position.y = 0.012;
    this.group.add(this.surf, this.wire);
    this.skirt = new THREE.Mesh(this.makeSkirt(), new THREE.MeshStandardMaterial({ color: '#2c3740', roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide }));
    this.skirt.castShadow = true; this.skirt.receiveShadow = true;
    const bottom = new THREE.Mesh(new THREE.PlaneGeometry(W, DEPTH).rotateX(Math.PI / 2), this.skirt.material);
    bottom.position.y = 0.005;
    this.group.add(this.skirt, bottom);

    const seaMat = () => new THREE.MeshStandardMaterial({ color: '#2fb3a5', emissive: '#0e4f48', emissiveIntensity: 0.7, transparent: true, opacity: 0.55, roughness: 0.35, metalness: 0, depthWrite: false });
    const seaGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0);
    this.seaS = new THREE.Mesh(seaGeo, seaMat());
    this.seaD = new THREE.Mesh(seaGeo, seaMat());
    this.group.add(this.seaS, this.seaD);

    const ringGeo = new THREE.TorusGeometry(0.7, 0.035, 10, 96).rotateX(Math.PI / 2);
    const elGeo = new THREE.SphereGeometry(0.1, 16, 12);
    for (let i = 0; i < 9; i++) {
      const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true }));
      const e = new THREE.Mesh(elGeo, M.electron);
      this.rings.push(r); this.ringEls.push(e);
      this.group.add(r, e);
    }
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(1, 0.035, 6.2), new THREE.MeshBasicMaterial({ color: '#e2b457', transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      this.sheets.push(s); this.group.add(s);
    }
    const n = 260;
    this.parts = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }), n);
    this.parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) { this.pstate.push({ x: 0, z: 0, E: 0, v: 1, pass: 0, inCol: false }); this.parts.setColorAt(i, new THREE.Color('#7fe9ff')); }
    this.group.add(this.parts, this.flyers.group);

    const mk = (k: string, t: string, s: string, cls = '') => { const l = label(t, s, cls); this.lbls[k] = l; this.group.add(l); };
    mk('seaS', 'Source sea', 'filled up to μS', 'lbl-cyan');
    mk('seaD', 'Drain sea', 'filled up to μD', 'lbl-cyan');
    mk('bar', 'Tunnel barrier', 'electrons pass through, not over');
    mk('lvl', 'Next level', '', 'lbl-amber');
    mk('well', 'Resonant level', 'electrons pass only at this energy', 'lbl-amber');
  }

  setMode(mode: 'rtd' | 'set' | 'qd') {
    this.mode = mode;
    this.flyers.clear();
    const dot = mode !== 'rtd';
    for (const r of this.rings) r.visible = dot;
    for (const e of this.ringEls) e.visible = dot;
    for (const s of this.sheets) s.visible = !dot;
    this.parts.visible = !dot;
    this.lbls.lvl.visible = dot; this.lbls.well.visible = !dot;
    this.dirty = true;
    (this.lbls.seaS.element.querySelector('.lbl-t') as HTMLElement).textContent = dot ? 'Source sea' : 'Emitter sea';
    (this.lbls.seaD.element.querySelector('.lbl-t') as HTMLElement).textContent = dot ? 'Drain sea' : 'Collector sea';
    if (!dot) this.respawnAll();
  }

  setLabels(on: boolean) {
    for (const [k, l] of Object.entries(this.lbls)) l.visible = on && (k === 'lvl' ? this.mode !== 'rtd' : k === 'well' ? this.mode === 'rtd' : true);
  }

  /** pull targets from the store (call on any change) */
  sync() {
    const st = this.store;
    if (st.s.mode === 'rtd') { this.dirty = true; return; }
    const d = st.dot, ds = st.dotS, p = d.p;
    const A = p.Ec + (p.kind === 'qd' ? p.delta : 0);
    const b = { Vg: ds.Vg, Vds: ds.Vds };
    const lo = p.kind === 'qd' ? 0 : d.pt.Nmax - 4;
    const floor = Math.max(-2.3 * A, D.muAdd(p, b, lo) - 0.45 * A);
    this.tgt = { muS: ds.Vds / 2, muD: -ds.Vds / 2, floor, A };
  }

  // ------------------------------------------------------------ height fields
  private base = 2.6;
  private yE(E: number) { return this.base + E * this.Hs; }

  private dotHeight(x: number, z: number, c: DotTargets): number {
    const A = c.A, lead = 1.25 * A, eB = 1.75 * A + Math.max(0, c.muS, c.muD);
    const s1 = sig((x + 1.75) / 0.14), s2 = sig((x - 1.75) / 0.14);
    const bowl = c.floor + 0.35 * A * (x * x) / (1.6 * 1.6);
    let h = (c.muS - lead) * (1 - s1) + bowl * (s1 - s2) + (c.muD - lead) * s2;
    const g = Math.max(Math.exp(-(((x + 1.75) / 0.3) ** 2)), Math.exp(-(((x - 1.75) / 0.3) ** 2)));
    h = h + (eB - h) * g;
    // gate-defined lateral confinement only around the dot; the leads are open 2DEG
    const dotness = sig((x + 1.9) / 0.22) * (1 - sig((x - 1.9) / 0.22));
    const t = Math.min(1, Math.max(0, (Math.abs(z) - 1.15) / 0.7));
    const ss = t * t * (3 - 2 * t) * dotness;
    return h + (eB * 0.92 - h) * ss;
  }

  private rtdGeom() {
    const d = this.store.rtd, p = d.p;
    const L = 2 * p.barrier + p.well, lead = L * 1.05;
    const xmin = -lead, xmax = L + lead;
    return { L, xmin, xmax, toW: (xn: number) => -W / 2 + (W * (xn - xmin)) / (xmax - xmin), toN: (xw: number) => xmin + ((xw + W / 2) / W) * (xmax - xmin) };
  }

  /** Side walls from the terrain edge down to the bench, so the landscape reads as a solid model. */
  private makeSkirt(): THREE.BufferGeometry {
    const idx = (ix: number, iz: number) => iz * (NX + 1) + ix;
    const ring: number[] = [];
    for (let ix = 0; ix <= NX; ix++) ring.push(idx(ix, 0));
    for (let iz = 1; iz <= NZ; iz++) ring.push(idx(NX, iz));
    for (let ix = NX - 1; ix >= 0; ix--) ring.push(idx(ix, NZ));
    for (let iz = NZ - 1; iz >= 0; iz--) ring.push(idx(0, iz));
    this.edge = ring;
    const n = ring.length;
    const pos = new Float32Array(n * 2 * 3);
    const index: number[] = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; index.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(index);
    return g;
  }

  private updateSkirt() {
    const sp = this.geo.attributes.position as THREE.BufferAttribute;
    const kp = this.skirt.geometry.attributes.position as THREE.BufferAttribute;
    this.edge.forEach((vi, i) => {
      const x = sp.getX(vi), y = sp.getY(vi), z = sp.getZ(vi);
      kp.setXYZ(i * 2, x, y, z); kp.setXYZ(i * 2 + 1, x, 0.005, z);
    });
    kp.needsUpdate = true;
    this.skirt.geometry.computeVertexNormals();
    this.skirt.geometry.computeBoundingSphere();
  }

  private heightFn(): (x: number, z: number) => number {
    if (this.mode === 'rtd') {
      const d = this.store.rtd, V = this.store.s.rtd.V, g = this.rtdGeom();
      this.Hs = 1.7 / d.p.mat.vb;
      this.base = 0.4 + (this.store.rtd.vMax + 0.02) * this.Hs;
      return (x) => R.potentialAt(d.p, V, g.toN(x));
    }
    this.Hs = 0.95 / this.cur.A;
    this.base = 0.4 + 2.45 * 0.95;
    return (x, z) => this.dotHeight(x, z, this.cur);
  }

  private rebuild() {
    const h = this.heightFn();
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const col = this.geo.attributes.color as THREE.BufferAttribute;
    let lo = Infinity, hi = -Infinity;
    const hs = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) { hs[i] = h(pos.getX(i), pos.getZ(i)); lo = Math.min(lo, hs[i]); hi = Math.max(hi, hs[i]); }
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, this.yE(hs[i]));
      const t = (hs[i] - lo) / Math.max(1e-9, hi - lo);
      if (t < 0.45) c.copy(LOW).lerp(MID, t / 0.45); else if (t < 0.85) c.copy(MID).lerp(HIGH, (t - 0.45) / 0.4); else c.copy(HIGH).lerp(TOPC, (t - 0.85) / 0.15);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
    this.updateSkirt();
    const wp = this.wgeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < wp.count; i++) wp.setY(i, this.yE(h(wp.getX(i), wp.getZ(i))));
    wp.needsUpdate = true;
    this.wgeo.computeBoundingSphere();
  }

  /** Fermi sea as a liquid volume from the band bottom up to the electrochemical potential. */
  private placeSea(sea: THREE.Mesh, x0: number, x1: number, E: number, bottom: number, depth: number, t: number) {
    const h = Math.max(0.02, (E - bottom) * this.Hs);
    sea.scale.set(x1 - x0, h, depth);
    sea.position.set((x0 + x1) / 2, this.yE(E), 0);
    (sea.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.75 + 0.12 * Math.sin(t * 1.7 + x0);
  }

  // ------------------------------------------------------------ per frame
  update(dt: number, t: number, mcN: number) {
    this.flyers.update(dt);
    if (this.mode === 'rtd') { this.updateRtd(dt, t); return; }
    // ease the terrain towards the new operating point
    const k = 1 - Math.exp(-dt * 7);
    let moved = this.dirty;
    for (const key of ['muS', 'muD', 'floor', 'A'] as const) {
      const nv = lerp(this.cur[key], this.tgt[key], k);
      if (Math.abs(nv - this.cur[key]) > 1e-7) moved = true;
      this.cur[key] = nv;
    }
    if (moved) { this.rebuild(); this.dirty = false; }
    this.placeSea(this.seaS, -W / 2 + 0.02, -2.0, this.cur.muS, this.cur.muS - 1.25 * this.cur.A, 5.5, t);
    this.placeSea(this.seaD, 2.0, W / 2 - 0.02, this.cur.muD, this.cur.muD - 1.25 * this.cur.A, 5.5, t);
    // rings: addition ladder
    const st = this.store, d = st.dot, ds = st.dotS, p = d.p;
    const b = { Vg: ds.Vg, Vds: ds.Vds };
    const lo = p.kind === 'qd' ? Math.max(0, mcN - 4) : mcN - 4;
    const muS = ds.Vds / 2, muD = -ds.Vds / 2, kT = d.kT;
    let ri = 0;
    for (let n = lo; n <= mcN + 4 && ri < this.rings.length; n++) {
      const mu = D.muAdd(p, b, n);
      const y = this.yE(mu);
      if (y < this.yE(this.cur.floor) - 0.05 || mu > 1.75 * this.cur.A) continue;
      const r = this.rings[ri], e = this.ringEls[ri];
      ri++;
      r.visible = true;
      r.position.set(0, y, 0);
      const filled = n < mcN;
      const inWin = mu <= Math.max(muS, muD) + kT && mu >= Math.min(muS, muD) - kT;
      const m = r.material as THREE.MeshBasicMaterial;
      if (inWin) { m.color.set('#ffc96b').multiplyScalar(2.2); m.opacity = 1; }
      else if (filled) { m.color.set('#bff4ff').multiplyScalar(1.4); m.opacity = 0.95; }
      else { m.color.set('#8ea3b3'); m.opacity = 0.35; }
      const sc = 0.75 + 0.18 * Math.max(0, (y - this.yE(this.cur.floor))) / 2;
      r.scale.setScalar(sc);
      e.visible = filled;
      if (filled) { const a = t * (1.4 + 0.15 * n) + n * 2.1; e.position.set(Math.cos(a) * 0.7 * sc, y, Math.sin(a) * 0.7 * sc); }
      if (n === mcN) { this.lbls.lvl.position.set(0.9, y + 0.15, 0); const lb = this.lbls.lvl.element.querySelector('.lbl-s'); if (lb) lb.textContent = `${n}→${n + 1}: ${((mu - muS) * 1000).toFixed(1)} meV vs μS`; }
    }
    for (; ri < this.rings.length; ri++) { this.rings[ri].visible = false; this.ringEls[ri].visible = false; }
    this.lbls.seaS.position.set(-5.2, this.yE(this.cur.muS) + 0.2, 2.2);
    this.lbls.seaD.position.set(5.2, this.yE(this.cur.muD) + 0.2, 2.2);
    this.lbls.bar.position.set(-1.75, this.yE(1.75 * this.cur.A) + 0.2, -1.6);
  }

  /** animate one tunnelling event at its true energy */
  hop(h: Hop) {
    if (this.mode === 'rtd') return;
    const y = this.yE(h.mu);
    const sx = h.lead === 'S' ? -3.6 : 3.6;
    const z = (Math.random() - 0.5) * 1.6;
    const a = new THREE.Vector3(sx, y, z), b = new THREE.Vector3(0.7 * Math.sign(sx), y, z * 0.2);
    const [from, to] = h.kind === 'in' ? [a, b] : [b, a];
    const fade = (u: number) => { const x = Math.abs(lerp(from.x, to.x, u)); return x > 1.4 && x < 2.1 ? 0.35 : Math.min(1, Math.min(u, 1 - u) * 8); };
    this.flyers.spawn((u) => new THREE.Vector3().lerpVectors(from, to, u), 0.85, { hot: true, fade });
  }

  // ------------------------------------------------------------ RTD particles
  private respawn(i: number, anywhere: boolean) {
    const d = this.store.rtd, kT = Math.max(8.617e-5 * d.p.T, 1e-4), g = this.rtdGeom();
    // energy from the 3D emitter distribution of longitudinal energies (supply-weighted)
    let E = 0;
    for (let k = 0; k < 20; k++) {
      E = Math.random() * (d.EF + 4 * kT);
      const w = Math.log1p(Math.exp((d.EF - E) / kT)) / Math.log1p(Math.exp(d.EF / kT));
      if (Math.random() < w) break;
    }
    const xl = g.toW(g.xmin) + 0.2, xb = g.toW(0);
    const s = this.pstate[i];
    s.E = E; s.x = anywhere ? lerp(xl, xb, Math.random()) : xl; s.z = (Math.random() - 0.5) * (DEPTH - 0.4); s.v = 1.6 + Math.random() * 1.4; s.pass = 0; s.inCol = false;
  }
  private respawnAll() { for (let i = 0; i < this.pstate.length; i++) this.respawn(i, true); }

  private Tat(E: number): number {
    const sp = this.store.rtd.spec;
    if (!sp.E.length) return 0;
    const de = sp.E[1] - sp.E[0];
    const i = Math.floor((E - sp.E[0]) / de);
    if (i < 0 || i >= sp.E.length - 1) return 0;
    const u = (E - sp.E[i]) / de;
    return sp.T[i] * (1 - u) + sp.T[i + 1] * u;
  }

  private m4 = new THREE.Matrix4();
  private c3 = new THREE.Color();
  private updateRtd(dt: number, t: number) {
    const d = this.store.rtd, V = this.store.s.rtd.V, g = this.rtdGeom();
    if (this.dirty) { this.rebuild(); this.dirty = false; }
    this.placeSea(this.seaS, g.toW(g.xmin) + 0.02, g.toW(0) - 0.02, d.EF, 0, DEPTH - 0.04, t);
    this.placeSea(this.seaD, g.toW(g.L) + 0.02, g.toW(g.xmax) - 0.02, d.EF - V, -V, DEPTH - 0.04, t);
    const xb0 = g.toW(0), xb1 = g.toW(g.L), xend = g.toW(g.xmax) - 0.1;
    // resonance sheets
    const w0 = g.toW(d.p.barrier), w1 = g.toW(d.p.barrier + d.p.well);
    this.sheets.forEach((s, k) => {
      const r = d.res[k];
      s.visible = !!r && r.E < d.p.mat.vb;
      if (!r) return;
      s.scale.x = w1 - w0; s.position.set((w0 + w1) / 2, this.yE(r.E), 0);
      const inSea = r.E > 0 && r.E < d.EF + 0.003;
      (s.material as THREE.MeshBasicMaterial).opacity = inSea ? 0.55 : 0.18;
      (s.material as THREE.MeshBasicMaterial).color.set(inSea ? '#f3c25e' : '#8a6a3a');
    });
    if (d.res[0]) this.lbls.well.position.set((w0 + w1) / 2 + 0.4, this.yE(d.res[0].E) + 0.25, -2.4);
    this.lbls.seaS.position.set(g.toW(g.xmin) + 1.2, this.yE(d.EF) + 0.2, 2.2);
    this.lbls.seaD.position.set(xend - 1.2, this.yE(d.EF - V) + 0.2, 2.2);
    this.lbls.bar.position.set(xb0 + 0.1, this.yE(d.p.mat.vb) + 0.2, -1.8);
    // particles
    for (let i = 0; i < this.pstate.length; i++) {
      const s = this.pstate[i];
      s.x += s.v * dt;
      if (s.pass === 0 && s.v > 0 && s.x >= xb0 - 0.05) {
        // fate decided by the real transmission at this energy
        if (Math.random() < this.Tat(s.E)) s.pass = 1; else { s.v = -s.v; s.x = xb0 - 0.05; s.pass = -1; }
      }
      if (s.pass === 1 && s.x > xb1) s.inCol = true;
      if (s.x > xend || (s.pass === -1 && s.x < g.toW(g.xmin) + 0.15)) this.respawn(i, false);
      const ghost = s.pass === 1 && s.x > xb0 && s.x < xb1;
      const y = this.yE(s.E) + 0.06;
      const sc = ghost ? 1.25 : 1;
      this.m4.makeScale(sc, sc, sc).setPosition(s.x, y, s.z);
      this.parts.setMatrixAt(i, this.m4);
      if (s.pass === 1) this.c3.set('#ffc96b').multiplyScalar(ghost ? 2.6 : 1.8); else this.c3.set('#7fe9ff').multiplyScalar(0.9);
      this.parts.setColorAt(i, this.c3);
    }
    this.parts.instanceMatrix.needsUpdate = true;
    if (this.parts.instanceColor) this.parts.instanceColor.needsUpdate = true;
  }

  markDirty() { this.dirty = true; }
}
