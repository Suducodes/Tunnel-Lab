// Resonant tunneling diode: transfer-matrix transmission through a biased double barrier
// and the Tsu–Esaki current. Constant effective mass, linear potential drop across the
// active region, flat emitter/collector leads. Energies in eV, lengths in nm.
import { HBAR, K_NM, KB_EV, M0, Q, fermi3D, type Material } from './constants';

export interface RtdParams {
  mat: Material;
  barrier: number;   // barrier thickness, nm
  well: number;      // well width, nm
  T: number;         // K
  area: number;      // mesa area, µm²
}

export interface Slice { x0: number; x1: number; U: number; }

const SLICE = 0.25; // nm

/** Potential profile at bias V (V): emitter at 0, collector at -V, linear drop across the active region. */
export function profile(p: RtdParams, V: number): { slices: Slice[]; L: number } {
  const { barrier: b, well: w } = p;
  const L = 2 * b + w;
  const edges = [0, b, b + w, L];
  const slices: Slice[] = [];
  for (let r = 0; r < 3; r++) {
    const a = edges[r], z = edges[r + 1];
    const n = Math.max(1, Math.round((z - a) / SLICE));
    const base = r === 1 ? 0 : p.mat.vb;
    for (let i = 0; i < n; i++) {
      const x0 = a + ((z - a) * i) / n, x1 = a + ((z - a) * (i + 1)) / n;
      slices.push({ x0, x1, U: base - (V * (x0 + x1)) / 2 / L });
    }
  }
  return { slices, L };
}

/** Potential energy at x for drawing (includes leads). */
export function potentialAt(p: RtdParams, V: number, x: number): number {
  const L = 2 * p.barrier + p.well;
  if (x <= 0) return 0;
  if (x >= L) return -V;
  const inB = x < p.barrier || x > p.barrier + p.well;
  return (inB ? p.mat.vb : 0) - (V * x) / L;
}

// k for one region: returns [re, im]
function kOf(E: number, U: number, m: number): [number, number] {
  let d = E - U;
  if (Math.abs(d) < 1e-9) d = 1e-9;
  return d > 0 ? [K_NM * Math.sqrt(m * d), 0] : [0, K_NM * Math.sqrt(-m * d)];
}

// exp(i z) for complex z = zr + i zi
function cexpi(zr: number, zi: number): [number, number] {
  const a = Math.exp(-zi);
  return [a * Math.cos(zr), a * Math.sin(zr)];
}

interface Chain { ks: [number, number][]; xs: number[]; }

function chain(E: number, slices: Slice[], V: number, m: number): Chain {
  const ks: [number, number][] = [kOf(E, 0, m)];
  const xs: number[] = [];
  for (const s of slices) { xs.push(s.x0); ks.push(kOf(E, s.U, m)); }
  xs.push(slices[slices.length - 1].x1);
  ks.push(kOf(E, -V, m));
  return { ks, xs };
}

// Interface matrix mapping (A1,B1) -> (A2,B2) for psi = A e^{ikx} + B e^{-ikx} (global x).
// Writes into out[8] = [m11r,m11i,m12r,m12i,m21r,m21i,m22r,m22i]
function iface(ka: [number, number], kb: [number, number], x: number, out: number[]) {
  // r = ka/kb
  const den = kb[0] * kb[0] + kb[1] * kb[1];
  const rr = (ka[0] * kb[0] + ka[1] * kb[1]) / den;
  const ri = (ka[1] * kb[0] - ka[0] * kb[1]) / den;
  const pr = (1 + rr) / 2, pi = ri / 2, qr = (1 - rr) / 2, qi = -ri / 2;
  const e1 = cexpi((ka[0] - kb[0]) * x, (ka[1] - kb[1]) * x);
  const e2 = cexpi(-(ka[0] + kb[0]) * x, -(ka[1] + kb[1]) * x);
  const e3 = cexpi((ka[0] + kb[0]) * x, (ka[1] + kb[1]) * x);
  const e4 = cexpi(-(ka[0] - kb[0]) * x, -(ka[1] - kb[1]) * x);
  out[0] = pr * e1[0] - pi * e1[1]; out[1] = pr * e1[1] + pi * e1[0];
  out[2] = qr * e2[0] - qi * e2[1]; out[3] = qr * e2[1] + qi * e2[0];
  out[4] = qr * e3[0] - qi * e3[1]; out[5] = qr * e3[1] + qi * e3[0];
  out[6] = pr * e4[0] - pi * e4[1]; out[7] = pr * e4[1] + pi * e4[0];
}

