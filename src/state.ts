// Application state and everything derived from it. Views subscribe and redraw.
import { KB_EV, MATERIALS, type Material } from './physics/constants';
import * as R from './physics/rtd';
import * as D from './physics/dot';

export type Mode = 'rtd' | 'set' | 'qd';
export type View = 'device' | 'landscape';

export interface DotS { mat: string; diameter: number; barrier: number; Vg: number; Vds: number; }
export interface S {
  mode: Mode; view: View; T: number; units: 'si' | 'norm'; mapKind: 'didv' | 'i';
  rtd: { mat: string; barrier: number; well: number; area: number; V: number };
  set: DotS; qd: DotS;
}

export interface RtdDerived {
  p: R.RtdParams; EF: number; E1: number; vMax: number;
  curve: R.RtdPoint[] | null; computing: boolean;
  res: { E: number; T: number }[]; J: number; I: number; slope: number;
  peak: R.RtdPoint | null; valley: R.RtdPoint | null; pvcr: number;
  spec: { E: number[]; T: number[] };
}

export interface DotDerived {
  p: D.DotParams; ranges: ReturnType<typeof D.naturalRanges>; kT: number;
  pt: D.DotState; blocked: boolean; Imax: number;
  map: { spec: D.MapSpec; I: Float64Array; G: Float64Array; Gmax: number; Imax: number } | null;
  ivds: { V: number[]; I: number[] }; ivg: { V: number[]; I: number[] };
}

export const mat = (id: string): Material => MATERIALS.find((m) => m.id === id) ?? MATERIALS[0];

export class Store {
  s: S = {
    mode: 'qd', view: 'device', T: 4, units: 'si', mapKind: 'didv',
    rtd: { mat: 'gaas', barrier: 3, well: 5, area: 1, V: 0.1 },
    set: { mat: 'al', diameter: 20, barrier: 1.6, Vg: NaN, Vds: 0.004 },
    qd: { mat: 'gaas', diameter: 24, barrier: 4.5, Vg: NaN, Vds: 0.002 },
  };
  rtd!: RtdDerived;
  dot!: DotDerived;
  private subs = new Set<(why: 'point' | 'params' | 'curve' | 'map' | 'ui') => void>();
  private worker = new Worker(new URL('./physics/rtd.worker.ts', import.meta.url), { type: 'module' });
  private reqId = 0;
  private mapTimer = 0;
  private curveTimer = 0;

  constructor() {
    this.worker.onmessage = (ev: MessageEvent<{ id: number; curve: R.RtdPoint[] }>) => {
      if (ev.data.id !== this.reqId) return;
      this.rtd.curve = ev.data.curve;
      this.rtd.computing = false;
      this.analyseCurve();
      this.rtdPoint();
      this.emit('curve');
    };
    this.rtdParams(true);
    this.dotParams(true);
  }

  on(fn: (why: 'point' | 'params' | 'curve' | 'map' | 'ui') => void) { this.subs.add(fn); return () => this.subs.delete(fn); }
  private emit(why: 'point' | 'params' | 'curve' | 'map' | 'ui') { for (const f of this.subs) f(why); }

  get dotS(): DotS { return this.s.mode === 'set' ? this.s.set : this.s.qd; }

  /** UI-only change (view, units, mode switch) */
  ui(fn: (s: S) => void) {
    const prevMode = this.s.mode;
    fn(this.s);
    if (this.s.mode !== prevMode) { if (this.s.mode === 'rtd') this.rtdParams(true); else this.dotParams(true); }
    this.emit('ui');
  }

  /** Operating-point change: bias / gate. */
  point(fn: (s: S) => void) {
    fn(this.s);
    if (this.s.mode === 'rtd') this.rtdPoint(); else this.dotPoint();
    this.emit('point');
  }

  /** Device or temperature change: recompute curves and maps. `final` = slider released. */
  params(fn: (s: S) => void, final = true) {
    fn(this.s);
    if (this.s.mode === 'rtd') this.rtdParams(final); else this.dotParams(final);
    this.emit('params');
  }

  // ---------- RTD ----------
  private rtdParams(final: boolean) {
    const r = this.s.rtd;
    const p: R.RtdParams = { mat: mat(r.mat), barrier: r.barrier, well: r.well, T: this.s.T, area: r.area };
    const res0 = R.resonances(p, 0);
    const E1 = res0[0]?.E ?? p.mat.vb * 0.5;
    const vMax = Math.min(1.8, Math.max(0.3, 4.4 * E1 + 0.1));
    r.V = Math.min(r.V, vMax);
    this.rtd = {
      p, EF: R.emitterFermi(p), E1, vMax, curve: this.rtd?.curve ?? null, computing: true,
      res: [], J: 0, I: 0, slope: 0, peak: null, valley: null, pvcr: 0, spec: { E: [], T: [] },
    };
    clearTimeout(this.curveTimer);
    if (!this.rtd.curve && final) {
      // first time: solve on the main thread so the curve is there on first paint
      this.rtd.curve = R.ivCurve(p, vMax, 140); this.rtd.computing = false; this.analyseCurve();
      this.rtdPoint();
      return;
    }
    const go = () => { this.reqId++; this.worker.postMessage({ id: this.reqId, p, vMax, n: 140 }); };
    if (final) go(); else this.curveTimer = window.setTimeout(go, 90);
    this.rtdPoint();
  }

