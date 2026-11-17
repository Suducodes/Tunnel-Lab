// Plain-language explanation of the present operating point, written from the physics state.
import type { Store } from '../state';
import * as D from '../physics/dot';

export interface Story { regime: string; tone: 'flow' | 'block' | 'ndr' | 'warm' | 'idle'; text: string; }

const mev = (e: number) => `${(e * 1000).toFixed(1)} meV`;

export function narrate(st: Store): Story {
  if (st.s.mode === 'rtd') {
    const d = st.rtd, V = st.s.rtd.V, r = d.res[0];
    if (V < 0.004) return { regime: 'No bias', tone: 'idle', text: 'Both Fermi seas sit at the same level, so as many electrons tunnel back as forward. No net current.' };
    if (!r) return { regime: 'Off resonance', tone: 'idle', text: 'No resonant level is inside the barrier range at this bias.' };
    const kT = 8.617e-5 * d.p.T;
    if (d.slope < 0) return { regime: 'Negative differential resistance', tone: 'ndr',
      text: `The resonant level has been pulled down to ${mev(r.E)}, towards the bottom of the emitter sea. Fewer and fewer electrons can match its energy, so more voltage gives less current.` };
    if (r.E > d.EF + 3 * kT) return { regime: 'Below resonance', tone: 'idle',
      text: `The resonant level is at ${mev(r.E)}, above the emitter Fermi level (${mev(d.EF)}). Almost no electrons have that energy, so only a small leak flows. Raise the bias to pull the level down.` };
    if (r.E > 0) return { regime: 'On resonance', tone: 'flow',
      text: `The resonant level (${mev(r.E)}) sits inside the filled emitter sea. Electrons with exactly that energy pass both barriers almost freely, while all others are reflected.` };
    return { regime: 'Past the peak', tone: 'warm',
      text: 'The level has dropped below the emitter band edge. No electron can match it, so only the off-resonant leak and the next level carry current.' };
  }
  const d = st.dot, ds = st.dotS, p = d.p, b = { Vg: ds.Vg, Vds: ds.Vds };
  const N = d.pt.Nmax;
  const add = D.muAdd(p, b, N), rem = D.muAdd(p, b, N - 1);
  const muS = ds.Vds / 2, muD = -ds.Vds / 2, hi = Math.max(muS, muD), lo = Math.min(muS, muD);
  const kT = d.kT;
  const what = p.kind === 'qd' ? 'dot' : 'island';
  if (kT > 0.15 * p.Ec) return { regime: 'Thermally smeared', tone: 'warm',
    text: `kT = ${mev(kT)} is a sizeable fraction of the charging energy (${mev(p.Ec)}). Hot electrons can pay the charging cost, so the blockade and the diamonds wash out.` };
  if (d.blocked) {
    const gap = Math.min(add - hi, lo - rem);
    return { regime: 'Coulomb blockade', tone: 'block',
      text: `The ${what} holds ${N} electron${N === 1 ? '' : 's'}. Adding one more needs ${mev(add - hi)} more than the source can supply, and removing one would cost ${mev(lo - rem)}. Charge is frozen and no current flows (the gap is ${mev(Math.max(0, gap))}).` };
  }
  const lines = d.ivds.V.length ? '' : '';
  return { regime: 'Single-electron tunnelling', tone: 'flow',
    text: `A charge level sits inside the bias window, so electrons hop on and off one at a time: N switches between ${N} and ${N + 1}${p.kind === 'qd' && Math.abs(ds.Vds) > p.delta ? '. The bias is now larger than the level spacing, so excited levels open extra paths (steps in the current)' : ''}.${lines}` };
}