// C = A * B (2x2 complex, flat)
function mul(A: number[], B: number[], C: number[]) {
  const r = (ar: number, ai: number, br: number, bi: number) => [ar * br - ai * bi, ar * bi + ai * br];
  const c = new Array(8);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const a0 = r(A[(i * 2) * 2], A[(i * 2) * 2 + 1], B[(j) * 2], B[(j) * 2 + 1]);
    const a1 = r(A[(i * 2 + 1) * 2], A[(i * 2 + 1) * 2 + 1], B[(2 + j) * 2], B[(2 + j) * 2 + 1]);
    c[(i * 2 + j) * 2] = a0[0] + a1[0]; c[(i * 2 + j) * 2 + 1] = a0[1] + a1[1];
  }
  for (let k = 0; k < 8; k++) C[k] = c[k];
}

const tmpI = new Array(8), tmpM = new Array(8);

function totalMatrix(ch: Chain, M: number[]) {
  M[0] = 1; M[1] = 0; M[2] = 0; M[3] = 0; M[4] = 0; M[5] = 0; M[6] = 1; M[7] = 0;
  for (let n = 0; n < ch.xs.length; n++) {
    iface(ch.ks[n], ch.ks[n + 1], ch.xs[n], tmpI);
    mul(tmpI, M, M);
  }
}

/** Transmission probability at longitudinal energy E (eV, from emitter band edge) and bias V. */
export function transmission(E: number, slices: Slice[], V: number, m: number): number {
  if (E <= 0 || E <= -V) return 0;
  // Allocation-free hot loop: M <- D(interface) * M for every interface.
  let m11r = 1, m11i = 0, m12r = 0, m12i = 0, m21r = 0, m21i = 0, m22r = 1, m22i = 0;
  const k0 = K_NM * Math.sqrt(m * E);
  let kar = k0, kai = 0;
  const ns = slices.length;
  let kbr = 0, kbi = 0;
  for (let n = 0; n <= ns; n++) {
    const x = n < ns ? slices[n].x0 : slices[ns - 1].x1;
    const U = n < ns ? slices[n].U : -V;
    let d = E - U;
    if (d < 1e-9 && d > -1e-9) d = 1e-9;
    if (d > 0) { kbr = K_NM * Math.sqrt(m * d); kbi = 0; } else { kbr = 0; kbi = K_NM * Math.sqrt(-m * d); }
    const den = kbr * kbr + kbi * kbi;
    const rr = (kar * kbr + kai * kbi) / den, ri = (kai * kbr - kar * kbi) / den;
    const pr = (1 + rr) * 0.5, pi = ri * 0.5, qr = (1 - rr) * 0.5, qi = -ri * 0.5;
    // e^{i z}: z = (ka - kb) x  and (ka + kb) x
    const dr = (kar - kbr) * x, di = (kai - kbi) * x, sr = (kar + kbr) * x, si = (kai + kbi) * x;
    const a1 = Math.exp(-di), c1 = Math.cos(dr), s1 = Math.sin(dr);
    const a3 = Math.exp(-si), c3 = Math.cos(sr), s3 = Math.sin(sr);
    const e1r = a1 * c1, e1i = a1 * s1;          // e^{i(ka-kb)x}
    const e4r = c1 / a1, e4i = -s1 / a1;         // e^{-i(ka-kb)x}
    const e3r = a3 * c3, e3i = a3 * s3;          // e^{i(ka+kb)x}
    const e2r = c3 / a3, e2i = -s3 / a3;         // e^{-i(ka+kb)x}
    const d11r = pr * e1r - pi * e1i, d11i = pr * e1i + pi * e1r;
    const d12r = qr * e2r - qi * e2i, d12i = qr * e2i + qi * e2r;
    const d21r = qr * e3r - qi * e3i, d21i = qr * e3i + qi * e3r;
    const d22r = pr * e4r - pi * e4i, d22i = pr * e4i + pi * e4r;
    const n11r = d11r * m11r - d11i * m11i + d12r * m21r - d12i * m21i;
    const n11i = d11r * m11i + d11i * m11r + d12r * m21i + d12i * m21r;
    const n12r = d11r * m12r - d11i * m12i + d12r * m22r - d12i * m22i;
    const n12i = d11r * m12i + d11i * m12r + d12r * m22i + d12i * m22r;
    const n21r = d21r * m11r - d21i * m11i + d22r * m21r - d22i * m21i;
    const n21i = d21r * m11i + d21i * m11r + d22r * m21i + d22i * m21r;
    const n22r = d21r * m12r - d21i * m12i + d22r * m22r - d22i * m22i;
    const n22i = d21r * m12i + d21i * m12r + d22r * m22i + d22i * m22r;
    m11r = n11r; m11i = n11i; m12r = n12r; m12i = n12i; m21r = n21r; m21i = n21i; m22r = n22r; m22i = n22i;
    kar = kbr; kai = kbi;
  }
  const kN = kbr;
  return Math.min(1, (k0 / kN) / (m22r * m22r + m22i * m22i));
}

