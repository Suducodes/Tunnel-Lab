// SI constants (CODATA 2018) and the handful of derived numbers the solvers use.
export const Q = 1.602176634e-19;        // C
export const HBAR = 1.054571817e-34;     // J s
export const H = 6.62607015e-34;         // J s
export const M0 = 9.1093837015e-31;      // kg
export const EPS0 = 8.8541878128e-12;    // F/m
export const KB_EV = 8.617333262e-5;     // eV/K

/** k [1/nm] = K_NM * sqrt(m_rel * E[eV]) */
export const K_NM = Math.sqrt(2 * M0 * Q) / HBAR * 1e-9;   // ≈ 5.1232
/** ħ²/(2 m0) in eV·nm² */
export const HB2M0 = (HBAR * HBAR) / (2 * M0) / Q * 1e18;  // ≈ 0.0381

export interface Material {
  id: string;
  name: string;
  short: string;
  mEff: number;      // well/dot effective mass (m0)
  vb: number;        // conduction-band offset of the barrier (eV)
  epsR: number;      // relative permittivity
  doping: number;    // emitter doping for the RTD (cm^-3)
  rtd: boolean;      // sensible as a resonant tunneling diode
  modes: ('rtd' | 'set' | 'qd')[];
  note: string;
}

export const MATERIALS: Material[] = [
  { id: 'gaas', name: 'GaAs / Al₀.₃Ga₀.₇As', short: 'GaAs / AlGaAs', mEff: 0.067, vb: 0.25, epsR: 12.9, doping: 1e18, rtd: true, modes: ['rtd', 'qd'],
    note: 'The classic III-V heterostructure. ΔEc ≈ 0.25 eV, light electrons (0.067 m₀).' },
  { id: 'ingaas', name: 'In₀.₅₃Ga₀.₄₇As / AlAs', short: 'InGaAs / AlAs', mEff: 0.041, vb: 1.0, epsR: 13.9, doping: 1e18, rtd: true, modes: ['rtd', 'qd'],
    note: 'Deep barriers (≈1 eV) and very light electrons: the record-speed RTD system.' },
  { id: 'si', name: 'Si / SiO₂', short: 'Si / SiO₂', mEff: 0.19, vb: 3.1, epsR: 11.7, doping: 1e19, rtd: false, modes: ['set', 'qd'],
    note: 'Silicon island with oxide tunnel barriers: CMOS-compatible SETs and spin-qubit sensors.' },
  { id: 'al', name: 'Al / AlOx', short: 'Al / AlOx', mEff: 1, vb: 2.0, epsR: 9, doping: 0, rtd: false, modes: ['set'],
    note: 'The textbook metallic SET: aluminium island, thermally grown AlOx junctions (Fulton & Dolan 1987).' },
];

/** Fermi energy of a degenerate 3D electron gas, eV (n in cm^-3). */
export function fermi3D(n: number, mEff: number): number {
  const nNm3 = n * 1e-21;
  return (HB2M0 / mEff) * Math.pow(3 * Math.PI * Math.PI * nNm3, 2 / 3);
}
