// Single-electron transistor and quantum dot: sequential tunneling master equation.
//  - 'set'  : metallic island, orthodox theory (continuous levels, tunnel resistances)
//  - 'qd'   : quantum dot, constant-interaction model (charging + discrete spin-degenerate orbitals),
//             fast internal relaxation so the state is the electron number N.
// Energies in eV, voltages in V. Bias is symmetric: Vs = -Vds/2, Vd = +Vds/2, so the source
// electrochemical potential is +Vds/2 and electrons flow source -> drain for Vds > 0.
import { EPS0, KB_EV, Q, K_NM, HB2M0 } from './constants';

export type DotKind = 'set' | 'qd';

export interface DotParams {
  kind: DotKind;
  Ec: number;          // charging energy e²/CΣ, eV
  Cs: number; Cd: number; Cg: number; Csum: number;  // F
  delta: number;       // orbital spacing, eV (qd only)
  gammaS: number; gammaD: number;   // tunnel rates, 1/s (qd)
  Rs: number; Rd: number;           // tunnel resistances, Ω (set)
  T: number;           // K
  q0: number;          // background offset charge, units of e
}

export interface DotGeometry {
  diameter: number;    // nm
  barrier: number;     // nm
  mEff: number; vb: number; epsR: number;
  T: number;
  kind: DotKind;
}

/** Derive circuit parameters from a disk-shaped island. */
export function deriveDot(g: DotGeometry): DotParams {
  const d = g.diameter * 1e-9;
  const Csum = 4 * EPS0 * g.epsR * d;          // disk self-capacitance 8 ε r
  const Cg = 0.3 * Csum, Cs = 0.35 * Csum, Cd = 0.35 * Csum;
  const Ec = Q / Csum;                          // eV
  const area = Math.PI * (g.diameter / 2) ** 2; // nm²
  const delta = (2 * Math.PI * 2 * HB2M0) / (g.mEff * area); // 2πħ²/(m* A): spacing of spin-degenerate orbitals (eV)
  // tunnelling: attempt frequency × WKB barrier factor (at mid-barrier energy)
  // a quantum dot's barriers are electrostatic (set by gate voltages), so they are far lower
  // than the band offset of the material: cap at 0.25 eV
  const vbEff = g.kind === 'qd' ? Math.min(g.vb, 0.25) : g.vb;
  const kappa = K_NM * Math.sqrt(g.mEff * vbEff * 0.9);
  const tb = Math.exp(-2 * kappa * g.barrier);
  const gamma = 5e12 * tb;
  // metallic junctions: ~150 kΩ at 1.5 nm oxide, growing exponentially with thickness
  const R = 150e3 * Math.exp(2.2 * (g.barrier - 1.5));
  return { kind: g.kind, Ec, Cs, Cd, Cg, Csum, delta, gammaS: gamma, gammaD: gamma, Rs: R, Rd: R, T: g.T, q0: 0 };
}

const fermi = (x: number, kT: number) => {
  const a = x / kT;
  if (a > 60) return 0;
  if (a < -60) return 1;
  return 1 / (1 + Math.exp(a));
};

// orthodox rate for energy gain dF (eV) through resistance R
function orthodox(dF: number, R: number, kT: number): number {
  const a = dF / kT;
  if (Math.abs(a) < 1e-6) return kT / (Q * R);
  if (a < -60) return 0;
  return dF / (Q * R) / (1 - Math.exp(-a));
}

export interface Bias { Vg: number; Vds: number; }

/** φ: potential of the island from its electrodes (V). */
export function islandPhi(p: DotParams, b: Bias): number {
  const Vs = -b.Vds / 2, Vd = b.Vds / 2;
  return (p.Cg * b.Vg + p.Cs * Vs + p.Cd * Vd) / p.Csum;
}

export function orbital(p: DotParams, slot: number): number {
  return p.kind === 'qd' ? p.delta * Math.floor(slot / 2) : 0;
}