  private analyseCurve() {
    const c = this.rtd.curve!;
    let pk = 0;
    for (let i = 1; i < c.length; i++) { if (c[i].J >= c[pk].J) pk = i; else if (c[i].J < 0.8 * c[pk].J) break; }
    let vl = pk;
    for (let i = pk; i < c.length; i++) { if (c[i].J <= c[vl].J) vl = i; else if (c[i].J > 1.3 * c[vl].J) break; }
    const hasNdr = vl > pk && c[pk].J > 1.05 * c[vl].J;
    this.rtd.peak = hasNdr ? c[pk] : null;
    this.rtd.valley = hasNdr ? c[vl] : null;
    this.rtd.pvcr = hasNdr ? c[pk].J / Math.max(c[vl].J, 1e-30) : 1;
  }

  private rtdPoint() {
    const d = this.rtd, V = this.s.rtd.V;
    d.J = R.currentDensity(d.p, V);
    d.I = d.J * d.p.area * 1e-12;
    const dv = 0.004;
    d.slope = (R.currentDensity(d.p, V + dv) - R.currentDensity(d.p, Math.max(0, V - dv))) / (V + dv - Math.max(0, V - dv));
    d.res = R.resonances(d.p, V);
    d.spec = R.spectrum(d.p, V, 420);
  }

  // ---------- SET / QD ----------
  private dotParams(final: boolean) {
    const ds = this.dotS, m = mat(ds.mat);
    const p = D.deriveDot({ kind: this.s.mode === 'set' ? 'set' : 'qd', diameter: ds.diameter, barrier: ds.barrier, mEff: m.mEff, vb: m.vb, epsR: m.epsR, T: this.s.T });
    const ranges = D.naturalRanges(p);
    if (!Number.isFinite(ds.Vg) || ds.Vg < ranges.vg0 || ds.Vg > ranges.vg1) ds.Vg = this.defaultVg(p, ranges);
    ds.Vds = Math.max(-ranges.vdMax, Math.min(ranges.vdMax, ds.Vds));
    this.dot = {
      p, ranges, kT: KB_EV * this.s.T, pt: D.solve(p, { Vg: ds.Vg, Vds: ds.Vds }), blocked: false, Imax: 1e-12,
      map: this.dot?.map && this.dot.p.kind === p.kind ? this.dot.map : null, ivds: { V: [], I: [] }, ivg: { V: [], I: [] },
    };
    this.dot.Imax = this.peakCurrent();
    this.dotPoint();
    clearTimeout(this.mapTimer);
    this.computeMap(final ? 200 : 110, final ? 140 : 76);
    if (!final) this.mapTimer = window.setTimeout(() => { this.computeMap(200, 140); this.emit('map'); }, 180);
  }

  private defaultVg(p: D.DotParams, r: ReturnType<typeof D.naturalRanges>): number {
    // centre of a blockade diamond: N = 2 for a dot, N = 1 for a metallic island
    const a = p.Cg / p.Csum;
    if (p.kind === 'qd') { const mu12 = D.muAdd(p, { Vg: 0, Vds: 0 }, 1), mu23 = D.muAdd(p, { Vg: 0, Vds: 0 }, 2); return (mu12 + mu23) / 2 / a; }
    return r.vgPeriod * 1.0 + 0 * a;
  }

  private peakCurrent(): number {
    const p = this.dot.p, ds = this.dotS;
    // maximum current over a gate sweep at the present bias, for normalising meters
    const r = this.dot.ranges; let mx = 1e-18;
    for (let i = 0; i <= 160; i++) mx = Math.max(mx, Math.abs(D.solve(p, { Vg: r.vg0 + ((r.vg1 - r.vg0) * i) / 160, Vds: Math.max(Math.abs(ds.Vds), r.vdMax * 0.6) }).I));
    return mx;
  }

  private dotPoint() {
    const d = this.dot, ds = this.dotS, p = d.p;
    d.pt = D.solve(p, { Vg: ds.Vg, Vds: ds.Vds });
    const ref = Math.max(...[...Array(41)].map((_, i) => Math.abs(D.solve(p, { Vg: d.ranges.vg0 + ((d.ranges.vg1 - d.ranges.vg0) * i) / 40, Vds: ds.Vds }).I)), 1e-18);
    d.blocked = Math.abs(d.pt.I) < 0.02 * Math.max(ref, d.Imax * 0.05);
    const n = 220;
    const V: number[] = [], I: number[] = [];
    for (let i = 0; i <= n; i++) { const v = -d.ranges.vdMax + (2 * d.ranges.vdMax * i) / n; V.push(v); I.push(D.solve(p, { Vg: ds.Vg, Vds: v }).I); }
    d.ivds = { V, I };
    const G: number[] = [], J: number[] = [];
    for (let i = 0; i <= n; i++) { const g = d.ranges.vg0 + ((d.ranges.vg1 - d.ranges.vg0) * i) / n; G.push(g); J.push(D.solve(p, { Vg: g, Vds: ds.Vds }).I); }
    d.ivg = { V: G, I: J };
  }

  private computeMap(nVg: number, nVd: number) {
    const d = this.dot, r = d.ranges;
    const spec: D.MapSpec = { vg0: r.vg0, vg1: r.vg1, nVg, vd0: -r.vdMax, vd1: r.vdMax, nVd };
    const I = D.currentMap(d.p, spec);
    const G = new Float64Array(I.length);
    const dV = (spec.vd1 - spec.vd0) / (nVd - 1);
    let Gmax = 1e-30, Imax = 1e-30;
    for (let j = 0; j < nVd; j++) for (let i = 0; i < nVg; i++) {
      const a = I[Math.max(0, j - 1) * nVg + i], b = I[Math.min(nVd - 1, j + 1) * nVg + i];
      const g = (b - a) / (dV * (Math.min(nVd - 1, j + 1) - Math.max(0, j - 1)));
      G[j * nVg + i] = g;
      Gmax = Math.max(Gmax, Math.abs(g)); Imax = Math.max(Imax, Math.abs(I[j * nVg + i]));
    }
    d.map = { spec, I, G, Gmax, Imax };
  }
}
