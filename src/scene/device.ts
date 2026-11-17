// The physical devices on the bench: a gate-defined quantum dot, a metallic-island SET and a vertical RTD mesa.
// Every device is built from layer groups so it can be exploded to show the heterostructure.
import * as THREE from 'three';
import { M, label, trace, bondWire } from './materials';
import { Flyers, polyPath } from './flyers';
import { dieTopTexture, stackTexture, discTexture } from './textures';
import type { Mode } from '../state';

const DW = 13, DD = 8.4;          // die footprint (µm on the bench ruler)
const SUB = 1.3, HET = 0.42, MESA = 0.14;
const TOP = SUB + HET + MESA;     // top of the mesa

interface Layer { g: THREE.Group; lift: number; }

function boxFaces(w: number, h: number, d: number, side: THREE.Material, top: THREE.Material, bottom = side): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, top, bottom, side, side]);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export class Devices {
  group = new THREE.Group();
  private lateral = new THREE.Group();
  private qdParts = new THREE.Group();
  private setParts = new THREE.Group();
  private rtd = new THREE.Group();
  private latLayers: Layer[] = [];
  private rtdLayers: Layer[] = [];
  private wiresLat = new THREE.Group();
  private wiresRtd = new THREE.Group();
  private labelsLateral: THREE.Object3D[] = [];
  private labelsQd: THREE.Object3D[] = [];
  private labelsSet: THREE.Object3D[] = [];
  private labelsRtd: THREE.Object3D[] = [];
  flyers = new Flyers(0.075);
  private puddle: THREE.Mesh;
  private wellGlow: THREE.MeshStandardMaterial;
  private mode: Mode = 'qd';
  private rtdAcc = 0;
  private explode = 0; private explodeT = 0;
  private rtdTop = 0;
  private topQd!: THREE.Texture; private topSet!: THREE.Texture; private topMat!: THREE.MeshStandardMaterial;

  constructor() {
    this.group.add(this.lateral, this.rtd, this.flyers.group);
    this.wellGlow = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffb84d', emissiveIntensity: 0.6, toneMapped: false, side: THREE.DoubleSide });
    this.puddle = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: discTexture(), color: new THREE.Color('#5fd0c3').multiplyScalar(1.4), transparent: true, depthWrite: false, toneMapped: false, opacity: 0.5 }));
    this.buildLateral();
    this.buildRtd();
  }

  // ------------------------------------------------------------------ lateral chip (QD / SET)
  private buildLateral() {
    const L = this.lateral;
    const mk = (lift: number) => { const g = new THREE.Group(); L.add(g); this.latLayers.push({ g, lift }); return g; };
    const gSub = mk(0), g2deg = mk(0.9), gHet = mk(1.8), gMetal = mk(2.9);

    const subSide = new THREE.MeshStandardMaterial({ map: stackTexture([[1, '#1c2229']]), roughness: 0.85 });
    const sub = boxFaces(DW, SUB, DD, subSide, M.substrate); sub.position.y = SUB / 2; gSub.add(sub);

    const sheet = new THREE.Mesh(new THREE.BoxGeometry(DW - 0.02, 0.025, DD - 0.02), M.twoDeg);
    sheet.position.y = SUB + 0.02; g2deg.add(sheet);

    const hetSide = new THREE.MeshStandardMaterial({ map: stackTexture([[0.14, '#55606c'], [0.76, '#3a4551'], [0.1, '#2b333c']], 0.96), roughness: 0.7 });
    this.topQd = dieTopTexture(DW, DD, 'QD-24 · W07', 'GaAs / Al0.3Ga0.7As  ·  2DEG 90 nm  ·  n = 2.4e11 cm⁻²',
      [['S', -5.3, -2.1], ['D', 4.9, -2.1], ['VL', -3.45, 3.15], ['VP', -0.25, 3.15], ['VR', 2.95, 3.15], ['VT', -0.3, -3.35]]);
    this.topSet = dieTopTexture(DW, DD, 'SET-AL2 · W03', 'Al island  ·  AlOx junctions  ·  shadow evaporation',
      [['S', -5.3, -2.1], ['D', 4.9, -2.1], ['VG', -0.3, 3.15]]);
    const top = new THREE.MeshStandardMaterial({ map: this.topQd, roughness: 0.62, metalness: 0.15 });
    this.topMat = top;
    const het = boxFaces(DW, HET, DD, hetSide, top);
    het.position.y = SUB + HET / 2; gHet.add(het);
    const mesaSide = new THREE.MeshStandardMaterial({ map: stackTexture([[0.3, '#5d6874'], [0.7, '#3c4753']]), roughness: 0.7 });
    const mesa = boxFaces(10.4, MESA, 3.6, mesaSide, M.gaas);
    mesa.position.y = SUB + HET + MESA / 2; gHet.add(mesa);

    // ohmic contacts (alloyed AuGeNi)
    for (const s of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 3.0), M.goldAlloy);
      pad.position.set(s * 4.55, TOP + 0.06, 0); pad.castShadow = true; pad.receiveShadow = true; gMetal.add(pad);
      this.wiresLat.add(bondWire(new THREE.Vector3(s * 4.8, TOP + 0.13, 0.4), new THREE.Vector3(s * 9.2, 0.02, 0.9), 2.2));
    }
    L.add(this.wiresLat);
    const lS = label('Source', 'ohmic contact'); lS.position.set(-4.55, TOP + 0.3, 1.5);
    const lD = label('Drain', 'ohmic contact'); lD.position.set(4.55, TOP + 0.3, 1.5);
    gMetal.add(lS, lD);
    const l2 = label('2DEG', 'electron sheet below the surface', 'lbl-cyan'); l2.position.set(-DW / 2, SUB + 0.05, DD / 2); g2deg.add(l2);
    this.labelsLateral.push(lS, lD, l2);

    // gate-defined quantum dot (Ti/Au)
    const Q = this.qdParts, y = TOP;
    const add = (pts: [number, number][], w: number) => Q.add(trace(pts, w, 0.08, M.gold, y));
    add([[0, -1.8], [0, -1.25]], 0.34);
    add([[-1.45, -0.95], [1.45, -0.95]], 0.28);
    add([[0, -1.25], [0, -0.95]], 0.3);
    add([[-2.9, 1.8], [-2.9, 1.55], [-0.75, 0.95], [-0.75, 0.42]], 0.22);
    add([[2.9, 1.8], [2.9, 1.55], [0.75, 0.95], [0.75, 0.42]], 0.22);
    add([[0, 1.8], [0, 1.02]], 0.24);
    // gate leads run off the mesa onto the die to bond pads
    const lead = (pts: [number, number][]) => Q.add(trace(pts, 0.34, 0.06, M.gold, SUB + HET));
    const pads: [number, number][] = [[-2.9, 3.4], [0, 3.4], [2.9, 3.4], [0, -3.4]];
    for (const [x, z] of pads) {
      lead([[x, Math.sign(z) * 1.8], [x, z]]);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.9), M.gold);
      pad.position.set(x, SUB + HET + 0.04, z + Math.sign(z) * 0.2); pad.castShadow = true; pad.receiveShadow = true; Q.add(pad);
      this.wiresLat.add(bondWire(new THREE.Vector3(x, SUB + HET + 0.1, z + Math.sign(z) * 0.25), new THREE.Vector3(x * 1.5, 0.02, z * 2.4), 1.8));
    }
    this.puddle.position.set(0, TOP + 0.006, 0);
    Q.add(this.puddle);
    const lp = label('Plunger gate', 'Vg sets the dot energy', 'lbl-amber'); lp.position.set(0.15, y + 0.3, 1.5);
    const lb = label('Barrier gates', 'pinch the tunnel barriers'); lb.position.set(-2.2, y + 0.3, 1.3);
    const ld = label('Quantum dot', '≈ 100 nm puddle of electrons', 'lbl-cyan'); ld.position.set(0.2, y + 0.45, -0.2);
    const lt = label('Top gate', 'closes the dot'); lt.position.set(1.6, y + 0.3, -1.3);
    Q.add(lp, lb, ld, lt);
    this.labelsQd.push(lp, lb, ld, lt);
    gMetal.add(Q);

    // metallic-island SET (Al / AlOx)
    const S = this.setParts;
    S.add(trace([[-3.6, 0], [-0.78, 0]], 0.3, 0.08, M.alu, y));
    S.add(trace([[0.78, 0], [3.6, 0]], 0.3, 0.08, M.alu, y));
    const island = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.1, 48), M.alu);
    island.position.set(0, y + 0.05, 0); island.castShadow = true; S.add(island);
    for (const s of [-1, 1]) { const j = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.34), M.oxide); j.position.set(s * 0.69, y + 0.05, 0); S.add(j); }
    S.add(trace([[0, 1.8], [0, 1.05]], 0.24, 0.08, M.gold, y));
    S.add(trace([[0, 1.8], [0, 3.4]], 0.34, 0.06, M.gold, SUB + HET));
    const gp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.9), M.gold); gp.position.set(0, SUB + HET + 0.04, 3.6); S.add(gp);
    const li = label('Metal island', 'aluminium, charge in units of e', 'lbl-cyan'); li.position.set(0.3, y + 0.45, -0.2);
    const lj = label('Tunnel junctions', 'nm-thin AlOx'); lj.position.set(-1.5, y + 0.3, -0.7);
    const lg = label('Gate', 'capacitive, no current', 'lbl-amber'); lg.position.set(0.15, y + 0.3, 1.5);
    S.add(li, lj, lg);
    this.labelsSet.push(li, lj, lg);
    gMetal.add(S);
  }

  // ------------------------------------------------------------------ vertical RTD mesa
  private buildRtd() {
    const G = this.rtd;
    const mk = (lift: number) => { const g = new THREE.Group(); G.add(g); this.rtdLayers.push({ g, lift }); return g; };
    const base = mk(0);
    const subSide = new THREE.MeshStandardMaterial({ map: stackTexture([[0.75, '#1c2229'], [0.25, '#33404c']]), roughness: 0.8 });
    const top = new THREE.MeshStandardMaterial({ map: dieTopTexture(DW, DD, 'RTD-3/5 · W12', 'n⁺ GaAs collector  ·  Al0.3Ga0.7As 3 nm / GaAs 5 nm / 3 nm', [['E', 3.5, -2.0], ['C', -5.2, 2.1]]), roughness: 0.6, metalness: 0.15 });
    const die = boxFaces(DW, SUB + 0.3, DD, subSide, top); die.position.y = (SUB + 0.3) / 2; base.add(die);
    const R = 2.0, start = Math.PI / 2, len = Math.PI * 1.5;
    const layers: [number, THREE.Material, string][] = [
      [0.9, M.nplus, 'collector'], [0.22, M.spacer, 'spacer'], [0.2, M.barrier, 'barrier'],
      [0.3, M.well, 'well'], [0.2, M.barrier, 'barrier2'], [0.22, M.spacer, 'spacer2'], [0.9, M.nplus, 'emitter'], [0.2, M.gold, 'contact'],
    ];
    let y = SUB + 0.3;
    const ys: Record<string, number> = {};
    let i = 0;
    for (const [h, mat, name] of layers) {
      const g = mk(0.45 * ++i);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(R, R, h, 96, 1, false, start, len), mat);
      cyl.position.y = y + h / 2; cyl.castShadow = true; cyl.receiveShadow = true; g.add(cyl);
      const faceMat = name === 'well' ? this.wellGlow : mat;
      const f1 = new THREE.Mesh(new THREE.PlaneGeometry(R, h), faceMat); f1.position.set(R / 2, y + h / 2, 0);
      const f2 = new THREE.Mesh(new THREE.PlaneGeometry(R, h), faceMat); f2.rotation.y = Math.PI / 2; f2.position.set(0, y + h / 2, R / 2);
      for (const f of [f1, f2]) { f.castShadow = true; f.receiveShadow = true; }
      g.add(f1, f2);
      // cap discs make every layer read as a separate wafer slice when exploded
      const cap = new THREE.Mesh(new THREE.RingGeometry(0, R, 96, 1, start, len).rotateX(-Math.PI / 2), mat);
      cap.position.y = y + h; g.add(cap);
      const capB = new THREE.Mesh(new THREE.RingGeometry(0, R, 96, 1, start, len).rotateX(Math.PI / 2), mat);
      capB.position.y = y; g.add(capB);
      ys[name] = y + h / 2;
      y += h;
    }
    this.rtdTop = y;
    // contacts and air bridge
    const pad = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 2.2), M.gold);
    pad.position.set(4.6, SUB + 0.35, -2.0); pad.castShadow = true; base.add(pad);
    const bridge = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.5, y + 0.02, -0.9), new THREE.Vector3(1.6, y + 0.8, -1.6), new THREE.Vector3(3.8, SUB + 1.0, -2.0), new THREE.Vector3(4.6, SUB + 0.4, -2.0)]);
    const br = new THREE.Mesh(new THREE.TubeGeometry(bridge, 64, 0.16, 12, false), M.gold); br.castShadow = true; this.wiresRtd.add(br);
    const cpad = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 4.0), M.goldAlloy);
    cpad.position.set(-4.6, SUB + 0.35, 0); cpad.castShadow = true; base.add(cpad);
    this.wiresRtd.add(bondWire(new THREE.Vector3(4.6, SUB + 0.42, -2.0), new THREE.Vector3(9.2, 0.02, -3.2), 2.2));
    this.wiresRtd.add(bondWire(new THREE.Vector3(-4.6, SUB + 0.42, 0.6), new THREE.Vector3(-9.2, 0.02, 1.2), 2.2));
    G.add(this.wiresRtd);
    const lbl = (layerIdx: number, t: string, s: string, yy: number, cls = '', x = R + 0.3, z = 0.2) => {
      const l = label(t, s, cls); l.position.set(x, yy, z); this.rtdLayers[layerIdx].g.add(l); this.labelsRtd.push(l);
    };
    lbl(7, 'Emitter', 'n⁺ GaAs, sea of electrons', ys.emitter, 'lbl-cyan');
    lbl(5, 'Barrier', 'AlGaAs, 3 nm', ys.barrier2, '', -R * 0.7, R + 0.25);
    lbl(4, 'Quantum well', 'GaAs, one resonant level', ys.well, 'lbl-amber', R * 0.55, R + 0.35);
    lbl(1, 'Collector', 'n⁺ GaAs', ys.collector);
    const note = label('Layers not to scale', 'real stack ≈ 10 nm', 'lbl-dim'); note.position.set(-2.6, y + 0.5, 0.8); this.rtdLayers[8].g.add(note); this.labelsRtd.push(note);
  }

  setMode(mode: Mode) {
    this.mode = mode;
    this.lateral.visible = mode !== 'rtd';
    this.rtd.visible = mode === 'rtd';
    this.qdParts.visible = mode === 'qd';
    this.setParts.visible = mode === 'set';
    this.topMat.map = mode === 'set' ? this.topSet : this.topQd; this.topMat.needsUpdate = true;
    this.flyers.clear();
  }

  setExplode(on: boolean) { this.explodeT = on ? 1 : 0; }
  get exploded() { return this.explodeT > 0.5; }

  setLabels(on: boolean) {
    for (const l of [...this.labelsLateral, ...this.labelsQd, ...this.labelsSet, ...this.labelsRtd]) l.visible = on;
  }

  /** One tunnelling event in the lateral device. */
  hop(kind: 'in' | 'out', lead: 'S' | 'D') {
    const y = TOP + 0.13 + this.latLayers[3].g.position.y;
    const sx = lead === 'S' ? -4.0 : 4.0;
    const pts = kind === 'in'
      ? [new THREE.Vector3(sx, y, (Math.random() - 0.5) * 1.2), new THREE.Vector3(sx * 0.45, y, (Math.random() - 0.5) * 0.4), new THREE.Vector3(0, y + 0.04, 0)]
      : [new THREE.Vector3(0, y + 0.04, 0), new THREE.Vector3(sx * 0.45, y, (Math.random() - 0.5) * 0.4), new THREE.Vector3(sx, y, (Math.random() - 0.5) * 1.2)];
    this.flyers.spawn(polyPath(pts), 0.9, { fade: (u) => Math.min(1, Math.min(u, 1 - u) * 6) });
  }

  update(dt: number, t: number, level: number, Nfill: number) {
    this.flyers.update(dt);
    const k = 1 - Math.exp(-dt * 5);
    this.explode += (this.explodeT - this.explode) * k;
    const e = this.explode;
    for (const l of this.latLayers) l.g.position.y = l.lift * e;
    for (const l of this.rtdLayers) l.g.position.y = l.lift * e;
    this.wiresLat.visible = e < 0.05; this.wiresRtd.visible = e < 0.05;
    if (this.mode === 'rtd') {
      this.wellGlow.emissiveIntensity = 0.25 + 1.1 * level;
      this.rtdAcc += dt * level * 5;
      while (this.rtdAcc > 1) {
        this.rtdAcc -= 1;
        const a = Math.random() * Math.PI * 0.5, r = 0.3 + Math.random() * 1.5;
        const x = Math.sin(a) * r, z = Math.cos(a) * r;
        const top = this.rtdTop - 0.3 + 3.6 * e * 0.85, bot = SUB + 0.45;
        this.flyers.spawn((u) => new THREE.Vector3(x, top + (bot - top) * u, z), 1.8, { fade: (u) => 0.8 * Math.min(1, Math.min(u, 1 - u) * 5) });
      }
    } else {
      const m = this.puddle.material as THREE.MeshBasicMaterial;
      m.opacity = 0.18 + 0.08 * Math.min(Nfill, 6) + 0.35 * level + 0.04 * Math.sin(t * 2.4);
      this.puddle.scale.setScalar(0.75 + 0.07 * Math.min(Nfill, 6));
    }
  }
}
