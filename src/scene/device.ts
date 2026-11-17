// The physical devices: a lateral gate-defined quantum dot, a metallic-island SET, and a vertical RTD mesa.
import * as THREE from 'three';
import { M, label, trace, bondWire } from './materials';
import { Flyers, polyPath } from './flyers';
import { glowTexture } from './stage';
import type { Mode } from '../state';

const TOP = 0.36; // top of the etched mesa (lateral devices)

export class Devices {
  group = new THREE.Group();
  private lateral = new THREE.Group();
  private qdParts = new THREE.Group();
  private setParts = new THREE.Group();
  private rtd = new THREE.Group();
  private labelsLateral: THREE.Object3D[] = [];
  private labelsQd: THREE.Object3D[] = [];
  private labelsSet: THREE.Object3D[] = [];
  private labelsRtd: THREE.Object3D[] = [];
  flyers = new Flyers(0.075);
  private dotGlow: THREE.Sprite;
  private wellGlow: THREE.MeshBasicMaterial;
  private mode: Mode = 'qd';
  private rtdAcc = 0;

  constructor() {
    this.group.add(this.lateral, this.rtd, this.flyers.group);
    this.buildFloor();
    this.buildLateral();
    this.dotGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#7fe9ff'), color: '#5fe1ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.dotGlow.position.set(0, TOP + 0.12, 0);
    this.dotGlow.scale.setScalar(1.4);
    this.lateral.add(this.dotGlow);
    this.wellGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc96b'), transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    this.buildRtd();
  }