/** |psi(x)|^2 of the scattering state incident from the emitter, sampled at xsOut. */
export function waveDensity(E: number, p: RtdParams, V: number, xsOut: number[]): number[] {
  const { slices } = profile(p, V);
  const m = p.mat.mEff;
  const ch = chain(E, slices, V, m);
  totalMatrix(ch, tmpM);
  // B0 = -M21/M22
  const den = tmpM[6] * tmpM[6] + tmpM[7] * tmpM[7];
  const b0r = -(tmpM[4] * tmpM[6] + tmpM[5] * tmpM[7]) / den;
  const b0i = -(tmpM[5] * tmpM[6] - tmpM[4] * tmpM[7]) / den;
  const amps: number[][] = [[1, 0, b0r, b0i]];
  let a = [1, 0, b0r, b0i];
  for (let n = 0; n < ch.xs.length; n++) {
    iface(ch.ks[n], ch.ks[n + 1], ch.xs[n], tmpI);
    const A2r = tmpI[0] * a[0] - tmpI[1] * a[1] + tmpI[2] * a[2] - tmpI[3] * a[3];
    const A2i = tmpI[0] * a[1] + tmpI[1] * a[0] + tmpI[2] * a[3] + tmpI[3] * a[2];
    const B2r = tmpI[4] * a[0] - tmpI[5] * a[1] + tmpI[6] * a[2] - tmpI[7] * a[3];
    const B2i = tmpI[4] * a[1] + tmpI[5] * a[0] + tmpI[6] * a[3] + tmpI[7] * a[2];
    a = [A2r, A2i, B2r, B2i];
    amps.push(a);
  }
  return xsOut.map((x) => {
    let r = 0;
    while (r < ch.xs.length && x >= ch.xs[r]) r++;
    const k = ch.ks[r], A = amps[r];
    const ep = cexpi(k[0] * x, k[1] * x), em = cexpi(-k[0] * x, -k[1] * x);
    const re = A[0] * ep[0] - A[1] * ep[1] + A[2] * em[0] - A[3] * em[1];
    const im = A[0] * ep[1] + A[1] * ep[0] + A[2] * em[1] + A[3] * em[0];
    return re * re + im * im;
  });
}

