// Instrument-style canvas plots, all linked to the store.
import type { Store } from '../state';
import * as R from '../physics/rtd';
import * as D from '../physics/dot';
import { ticks, currentScale } from './format';

export const PAL = {
  grid: 'rgba(150,185,210,0.07)', axis: 'rgba(170,195,215,0.32)', text: '#7f909e', frost: '#e6edf2',
  cyan: '#5fe1ff', copper: '#e0915a', amber: '#ffc96b', rose: '#ff6f91', violet: '#9d8cff',
};
const MONO = '500 10px "JetBrains Mono", ui-monospace, monospace';

type Pad = { l: number; r: number; t: number; b: number };

abstract class Plot {
  canvas = document.createElement('canvas');
  ctx = this.canvas.getContext('2d')!;
  w = 0; h = 0; dpr = 1;
  pad: Pad = { l: 44, r: 12, t: 10, b: 26 };
  x0 = 0; x1 = 1; y0 = 0; y1 = 1;
  dragging = false;

  constructor(public host: HTMLElement, public store: Store) {
    host.appendChild(this.canvas);
    new ResizeObserver(() => this.resize()).observe(host);
    this.canvas.addEventListener('pointerdown', (e) => { this.dragging = true; this.canvas.setPointerCapture(e.pointerId); this.pick(e); });
    this.canvas.addEventListener('pointermove', (e) => { if (this.dragging) this.pick(e); });
    this.canvas.addEventListener('pointerup', () => { this.dragging = false; });
    this.canvas.addEventListener('pointercancel', () => { this.dragging = false; });
  }
  resize() {
    const r = this.host.getBoundingClientRect();
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.w = Math.max(10, r.width); this.h = Math.max(10, r.height);
    this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`; this.canvas.style.height = `${this.h}px`;
    this.draw();
  }
  get pw() { return this.w - this.pad.l - this.pad.r; }
  get ph() { return this.h - this.pad.t - this.pad.b; }
  X(v: number) { return this.pad.l + ((v - this.x0) / (this.x1 - this.x0)) * this.pw; }
  Y(v: number) { return this.pad.t + (1 - (v - this.y0) / (this.y1 - this.y0)) * this.ph; }
  invX(px: number) { return this.x0 + ((px - this.pad.l) / this.pw) * (this.x1 - this.x0); }
  invY(py: number) { return this.y0 + (1 - (py - this.pad.t) / this.ph) * (this.y1 - this.y0); }
  pick(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.onPick(this.invX(e.clientX - r.left), this.invY(e.clientY - r.top));
  }
  onPick(_x: number, _y: number) {}
  begin() {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    c.font = MONO; c.textBaseline = 'middle';
  }
  axes(xl: string, yl: string, fx: (v: number) => string = (v) => `${+v.toFixed(3)}`, fy: (v: number) => string = (v) => `${+v.toFixed(3)}`, yt?: number[]) {
    const c = this.ctx;
    c.lineWidth = 1;
    c.strokeStyle = PAL.grid;
    const xt = ticks(this.x0, this.x1, Math.max(3, Math.floor(this.pw / 70)));
    const ytk = yt ?? ticks(this.y0, this.y1, Math.max(3, Math.floor(this.ph / 36)));
    c.beginPath();
    for (const v of xt) { const x = Math.round(this.X(v)) + 0.5; c.moveTo(x, this.pad.t); c.lineTo(x, this.pad.t + this.ph); }
    for (const v of ytk) { const y = Math.round(this.Y(v)) + 0.5; c.moveTo(this.pad.l, y); c.lineTo(this.pad.l + this.pw, y); }
    c.stroke();
    c.strokeStyle = PAL.axis;
    c.strokeRect(this.pad.l + 0.5, this.pad.t + 0.5, this.pw - 1, this.ph - 1);
    c.fillStyle = PAL.text;
    c.textAlign = 'center';
    for (const v of xt) c.fillText(fx(v), this.X(v), this.pad.t + this.ph + 10);
    c.textAlign = 'right';
    for (const v of ytk) c.fillText(fy(v), this.pad.l - 5, this.Y(v));
    c.textAlign = 'right';
    c.fillText(xl, this.pad.l + this.pw, this.h - 5);
    c.save(); c.translate(10, this.pad.t + 2); c.textAlign = 'left'; c.fillText(yl, 0, 0); c.restore();
  }
  clip() { const c = this.ctx; c.save(); c.beginPath(); c.rect(this.pad.l, this.pad.t, this.pw, this.ph); c.clip(); }
  line(xs: number[], ys: number[], color: string, width = 1.8, glow = true) {
    const c = this.ctx;
    c.beginPath();
    xs.forEach((x, i) => { const px = this.X(x), py = this.Y(ys[i]); if (i) c.lineTo(px, py); else c.moveTo(px, py); });
    if (glow) { c.save(); c.strokeStyle = color; c.globalAlpha = 0.18; c.lineWidth = width + 5; c.stroke(); c.restore(); }
    c.strokeStyle = color; c.lineWidth = width; c.stroke();
  }
  cursor(x: number, y?: number) {
    const c = this.ctx;
    c.save();
    c.strokeStyle = 'rgba(255,201,107,0.7)'; c.setLineDash([3, 3]); c.lineWidth = 1;
    c.beginPath(); c.moveTo(this.X(x), this.pad.t); c.lineTo(this.X(x), this.pad.t + this.ph); c.stroke();
    if (y !== undefined) {
      c.setLineDash([]);
      c.fillStyle = PAL.amber; c.shadowColor = PAL.amber; c.shadowBlur = 12;
      c.beginPath(); c.arc(this.X(x), this.Y(y), 4, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }
  tag(text: string, x: number, y: number, color = PAL.text, align: CanvasTextAlign = 'left') {
    const c = this.ctx; c.fillStyle = color; c.textAlign = align; c.fillText(text, x, y);
  }
  abstract draw(): void;
}

// ---------------------------------------------------------------- band diagram
export class BandPlot extends Plot {
  pad = { l: 40, r: 12, t: 12, b: 24 };
  draw() {
    if (!this.w) return;
    this.begin();
    if (this.store.s.mode === 'rtd') this.drawRtd(); else this.drawDot();
  }
  private drawRtd() {
    const st = this.store, d = st.rtd, p = d.p, V = st.s.rtd.V, c = this.ctx;
    const L = 2 * p.barrier + p.well, lead = Math.max(6, L * 0.55);
    this.x0 = -lead; this.x1 = L + lead;
    this.y0 = Math.min(-V - 0.03, -0.04); this.y1 = p.mat.vb * 1.18;
    this.axes('x (nm)', 'E (meV)', (v) => v.toFixed(0), (v) => (v * 1000).toFixed(0));
    this.clip();
    // seas
    const fill = (xa: number, xb: number, ea: number, eb: number) => {
      const g = c.createLinearGradient(0, this.Y(eb), 0, this.Y(ea));
      g.addColorStop(0, 'rgba(95,225,255,0.55)'); g.addColorStop(1, 'rgba(95,225,255,0.10)');
      c.fillStyle = g; c.fillRect(this.X(xa), this.Y(eb), this.X(xb) - this.X(xa), this.Y(ea) - this.Y(eb));
    };
    fill(this.x0, 0, 0, d.EF);
    fill(L, this.x1, -V, d.EF - V);
    // band edge
    const xs: number[] = [], us: number[] = [];
    for (let i = 0; i <= 500; i++) { const x = this.x0 + ((this.x1 - this.x0) * i) / 500; xs.push(x); us.push(R.potentialAt(p, V, x)); }
    c.beginPath(); xs.forEach((x, i) => (i ? c.lineTo(this.X(x), this.Y(us[i])) : c.moveTo(this.X(x), this.Y(us[i]))));
    c.lineTo(this.X(this.x1), this.Y(this.y0)); c.lineTo(this.X(this.x0), this.Y(this.y0)); c.closePath();
    const bg = c.createLinearGradient(0, this.Y(this.y1), 0, this.Y(this.y0));
    bg.addColorStop(0, 'rgba(224,145,90,0.16)'); bg.addColorStop(1, 'rgba(224,145,90,0.02)');
    c.fillStyle = bg; c.fill();
    this.line(xs, us, PAL.copper, 1.6, false);
    // Fermi levels
    c.setLineDash([4, 4]); c.strokeStyle = 'rgba(95,225,255,0.8)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(this.X(this.x0), this.Y(d.EF)); c.lineTo(this.X(0), this.Y(d.EF));
    c.moveTo(this.X(L), this.Y(d.EF - V)); c.lineTo(this.X(this.x1), this.Y(d.EF - V)); c.stroke(); c.setLineDash([]);
    this.tag('μ emitter', this.X(this.x0) + 4, this.Y(d.EF) - 8, PAL.cyan);
    this.tag('μ collector', this.X(this.x1) - 4, this.Y(d.EF - V) - 8, PAL.cyan, 'right');
    // wavefunction of the first resonance
    const r1 = d.res[0];
    if (r1 && r1.E > 0) {
      const wx: number[] = []; for (let i = 0; i <= 300; i++) wx.push(this.x0 + ((this.x1 - this.x0) * i) / 300);
      const dens = R.waveDensity(r1.E, p, V, wx);
      const mx = Math.max(...dens.filter((v, i) => wx[i] > 0 && wx[i] < L));
      const amp = (this.y1 - this.y0) * 0.16;
      c.beginPath();
      wx.forEach((x, i) => { const y = this.Y(r1.E + (Math.min(dens[i], mx * 1.2) / mx) * amp); if (i) c.lineTo(this.X(x), y); else c.moveTo(this.X(x), y); });
      c.strokeStyle = 'rgba(157,140,255,0.9)'; c.lineWidth = 1.3; c.stroke();
      this.tag('|ψ|²', this.X(p.barrier + p.well / 2), this.Y(r1.E + amp) - 8, PAL.violet, 'center');
    }
    // resonance levels
    d.res.slice(0, 3).forEach((r, k) => {
      const inSea = r.E > 0 && r.E < d.EF + 0.002;
      c.save();
      c.strokeStyle = inSea ? PAL.amber : 'rgba(255,201,107,0.55)'; c.lineWidth = inSea ? 2.6 : 1.6;
      if (inSea) { c.shadowColor = PAL.amber; c.shadowBlur = 10; }
      c.beginPath(); c.moveTo(this.X(p.barrier), this.Y(r.E)); c.lineTo(this.X(p.barrier + p.well), this.Y(r.E)); c.stroke();
      c.restore();
      this.tag(`E${k + 1} ${(r.E * 1000).toFixed(0)} meV`, this.X(p.barrier + p.well) + 4, this.Y(r.E) + 8 * (k ? 1 : -1), PAL.amber);
    });
    c.restore();
  }
  private drawDot() {
    const st = this.store, d = st.dot, ds = st.dotS, p = d.p, c = this.ctx, kT = d.kT;
    const muS = ds.Vds / 2, muD = -ds.Vds / 2;
    const A = Math.max(p.Ec + (p.kind === 'qd' ? p.delta : 0), Math.abs(ds.Vds) / 2 + 0.6 * p.Ec);
    this.x0 = 0; this.x1 = 1; this.y0 = -1.7 * A; this.y1 = 1.7 * A;
    const norm = st.s.units === 'norm';
    this.axes('', norm ? 'E / Ec' : 'E (meV)', () => '', (v) => (norm ? (v / p.Ec).toFixed(1) : (v * 1000).toFixed(0)));
    this.clip();
    const bx = [0.3, 0.37, 0.63, 0.7];
    // leads with thermal edge
    const lead = (xa: number, xb: number, mu: number) => {
      const top = this.Y(mu + 3 * kT), mid = this.Y(mu), bot = this.Y(this.y0);
      const g = c.createLinearGradient(0, top, 0, bot);
      const s = Math.max(0.001, Math.min(0.5, (mid - top) / (bot - top)));
      g.addColorStop(0, 'rgba(95,225,255,0)'); g.addColorStop(s, 'rgba(95,225,255,0.5)'); g.addColorStop(1, 'rgba(95,225,255,0.08)');
      c.fillStyle = g; c.fillRect(this.X(xa), top, this.X(xb) - this.X(xa), bot - top);
      c.strokeStyle = 'rgba(95,225,255,0.9)'; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(this.X(xa), mid); c.lineTo(this.X(xb), mid); c.stroke(); c.setLineDash([]);
    };
    lead(0, bx[0], muS); lead(bx[3], 1, muD);
    this.tag('μS', this.X(0.02), this.Y(muS) - 9, PAL.cyan);
    this.tag('μD', this.X(0.98), this.Y(muD) - 9, PAL.cyan, 'right');
    this.tag('SOURCE', this.X(0.15), this.Y(this.y1) + 10, PAL.text, 'center');
    this.tag('DRAIN', this.X(0.85), this.Y(this.y1) + 10, PAL.text, 'center');
    // bias window
    c.fillStyle = 'rgba(255,201,107,0.07)';
    c.fillRect(this.X(bx[1]), this.Y(Math.max(muS, muD)), this.X(bx[2]) - this.X(bx[1]), Math.abs(this.Y(muS) - this.Y(muD)));
    // barriers
    for (const [a, b] of [[bx[0], bx[1]], [bx[2], bx[3]]]) {
      const g = c.createLinearGradient(this.X(a), 0, this.X(b), 0);
      g.addColorStop(0, 'rgba(224,145,90,0.15)'); g.addColorStop(0.5, 'rgba(224,145,90,0.45)'); g.addColorStop(1, 'rgba(224,145,90,0.15)');
      c.fillStyle = g; c.fillRect(this.X(a), this.pad.t, this.X(b) - this.X(a), this.ph);
    }
    // addition ladder
    const b = { Vg: ds.Vg, Vds: ds.Vds };
    const N = d.pt.Nmax;
    const lo = p.kind === 'qd' ? Math.max(0, N - 4) : N - 4;
    for (let k = lo; k <= N + 3; k++) {
      const mu = D.muAdd(p, b, k);     // k -> k+1
      if (mu < this.y0 || mu > this.y1) continue;
      const filled = k < N;
      const inWin = mu <= Math.max(muS, muD) + kT && mu >= Math.min(muS, muD) - kT;
      c.save();
      c.lineWidth = inWin ? 3 : 2;
      c.strokeStyle = inWin ? PAL.amber : filled ? 'rgba(230,237,242,0.85)' : 'rgba(230,237,242,0.35)';
      if (inWin) { c.shadowColor = PAL.amber; c.shadowBlur = 14; }
      c.beginPath(); c.moveTo(this.X(bx[1] + 0.02), this.Y(mu)); c.lineTo(this.X(bx[2] - 0.02), this.Y(mu)); c.stroke();
      c.restore();
      if (filled) { c.fillStyle = PAL.cyan; c.beginPath(); c.arc(this.X(0.5), this.Y(mu) - 5, 3.2, 0, Math.PI * 2); c.fill(); }
      this.tag(`${k}→${k + 1}`, this.X(bx[2] - 0.03), this.Y(mu) - 7, inWin ? PAL.amber : PAL.text, 'right');
      if (p.kind === 'qd') { // first excited entry for k -> k+1
        const ex = D.muAdd(p, b, k, k + (k % 2 === 0 ? 2 : 1));
        if (ex < this.y1 && ex - mu > 1e-6) {
          c.strokeStyle = 'rgba(157,140,255,0.45)'; c.setLineDash([3, 3]); c.lineWidth = 1;
          c.beginPath(); c.moveTo(this.X(bx[1] + 0.05), this.Y(ex)); c.lineTo(this.X(bx[1] + 0.13), this.Y(ex)); c.stroke(); c.setLineDash([]);
        }
      }
    }
    c.restore();
  }
}

// ---------------------------------------------------------------- I–V curve
export class CurvePlot extends Plot {
  pad = { l: 48, r: 12, t: 12, b: 26 };
  onPick(x: number) {
    const st = this.store;
    if (st.s.mode === 'rtd') st.point((s) => { s.rtd.V = Math.max(0, Math.min(st.rtd.vMax, x)); });
    else {
      const vd = st.dot.ranges.vdMax, f = st.s.units === 'norm' ? st.dot.p.Ec : 1;
      st.point(() => { st.dotS.Vds = Math.max(-vd, Math.min(vd, x * f)); });
    }
  }
  draw() {
    if (!this.w) return;
    this.begin();
    const st = this.store, c = this.ctx;
    if (st.s.mode === 'rtd') {
      const d = st.rtd, V = st.s.rtd.V;
      const curve = d.curve ?? [];
      const jmax = Math.max(1, ...curve.map((q) => q.J), d.J) / 1e7;
      this.x0 = 0; this.x1 = d.vMax; this.y0 = 0; this.y1 = jmax * 1.12;
      this.axes('V (V)', 'J (kA/cm²)', (v) => v.toFixed(2), (v) => (v >= 100 ? v.toFixed(0) : v.toPrecision(2)));
      this.clip();
      if (d.peak && d.valley) {
        c.fillStyle = 'rgba(255,111,145,0.09)';
        c.fillRect(this.X(d.peak.V), this.pad.t, this.X(d.valley.V) - this.X(d.peak.V), this.ph);
        this.tag('NDR', (this.X(d.peak.V) + this.X(d.valley.V)) / 2, this.pad.t + 10, PAL.rose, 'center');
      }
      if (curve.length) {
        c.globalAlpha = d.computing ? 0.35 : 1;
        this.line(curve.map((q) => q.V), curve.map((q) => q.J / 1e7), PAL.cyan, 2);
        c.globalAlpha = 1;
      }
      this.cursor(V, d.J / 1e7);
      if (d.computing) this.tag('solving…', this.pad.l + this.pw - 6, this.pad.t + 10, PAL.text, 'right');
      c.restore();
      return;
    }
    const d = st.dot, norm = st.s.units === 'norm', f = norm ? 1 / d.p.Ec : 1;
    const mx = Math.max(...d.ivds.I.map(Math.abs), 1e-18);
    const [k, u] = currentScale(mx);
    this.x0 = -d.ranges.vdMax * f; this.x1 = d.ranges.vdMax * f; this.y0 = -mx * k * 1.12; this.y1 = mx * k * 1.12;
    this.axes(norm ? 'Vds (Ec/e)' : 'Vds (mV)', `I (${u})`, (v) => (norm ? v.toFixed(1) : (v * 1000).toFixed(0)), (v) => +v.toPrecision(2) + '');
    this.clip();
    // blockade band
    const thr = 0.01 * mx;
    let a: number | null = null;
    c.fillStyle = 'rgba(255,111,145,0.08)';
    d.ivds.V.forEach((v, i) => {
      const bl = Math.abs(d.ivds.I[i]) < thr;
      if (bl && a === null) a = v;
      if ((!bl || i === d.ivds.V.length - 1) && a !== null) { c.fillRect(this.X(a * f), this.pad.t, this.X(v * f) - this.X(a * f), this.ph); a = null; }
    });
    this.line(d.ivds.V.map((v) => v * f), d.ivds.I.map((i) => i * k), PAL.cyan, 2);
    this.cursor(st.dotS.Vds * f, d.pt.I * k);
    c.restore();
  }
}

// ---------------------------------------------------------------- gate sweep (dot modes)
export class GatePlot extends Plot {
  pad = { l: 48, r: 12, t: 10, b: 24 };
  onPick(x: number) {
    const st = this.store, r = st.dot.ranges, f = st.s.units === 'norm' ? r.vgPeriod : 1;
    st.point(() => { st.dotS.Vg = Math.max(r.vg0, Math.min(r.vg1, x * f)); });
  }
  draw() {
    if (!this.w || this.store.s.mode === 'rtd') return;
    this.begin();
    const st = this.store, d = st.dot, norm = st.s.units === 'norm', f = norm ? 1 / d.ranges.vgPeriod : 1;
    const mx = Math.max(...d.ivg.I.map(Math.abs), 1e-18);
    const [k, u] = currentScale(mx);
    this.x0 = d.ranges.vg0 * f; this.x1 = d.ranges.vg1 * f;
    const neg = Math.min(...d.ivg.I) < -0.02 * mx;
    this.y0 = neg ? -mx * k * 1.12 : 0; this.y1 = mx * k * 1.12;
    this.axes(norm ? 'Vg (e/Cg)' : 'Vg (mV)', `I (${u})`, (v) => (norm ? v.toFixed(1) : (v * 1000).toFixed(0)), (v) => +v.toPrecision(2) + '');
    this.clip();
    const xs = d.ivg.V.map((v) => v * f), ys = d.ivg.I.map((i) => i * k);
    const c = this.ctx;
    c.beginPath(); xs.forEach((x, i) => (i ? c.lineTo(this.X(x), this.Y(ys[i])) : c.moveTo(this.X(x), this.Y(ys[i]))));
    c.lineTo(this.X(this.x1), this.Y(0)); c.lineTo(this.X(this.x0), this.Y(0)); c.closePath();
    c.fillStyle = 'rgba(95,225,255,0.10)'; c.fill();
    this.line(xs, ys, PAL.cyan, 1.8);
    this.cursor(st.dotS.Vg * f, d.pt.I * k);
    c.restore();
  }
}

// ---------------------------------------------------------------- stability map (dot modes)
export class MapPlot extends Plot {
  pad = { l: 48, r: 12, t: 10, b: 26 };
  private img: HTMLCanvasElement | null = null;
  private imgKey: unknown = null;
  onPick(x: number, y: number) {
    const st = this.store, r = st.dot.ranges, norm = st.s.units === 'norm';
    const fx = norm ? r.vgPeriod : 1, fy = norm ? st.dot.p.Ec : 1;
    st.point(() => {
      st.dotS.Vg = Math.max(r.vg0, Math.min(r.vg1, x * fx));
      st.dotS.Vds = Math.max(-r.vdMax, Math.min(r.vdMax, y * fy));
    });
  }
  private buildImage() {
    const st = this.store, m = st.dot.map!;
    const key = [m, st.s.mapKind];
    if (this.imgKey && (this.imgKey as unknown[])[0] === m && (this.imgKey as unknown[])[1] === st.s.mapKind) return;
    this.imgKey = key;
    const { nVg, nVd } = m.spec;
    const cv = this.img ?? document.createElement('canvas');
    cv.width = nVg; cv.height = nVd;
    const cx = cv.getContext('2d')!;
    const id = cx.createImageData(nVg, nVd);
    const useG = st.s.mapKind === 'didv';
    for (let j = 0; j < nVd; j++) for (let i = 0; i < nVg; i++) {
      const v = useG ? m.G[j * nVg + i] / m.Gmax : m.I[j * nVg + i] / m.Imax;
      const [r, g, b] = cmap(v, useG);
      const o = ((nVd - 1 - j) * nVg + i) * 4;
      id.data[o] = r; id.data[o + 1] = g; id.data[o + 2] = b; id.data[o + 3] = 255;
    }
    cx.putImageData(id, 0, 0);
    this.img = cv;
  }
  draw() {
    if (!this.w || this.store.s.mode === 'rtd' || !this.store.dot.map) return;
    this.begin();
    const st = this.store, d = st.dot, m = d.map!, norm = st.s.units === 'norm';
    const fx = norm ? 1 / d.ranges.vgPeriod : 1, fy = norm ? 1 / d.p.Ec : 1;
    this.x0 = m.spec.vg0 * fx; this.x1 = m.spec.vg1 * fx; this.y0 = m.spec.vd0 * fy; this.y1 = m.spec.vd1 * fy;
    this.buildImage();
    const c = this.ctx;
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(this.img!, this.pad.l, this.pad.t, this.pw, this.ph);
    this.axes(norm ? 'Vg (e/Cg)' : 'Vg (mV)', norm ? 'Vds (Ec/e)' : 'Vds (mV)', (v) => (norm ? v.toFixed(1) : (v * 1000).toFixed(0)), (v) => (norm ? v.toFixed(1) : (v * 1000).toFixed(0)));
    this.clip();
    // electron-number labels in each zero-bias diamond
    const mid = Math.floor(m.spec.nVd / 2);
    let start = -1;
    for (let i = 0; i <= m.spec.nVg; i++) {
      const blocked = i < m.spec.nVg && Math.abs(m.I[mid * m.spec.nVg + i]) < 1e-3 * m.Imax;
      if (blocked && start < 0) start = i;
      if (!blocked && start >= 0) {
        if (i - start > 6) {
          const vg = m.spec.vg0 + ((m.spec.vg1 - m.spec.vg0) * ((start + i - 1) / 2)) / (m.spec.nVg - 1);
          const N = D.groundN(d.p, { Vg: vg, Vds: 0 });
          this.tag(`N=${N}`, this.X(vg * fx), this.Y(0), 'rgba(230,237,242,0.75)', 'center');
        }
        start = -1;
      }
    }
    // crosshair
    const x = st.dotS.Vg * fx, y = st.dotS.Vds * fy;
    c.strokeStyle = 'rgba(255,201,107,0.55)'; c.setLineDash([3, 3]); c.lineWidth = 1;
    c.beginPath(); c.moveTo(this.X(x), this.pad.t); c.lineTo(this.X(x), this.pad.t + this.ph); c.moveTo(this.pad.l, this.Y(y)); c.lineTo(this.pad.l + this.pw, this.Y(y)); c.stroke(); c.setLineDash([]);
    c.strokeStyle = PAL.amber; c.lineWidth = 2; c.shadowColor = PAL.amber; c.shadowBlur = 10;
    c.beginPath(); c.arc(this.X(x), this.Y(y), 6, 0, Math.PI * 2); c.stroke(); c.shadowBlur = 0;
    c.restore();
  }
}

/** Cryo colormap: black → indigo → cyan → white; negatives in rose. */
function cmap(v: number, signed: boolean): [number, number, number] {
  if (!Number.isFinite(v)) v = 0;
  if (signed && v < 0) {
    const t = Math.min(1, Math.pow(-v, 0.45));
    return [Math.round(12 + 243 * t), Math.round(16 + 95 * t), Math.round(24 + 121 * t)];
  }
  const t = Math.min(1, Math.pow(Math.abs(v), signed ? 0.4 : 0.6));
  const stops: [number, number, number, number][] = [
    [0, 9, 13, 20], [0.25, 34, 30, 92], [0.5, 30, 110, 170], [0.75, 95, 225, 255], [1, 240, 252, 255],
  ];
  for (let k = 1; k < stops.length; k++) {
    if (t <= stops[k][0]) {
      const a = stops[k - 1], b = stops[k], u = (t - a[0]) / (b[0] - a[0]);
      return [Math.round(a[1] + (b[1] - a[1]) * u), Math.round(a[2] + (b[2] - a[2]) * u), Math.round(a[3] + (b[3] - a[3]) * u)];
    }
  }
  return [240, 252, 255];
}

// ---------------------------------------------------------------- transmission spectrum (RTD)
export class SpectrumPlot extends Plot {
  pad = { l: 44, r: 12, t: 10, b: 26 };
  draw() {
    if (!this.w || this.store.s.mode !== 'rtd') return;
    this.begin();
    const st = this.store, d = st.rtd, c = this.ctx, V = st.s.rtd.V;
    this.x0 = 0; this.x1 = d.p.mat.vb * 1.05; this.y0 = -8; this.y1 = 0.4;
    this.axes('E (meV)', 'log₁₀ T', (v) => (v * 1000).toFixed(0), (v) => v.toFixed(0), [-8, -6, -4, -2, 0]);
    this.clip();
    // supply function: occupied emitter states minus collector states
    const kT = Math.max(8.617e-5 * d.p.T, 1e-5);
    const sp = (x: number) => (x > 40 ? x : Math.log1p(Math.exp(x)));
    const Sx: number[] = [], Sy: number[] = [];
    let smax = 1e-30;
    for (let i = 0; i <= 300; i++) {
      const E = (this.x1 * i) / 300;
      const s = sp((d.EF - E) / kT) - sp((d.EF - V - E) / kT);
      Sx.push(E); Sy.push(s); smax = Math.max(smax, s);
    }
    c.beginPath(); c.moveTo(this.X(0), this.Y(this.y0));
    Sx.forEach((E, i) => c.lineTo(this.X(E), this.Y(this.y0 + (Sy[i] / smax) * (this.y1 - this.y0) * 0.55)));
    c.lineTo(this.X(this.x1), this.Y(this.y0)); c.closePath();
    c.fillStyle = 'rgba(95,225,255,0.13)'; c.fill();
    this.tag('electrons available', this.X(d.EF) + 6, this.Y(this.y0 + (this.y1 - this.y0) * 0.3), PAL.cyan, 'left');
    const lt = d.spec.T.map((t) => Math.max(-8, Math.log10(Math.max(t, 1e-12))));
    this.line(d.spec.E, lt, PAL.amber, 1.6);
    c.restore();
  }
}