/** Electrochemical potential for N -> N+1 with the new electron in `slot` (eV). */
export function muAdd(p: DotParams, b: Bias, N: number, slot = N): number {
  return p.Ec * (N + 0.5 - p.q0) - islandPhi(p, b) + orbital(p, slot);
}

export interface Rates { upS: number; upD: number; dnS: number; dnD: number; }

const SLOTS = 3; // slots considered above the highest filled one (ground + first excited orbital)
/** Slots an electron can leave from: the top one, plus its spin partner in the same orbital. */
function outSlots(N: number): number[] {
  if (N <= 0) return [];
  const ks = [N - 1];
  if (N >= 2 && Math.floor((N - 2) / 2) === Math.floor((N - 1) / 2)) ks.push(N - 2);
  return ks;
}

export function rates(p: DotParams, b: Bias, N: number): Rates {
  const kT = Math.max(KB_EV * p.T, 1e-7);
  const muS = b.Vds / 2, muD = -b.Vds / 2;
  const r: Rates = { upS: 0, upD: 0, dnS: 0, dnD: 0 };
  if (p.kind === 'set') {
    const mu = muAdd(p, b, N);
    r.upS = orthodox(muS - mu, p.Rs, kT);
    r.upD = orthodox(muD - mu, p.Rd, kT);
    const mu2 = muAdd(p, b, N - 1);
    r.dnS = orthodox(mu2 - muS, p.Rs, kT);
    r.dnD = orthodox(mu2 - muD, p.Rd, kT);
    return r;
  }
  // quantum dot: add into any empty slot k >= N, remove from any filled slot k < N
  for (let k = N; k < N + SLOTS; k++) {
    const mu = muAdd(p, b, N, k);
    r.upS += p.gammaS * fermi(mu - muS, kT);
    r.upD += p.gammaD * fermi(mu - muD, kT);
  }
  for (const k of outSlots(N)) {
    const mu = p.Ec * (N - 0.5 - p.q0) - islandPhi(p, b) + orbital(p, k);
    r.dnS += p.gammaS * (1 - fermi(mu - muS, kT));
    r.dnD += p.gammaD * (1 - fermi(mu - muD, kT));
  }
  return r;
}

export interface Channel { kind: 'in' | 'out'; lead: 'S' | 'D'; rate: number; mu: number; }

/** Every individual tunnelling channel out of state N (for Monte-Carlo animation). */
export function channels(p: DotParams, b: Bias, N: number): Channel[] {
  const kT = Math.max(KB_EV * p.T, 1e-7);
  const muS = b.Vds / 2, muD = -b.Vds / 2;
  const out: Channel[] = [];
  if (p.kind === 'set') {
    const mu = muAdd(p, b, N), mu2 = muAdd(p, b, N - 1);
    out.push({ kind: 'in', lead: 'S', rate: orthodox(muS - mu, p.Rs, kT), mu });
    out.push({ kind: 'in', lead: 'D', rate: orthodox(muD - mu, p.Rd, kT), mu });
    out.push({ kind: 'out', lead: 'S', rate: orthodox(mu2 - muS, p.Rs, kT), mu: mu2 });
    out.push({ kind: 'out', lead: 'D', rate: orthodox(mu2 - muD, p.Rd, kT), mu: mu2 });
    return out;
  }
  for (let k = N; k < N + SLOTS; k++) {
    const mu = muAdd(p, b, N, k);
    out.push({ kind: 'in', lead: 'S', rate: p.gammaS * fermi(mu - muS, kT), mu });
    out.push({ kind: 'in', lead: 'D', rate: p.gammaD * fermi(mu - muD, kT), mu });
  }
  for (const k of outSlots(N)) {
    const mu = p.Ec * (N - 0.5 - p.q0) - islandPhi(p, b) + orbital(p, k);
    out.push({ kind: 'out', lead: 'S', rate: p.gammaS * (1 - fermi(mu - muS, kT)), mu });
    out.push({ kind: 'out', lead: 'D', rate: p.gammaD * (1 - fermi(mu - muD, kT)), mu });
  }
  return out;
}