export function emitterFermi(p: RtdParams): number { return fermi3D(p.mat.doping, p.mat.mEff); }

/** Energy grid for T(E): fine enough to resolve resonances of 1.5–4 nm barriers. */
export function energyGrid(p: RtdParams, V: number): number[] {
  const EF = emitterFermi(p);
  const kT = KB_EV * p.T;
  const top = Math.max(EF + 14 * kT, EF + 0.02);
  const n = Math.min(1500, Math.ceil(top / 0.00025));
  const g: number[] = [];
  for (let i = 1; i <= n; i++) g.push((top * i) / n);
  void V;
  return g;
}

/** Supply function (dimensionless ln term of Tsu–Esaki). */
function supply(E: number, EF: number, V: number, kT: number): number {
  const a = (EF - E) / kT, b = (EF - V - E) / kT;
  const sp = (x: number) => (x > 40 ? x : Math.log1p(Math.exp(x)));
  return sp(a) - sp(b);
}

export interface RtdPoint { V: number; J: number; I: number; }

/** Current density J (A/m²) at bias V by Tsu–Esaki integration. */
export function currentDensity(p: RtdParams, V: number): number {
  const { slices } = profile(p, V);
  const EF = emitterFermi(p);
  const kT = Math.max(KB_EV * p.T, 1e-5);
  const grid = energyGrid(p, V);
  const m = p.mat.mEff;
  let s = 0, prev = 0, prevE = 0;
  for (const E of grid) {
    const f = transmission(E, slices, V, m) * supply(E, EF, V, kT);
    s += 0.5 * (f + prev) * (E - prevE);
    prev = f; prevE = E;
  }
  // J = q m* kT /(2 π² ħ³) ∫ T S dE   (energies in J)
  const pref = (Q * m * M0 * (kT * Q)) / (2 * Math.PI * Math.PI * HBAR ** 3);
  return pref * s * Q;
}

export function ivCurve(p: RtdParams, vMax: number, n: number): RtdPoint[] {
  const out: RtdPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const V = (vMax * i) / n;
    const J = currentDensity(p, V);
    out.push({ V, J, I: J * p.area * 1e-12 });
  }
  return out;
}

/** Resonance energies (local maxima of T) at bias V within [eMin, eMax]. */
export function resonances(p: RtdParams, V: number, eMax = p.mat.vb * 0.98): { E: number; T: number }[] {
  const { slices } = profile(p, V);
  const m = p.mat.mEff;
  const lo = Math.max(1e-4, -V + 1e-4);
  const n = 1600;
  const Es: number[] = [], Ts: number[] = [];
  for (let i = 0; i <= n; i++) { const E = lo + ((eMax - lo) * i) / n; Es.push(E); Ts.push(transmission(E, slices, V, m)); }
  const peaks: { E: number; T: number }[] = [];
  for (let i = 1; i < n; i++) {
    if (Ts[i] > Ts[i - 1] && Ts[i] >= Ts[i + 1] && Ts[i] > 1e-6) {
      // golden refine
      let a = Es[i - 1], b = Es[i + 1];
      for (let k = 0; k < 40; k++) {
        const c1 = a + (b - a) * 0.382, c2 = a + (b - a) * 0.618;
        if (transmission(c1, slices, V, m) > transmission(c2, slices, V, m)) b = c2; else a = c1;
      }
      const E = (a + b) / 2;
      peaks.push({ E, T: transmission(E, slices, V, m) });
    }
  }
  return peaks;
}

/** Resonance energies measured from the emitter band edge; first level vs bias. */
export function spectrum(p: RtdParams, V: number, n = 500): { E: number[]; T: number[] } {
  const { slices } = profile(p, V);
  const eMax = p.mat.vb * 1.05;
  const E: number[] = [], T: number[] = [];
  for (let i = 1; i <= n; i++) { const e = (eMax * i) / n; E.push(e); T.push(transmission(e, slices, V, p.mat.mEff)); }
  return { E, T };
}