  private buildFloor() {
    // dark lab bench with a faint engraved grid
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(512, 512, 40, 512, 512, 512);
    r.addColorStop(0, '#141b23'); r.addColorStop(1, '#06090d');
    g.fillStyle = r; g.fillRect(0, 0, 1024, 1024);
    g.strokeStyle = 'rgba(120,170,200,0.06)'; g.lineWidth = 1;
    for (let i = 0; i <= 1024; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 1024); g.moveTo(0, i); g.lineTo(1024, i); g.stroke(); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 96), new THREE.MeshStandardMaterial({ map: tex, color: '#8a96a0', roughness: 0.9, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -1.02; floor.receiveShadow = true;
    this.group.add(floor);
  }

  private chipBase(parent: THREE.Group) {
    const sub = new THREE.Mesh(new THREE.BoxGeometry(14, 1, 9), M.substrate);
    sub.position.y = -0.5; sub.castShadow = true; sub.receiveShadow = true;
    parent.add(sub);
  }

  private buildLateral() {
    const L = this.lateral;
    this.chipBase(L);
    const algaas = new THREE.Mesh(new THREE.BoxGeometry(14, 0.26, 9), M.algaas);
    algaas.position.y = 0.13; algaas.receiveShadow = true; L.add(algaas);
    const deg = new THREE.Mesh(new THREE.BoxGeometry(14.03, 0.022, 9.03), M.twoDeg);
    deg.position.y = 0.05; L.add(deg);
    // etched Hall-bar mesa carrying the 2DEG
    const mesa = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.1, 3.9), M.gaas);
    mesa.position.y = 0.31; mesa.castShadow = true; mesa.receiveShadow = true; L.add(mesa);
    // ohmic contacts (alloyed AuGeNi)
    for (const s of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 3.2), M.goldAlloy);
      pad.position.set(s * 5.1, TOP + 0.07, 0); pad.castShadow = true; L.add(pad);
      L.add(bondWire(new THREE.Vector3(s * 5.4, TOP + 0.14, 0), new THREE.Vector3(s * 8.5, -0.9, 0), 1.8));
    }
    const lS = label('Source', 'ohmic contact'); lS.position.set(-5.1, TOP + 0.4, 1.7);
    const lD = label('Drain', 'ohmic contact'); lD.position.set(5.1, TOP + 0.4, 1.7);
    const l2 = label('2DEG', 'electron sheet below the surface', 'lbl-cyan'); l2.position.set(-6.9, 0.05, 4.5);
    L.add(lS, lD, l2);
    this.labelsLateral.push(lS, lD, l2);

    // --- gate-defined quantum dot (Ti/Au surface gates)
    const Q = this.qdParts;
    const y = TOP;
    const add = (pts: [number, number][], w: number) => Q.add(trace(pts, w, 0.07, M.gold, y));
    add([[0, -4.0], [0, -1.3]], 0.5);
    add([[-1.55, -0.95], [1.55, -0.95]], 0.3);
    add([[0, -1.3], [0, -0.95]], 0.3);
    add([[-3.2, 4.0], [-3.2, 2.5], [-0.8, 1.0], [-0.8, 0.42]], 0.24);
    add([[3.2, 4.0], [3.2, 2.5], [0.8, 1.0], [0.8, 0.42]], 0.24);
    add([[0, 4.0], [0, 1.05]], 0.26);
    for (const [x, z] of [[-3.2, 4.0], [0, 4.0], [3.2, 4.0], [0, -4.0]] as [number, number][]) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.08, 0.9), M.gold);
      pad.position.set(x, 0.3, z + Math.sign(z) * 0.1); pad.castShadow = true; Q.add(pad);
      Q.add(bondWire(new THREE.Vector3(x, 0.36, z + Math.sign(z) * 0.2), new THREE.Vector3(x * 1.4, -0.9, z * 1.75), 1.5));
    }
    const lp = label('Plunger gate', 'Vg sets the dot energy', 'lbl-amber'); lp.position.set(0.15, y + 0.3, 2.6);
    const lb = label('Barrier gates', 'pinch the tunnel barriers'); lb.position.set(-2.6, y + 0.3, 2.1);
    const ld = label('Quantum dot', '≈ tens of nm across', 'lbl-cyan'); ld.position.set(0.25, y + 0.55, -0.15);
    const lt = label('Top gate', 'confines the dot'); lt.position.set(1.7, y + 0.3, -1.6);
    Q.add(lp, lb, ld, lt);
    this.labelsQd.push(lp, lb, ld, lt);
    L.add(Q);

    // --- metallic-island SET (Al / AlOx junctions)
    const S = this.setParts;
    S.add(trace([[-4.0, 0], [-0.78, 0]], 0.28, 0.07, M.alu, y));
    S.add(trace([[0.78, 0], [4.0, 0]], 0.28, 0.07, M.alu, y));
    const island = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.09, 48), M.alu);
    island.position.set(0, y + 0.045, 0); island.castShadow = true; S.add(island);
    for (const s of [-1, 1]) {
      const j = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.3), M.oxide);
      j.position.set(s * 0.7, y + 0.05, 0); S.add(j);
    }
    S.add(trace([[0, 4.0], [0, 1.1]], 0.26, 0.07, M.gold, y));
    const gp = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.08, 0.9), M.gold);
    gp.position.set(0, 0.3, 4.1); S.add(gp);
    S.add(bondWire(new THREE.Vector3(0, 0.36, 4.2), new THREE.Vector3(0, -0.9, 7), 1.5));
    const li = label('Metal island', 'aluminium, charge in units of e', 'lbl-cyan'); li.position.set(0.3, y + 0.5, -0.2);
    const lj = label('Tunnel junctions', 'nm-thin AlOx'); lj.position.set(-1.6, y + 0.3, -0.8);
    const lg = label('Gate', 'capacitive, no current', 'lbl-amber'); lg.position.set(0.15, y + 0.3, 2.6);
    S.add(li, lj, lg);
    this.labelsSet.push(li, lj, lg);
    L.add(S);
  }

  private buildRtd() {
    const G = this.rtd;
    this.chipBase(G);
    const coll = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 9), M.nplus);
    coll.position.y = 0.15; coll.receiveShadow = true; G.add(coll);
    const R = 2.1, start = Math.PI / 2, len = Math.PI * 1.5;
    const layers: [number, THREE.Material, string][] = [
      [0.95, M.nplus, 'collector'], [0.22, M.algaas, 'spacer'], [0.2, M.barrier, 'barrier'],
      [0.3, M.well, 'well'], [0.2, M.barrier, 'barrier'], [0.22, M.algaas, 'spacer'], [0.95, M.nplus, 'emitter'], [0.22, M.gold, 'contact'],
    ];
    let y = 0.3;
    const ys: Record<string, number> = {};
    for (const [h, mat, name] of layers) {
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(R, R, h, 96, 1, false, start, len), mat);
      cyl.position.y = y + h / 2; cyl.castShadow = true; cyl.receiveShadow = true;
      G.add(cyl);
      const faceMat = name === 'well' ? this.wellGlow : mat;
      const f1 = new THREE.Mesh(new THREE.PlaneGeometry(R, h), faceMat);
      f1.position.set(R / 2, y + h / 2, 0);
      const f2 = new THREE.Mesh(new THREE.PlaneGeometry(R, h), faceMat);
      f2.rotation.y = Math.PI / 2; f2.position.set(0, y + h / 2, R / 2);
      if (name !== 'well') { (f1.material as THREE.Material).side = THREE.DoubleSide; }
      G.add(f1, f2);
      ys[name] = y + h / 2;
      y += h;
    }
    ys.top = y;
    // contacts and air bridge
    const pad = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 2.4), M.gold);
    pad.position.set(5, 0.36, -2.2); pad.castShadow = true; G.add(pad);
    const bridge = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.6, y + 0.02, -0.9), new THREE.Vector3(1.8, y + 0.9, -1.8), new THREE.Vector3(4.2, 0.9, -2.2), new THREE.Vector3(5, 0.42, -2.2)]);
    const br = new THREE.Mesh(new THREE.TubeGeometry(bridge, 64, 0.16, 12, false), M.gold); br.castShadow = true; G.add(br);
    const cpad = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 4.4), M.goldAlloy);
    cpad.position.set(-4.9, 0.36, 0); cpad.castShadow = true; G.add(cpad);
    G.add(bondWire(new THREE.Vector3(5, 0.42, -2.2), new THREE.Vector3(8.5, -0.9, -3.5), 1.6));
    G.add(bondWire(new THREE.Vector3(-4.9, 0.42, 0), new THREE.Vector3(-8.5, -0.9, 0.5), 1.6));
    const mk = (t: string, s: string, yy: number, cls = '', x = R + 0.25, z = 0.2) => { const l = label(t, s, cls); l.position.set(x, yy, z); G.add(l); this.labelsRtd.push(l); };
    mk('Emitter', 'n⁺ GaAs, sea of electrons', ys.emitter + 0.2, 'lbl-cyan');
    mk('Barrier', 'AlGaAs, a few nm', ys.barrier + 0.25, '', -R * 0.75, R + 0.2);
    mk('Quantum well', 'one resonant level', ys.well - 0.15, 'lbl-amber', R * 0.55, R + 0.3);
    mk('Collector', 'n⁺ GaAs', ys.collector, '');
    mk('Air bridge', 'top contact', ys.top + 0.6, '', 2.4, -2.2);
    const note = label('Layers not to scale', 'real stack ≈ 10 nm', 'lbl-dim'); note.position.set(-2.4, ys.top + 0.5, 1.2); G.add(note); this.labelsRtd.push(note);
    this.rtdY = ys;
  }
  private rtdY: Record<string, number> = {};

  setMode(mode: Mode) {
    this.mode = mode;
    this.lateral.visible = mode !== 'rtd';
    this.rtd.visible = mode === 'rtd';
    this.qdParts.visible = mode === 'qd';
    this.setParts.visible = mode === 'set';
    this.flyers.clear();
  }

  setLabels(on: boolean) {
    const all = [...this.labelsLateral, ...this.labelsQd, ...this.labelsSet, ...this.labelsRtd];
    for (const l of all) l.visible = on;
    if (on) {
      for (const l of this.labelsQd) l.visible = this.mode === 'qd';
      for (const l of this.labelsSet) l.visible = this.mode === 'set';
      for (const l of this.labelsLateral) l.visible = this.mode !== 'rtd';
      for (const l of this.labelsRtd) l.visible = this.mode === 'rtd';
    }
  }

  /** One tunnelling event in the lateral device. dir +1: source→dot or dot→drain; -1 reverse. */
  hop(kind: 'in' | 'out', lead: 'S' | 'D') {
    const y = TOP + 0.16;
    const sx = lead === 'S' ? -4.4 : 4.4;
    const pts = kind === 'in'
      ? [new THREE.Vector3(sx, y, (Math.random() - 0.5) * 1.2), new THREE.Vector3(sx * 0.45, y, (Math.random() - 0.5) * 0.4), new THREE.Vector3(0, y + 0.05, 0)]
      : [new THREE.Vector3(0, y + 0.05, 0), new THREE.Vector3(sx * 0.45, y, (Math.random() - 0.5) * 0.4), new THREE.Vector3(sx, y, (Math.random() - 0.5) * 1.2)];
    this.flyers.spawn(polyPath(pts), 0.9, { fade: (u) => Math.min(1, Math.min(u, 1 - u) * 6) });
  }

  update(dt: number, t: number, level: number, Nfill: number) {
    // level: 0..1 normalised current
    this.flyers.update(dt);
    if (this.mode === 'rtd') {
      this.wellGlow.opacity = 0.35 + 0.65 * level;
      const k = 0.35 + 0.85 * level;
      this.wellGlow.color.setRGB(1 * k, 0.72 * k, 0.36 * k);
      this.rtdAcc += dt * level * 4;
      while (this.rtdAcc > 1) {
        this.rtdAcc -= 1;
        const a = Math.random() * Math.PI * 0.5, r = 0.3 + Math.random() * 1.6;
        const x = Math.sin(a) * r, z = Math.cos(a) * r;
        const top = this.rtdY.top - 0.25, bot = 0.35;
        this.flyers.spawn((u) => new THREE.Vector3(x, top + (bot - top) * u, z), 1.6, { hot: false, fade: (u) => 0.55 * Math.min(1, Math.min(u, 1 - u) * 5) });
      }
    } else {
      const m = this.dotGlow.material as THREE.SpriteMaterial;
      m.opacity = 0.35 + 0.5 * level + 0.06 * Math.sin(t * 3);
      this.dotGlow.scale.setScalar(0.7 + 0.2 * Math.min(Nfill, 6) / 6 + 0.45 * level);
    }
  }
}
