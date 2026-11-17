// Short guided experiments. Each one checks itself against the live physics.
import type { Store, Mode } from '../state';
import { KB_EV } from '../physics/constants';

export interface Task {
  id: string; mode: Mode; title: string; goal: string; hint: string;
  check: (st: Store, answer?: number) => boolean;
  ask?: { label: string; unit: string };
  learn: string;
}

export const TASKS: Task[] = [
  {
    id: 'rtd-peak', mode: 'rtd', title: 'Find the resonance peak',
    goal: 'Tune the bias until the current is at its maximum.',
    hint: 'Watch the amber level in the band diagram slide into the cyan emitter sea.',
    check: (st) => !!st.rtd.peak && Math.abs(st.s.rtd.V - st.rtd.peak.V) < 0.012 && st.rtd.J > 0.93 * st.rtd.peak.J,
    learn: 'Peak current flows when the resonant level is aligned with the most populated emitter states.',
  },
  {
    id: 'rtd-ndr', mode: 'rtd', title: 'Make the current fall',
    goal: 'Increase the bias beyond the peak until more voltage gives less current.',
    hint: 'Keep going right on the I–V curve into the pink NDR band.',
    check: (st) => st.rtd.slope < 0 && st.s.rtd.V > (st.rtd.peak?.V ?? 0),
    learn: 'Negative differential resistance: the level drops below the emitter band edge, so fewer electrons can use it.',
  },
  {
    id: 'set-block', mode: 'set', title: 'Freeze the charge',
    goal: 'With a small bias, find a gate voltage where the current is fully blocked.',
    hint: 'Drag on the gate sweep to a valley between two peaks.',
    check: (st) => st.s.mode === 'set' && st.dot.blocked && Math.abs(st.s.set.Vds) < 0.5 * st.dot.p.Ec,
    learn: 'Inside a Coulomb diamond adding or removing a single electron costs more energy than the bias provides.',
  },
  {
    id: 'set-period', mode: 'set', title: 'Measure e/Cg',
    goal: 'Read the spacing between two neighbouring Coulomb peaks in the gate sweep.',
    hint: 'Use the cursor on two peaks and subtract the gate voltages.',
    ask: { label: 'Peak spacing', unit: 'mV' },
    check: (st, a) => a !== undefined && Math.abs(a / 1000 - st.dot.ranges.vgPeriod) / st.dot.ranges.vgPeriod < 0.06,
    learn: 'Each peak adds exactly one electron, so the period is e/Cg. This is how gate capacitance is measured.',
  },
  {
    id: 'qd-shell', mode: 'qd', title: 'Spot the shell structure',
    goal: 'In the stability map, find the addition energy for the 2nd → 3rd electron (the larger diamond).',
    hint: 'The big diamonds are where a new orbital must be opened. The tip height in Vds equals the addition energy.',
    ask: { label: 'Addition energy', unit: 'meV' },
    check: (st, a) => a !== undefined && st.s.mode === 'qd' && Math.abs(a / 1000 - (st.dot.p.Ec + st.dot.p.delta)) / (st.dot.p.Ec + st.dot.p.delta) < 0.12,
    learn: 'Big diamond = charging energy + level spacing (Ec + Δ). Small diamond = charging energy alone (second spin in the same orbital).',
  },
  {
    id: 'qd-melt', mode: 'qd', title: 'Melt the diamonds',
    goal: 'Raise the temperature until the blockade disappears.',
    hint: 'Watch the stability map as kT approaches the charging energy.',
    check: (st) => st.s.mode !== 'rtd' && KB_EV * st.s.T > 0.15 * st.dot.p.Ec,
    learn: 'Single-electron effects need Ec ≫ kT. That is why SETs run cold, or need islands only a few nm across to work at room temperature.',
  },
];