export interface DotState { I: number; probs: Map<number, number>; Nmean: number; Nmax: number; }

/** Ground-state electron number at zero bias (most stable N). */
export function groundN(p: DotParams, b: Bias): number {
  // lowest N where adding the next electron costs > 0
  if (p.kind === 'qd') {
    let N = 0;
    while (N < 200 && muAdd(p, { Vg: b.Vg, Vds: 0 }, N) < 0) N++;
    return N;
  }
  const phi = islandPhi(p, { Vg: b.Vg, Vds: 0 });
  return Math.round(phi / p.Ec + p.q0);
}

/** Stationary solution of the birth–death master equation and the source current (A). */
export function solve(p: DotParams, b: Bias): DotState {
  const N0 = groundN(p, b);
  const span = Math.max(3, Math.ceil(Math.abs(b.Vds) / p.Ec) + 2);
  const lo = p.kind === 'qd' ? Math.max(0, N0 - span) : N0 - span, hi = N0 + span;
  const R: Rates[] = [];
  for (let N = lo; N <= hi; N++) R.push(rates(p, b, N));
  const lp: number[] = [0];
  for (let i = 1; i < R.length; i++) {
    const up = R[i - 1].upS + R[i - 1].upD, dn = R[i].dnS + R[i].dnD;
    lp.push(lp[i - 1] + Math.log(Math.max(up, 1e-300)) - Math.log(Math.max(dn, 1e-300)));
  }
  const mx = Math.max(...lp);
  let z = 0;
  const pr = lp.map((v) => { const e = Math.exp(v - mx); z += e; return e; });
  const probs = new Map<number, number>();
  let I = 0, Nmean = 0, best = -1, Nmax = N0;
  for (let i = 0; i < R.length; i++) {
    const P = pr[i] / z, N = lo + i;
    probs.set(N, P);
    I += P * (R[i].upS - R[i].dnS);
    Nmean += P * N;
    if (P > best) { best = P; Nmax = N; }
  }
  return { I: I * Q, probs, Nmean, Nmax };
}

export interface MapSpec { vg0: number; vg1: number; nVg: number; vd0: number; vd1: number; nVd: number; }

/** Current map I(Vg, Vds), row-major over Vds (rows) then Vg (cols). */
export function currentMap(p: DotParams, s: MapSpec): Float64Array {
  const out = new Float64Array(s.nVg * s.nVd);
  for (let j = 0; j < s.nVd; j++) {
    const Vds = s.vd0 + ((s.vd1 - s.vd0) * j) / (s.nVd - 1);
    for (let i = 0; i < s.nVg; i++) {
      const Vg = s.vg0 + ((s.vg1 - s.vg0) * i) / (s.nVg - 1);
      out[j * s.nVg + i] = solve(p, { Vg, Vds }).I;
    }
  }
  return out;
}

/** Natural plot ranges: a few charge periods in gate, ± a bit more than a diamond in bias. */
export function naturalRanges(p: DotParams): { vgPeriod: number; vg0: number; vg1: number; vdMax: number } {
  const per = Q / p.Cg;                    // e/Cg, V
  const alpha = p.Cg / p.Csum;             // gate lever arm
  if (p.kind === 'qd') {
    const vgFirst = (0.5 * p.Ec) / alpha;  // N: 0 -> 1 resonance
    return { vgPeriod: per, vg0: vgFirst - 0.7 * per, vg1: vgFirst + 5.3 * per + (2.6 * p.delta) / alpha, vdMax: 1.6 * (p.Ec + p.delta) };
  }
  return { vgPeriod: per, vg0: -0.5 * per, vg1: 3.5 * per, vdMax: 1.6 * p.Ec };
}
