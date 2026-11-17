// Left control panel: sliders, material chips, derived numbers, presets.
import type { Store } from '../state';
import { MATERIALS, KB_EV } from '../physics/constants';
import { si, meV, mV, temp } from './format';

interface Slider { el: HTMLInputElement; out: HTMLElement; row: HTMLElement; }

function slider(parent: HTMLElement, id: string, label: string, sub = ''): Slider {
  const row = document.createElement('div');
  row.className = 'ctl';
  row.innerHTML = `<label for="${id}"><span>${label}<small>${sub}</small></span><output id="${id}-o"></output></label><input id="${id}" type="range" min="0" max="1000" step="1">`;
  parent.appendChild(row);
  return { el: row.querySelector('input')!, out: row.querySelector('output')!, row };
}

export class Panel {
  private sl: Record<string, Slider> = {};
  private mats: HTMLElement;
  private derived: HTMLElement;
  private presets: HTMLElement;
  private sec: Record<string, HTMLElement> = {};

  constructor(private root: HTMLElement, private st: Store) {
    root.innerHTML = `
      <section class="grp" data-g="op"><h4>Operating point</h4></section>
      <section class="grp" data-g="dev"><h4>Device</h4><div class="chips" id="mats"></div></section>
      <section class="grp" data-g="env"><h4>Environment</h4></section>
      <section class="grp derived"><h4>Derived <span class="seg sm" id="units"><button data-u="si">SI</button><button data-u="norm">e/Cg · Ec</button></span></h4><dl id="derived"></dl></section>
      <section class="grp"><h4>Jump to</h4><div class="chips" id="presets"></div></section>`;
    for (const g of ['op', 'dev', 'env']) this.sec[g] = root.querySelector(`[data-g="${g}"]`)!;
    this.mats = root.querySelector('#mats')!;
    this.derived = root.querySelector('#derived')!;
    this.presets = root.querySelector('#presets')!;

    const op = this.sec.op, dev = this.sec.dev, env = this.sec.env;
    this.sl.V = slider(op, 's-v', 'Bias V', 'emitter → collector');
    this.sl.Vds = slider(op, 's-vds', 'Bias Vds', 'source → drain');
    this.sl.Vg = slider(op, 's-vg', 'Gate Vg', 'plunger');
    this.sl.barrier = slider(dev, 's-b', 'Barrier thickness', '');
    this.sl.well = slider(dev, 's-w', 'Well width', '');
    this.sl.area = slider(dev, 's-a', 'Mesa area', '');
    this.sl.diam = slider(dev, 's-d', 'Island diameter', 'sets Ec and Δ');
    this.sl.T = slider(env, 's-t', 'Temperature', 'log scale');

    const S = st;
    const bind = (k: string, kind: 'point' | 'params', get: () => [number, number, number], set: (v: number) => void) => {
      const s = this.sl[k];
      s.el.addEventListener('input', () => {
        const [lo, hi, log] = get();
        const u = +s.el.value / 1000;
        const v = log ? Math.exp(Math.log(lo) + u * (Math.log(hi) - Math.log(lo))) : lo + u * (hi - lo);
        if (kind === 'point') S.point(() => set(v)); else S.params(() => set(v), false);
      });
      s.el.addEventListener('change', () => { if (kind === 'params') S.params(() => {}, true); });
    };
    bind('V', 'point', () => [0, S.rtd.vMax, 0], (v) => { S.s.rtd.V = v; });
    bind('Vds', 'point', () => [-S.dot.ranges.vdMax, S.dot.ranges.vdMax, 0], (v) => { S.dotS.Vds = Math.abs(v) < S.dot.ranges.vdMax * 0.008 ? 0 : v; });
    bind('Vg', 'point', () => [S.dot.ranges.vg0, S.dot.ranges.vg1, 0], (v) => { S.dotS.Vg = v; });
    bind('barrier', 'params', () => (S.s.mode === 'rtd' ? [1.5, 4.5, 0] : S.s.mode === 'set' ? [1, 3, 0] : [2, 7, 0]), (v) => { if (S.s.mode === 'rtd') S.s.rtd.barrier = v; else S.dotS.barrier = v; });
    bind('well', 'params', () => [3, 9, 0], (v) => { S.s.rtd.well = v; });
    bind('area', 'params', () => [0.1, 10, 1], (v) => { S.s.rtd.area = v; });
    bind('diam', 'params', () => (S.s.mode === 'set' ? [3, 120, 1] : [10, 80, 1]), (v) => { S.dotS.diameter = v; });
    bind('T', 'params', () => [0.05, 300, 1], (v) => { S.s.T = v; });

    root.querySelector('#units')!.addEventListener('click', (e) => {
      const u = (e.target as HTMLElement).dataset.u as 'si' | 'norm' | undefined;
      if (u) S.ui((s) => { s.units = u; });
    });
    this.mats.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).dataset.m;
      if (!id) return;
      S.params((s) => { if (s.mode === 'rtd') s.rtd.mat = id; else S.dotS.mat = id; s.rtd.V = Math.min(s.rtd.V, 0.12); });
    });
    this.presets.addEventListener('click', (e) => {
      const k = (e.target as HTMLElement).dataset.p;
      if (k) this.preset(k);
    });
    this.refresh();
  }

  private preset(k: string) {
    const S = this.st;
    if (S.s.mode === 'rtd') {
      const d = S.rtd;
      if (k === 'peak' && d.peak) S.point((s) => { s.rtd.V = d.peak!.V; });
      if (k === 'valley' && d.valley) S.point((s) => { s.rtd.V = d.valley!.V; });
      if (k === 'zero') S.point((s) => { s.rtd.V = 0; });
      if (k === 'room') S.params((s) => { s.T = 300; });
      if (k === 'cold') S.params((s) => { s.T = 4; });
      return;
    }
    const d = S.dot, p = d.p, a = p.Cg / p.Csum;
    if (k === 'block') S.point(() => { S.dotS.Vds = 0.15 * p.Ec; S.dotS.Vg = S.s.mode === 'qd' ? ((D_mu(p, 2) + D_mu(p, 3)) / 2) / a : d.ranges.vgPeriod; });
    if (k === 'peak') S.point(() => { S.dotS.Vds = 0.15 * p.Ec; S.dotS.Vg = S.s.mode === 'qd' ? D_mu(p, 2) / a : d.ranges.vgPeriod * 0.5; });
    if (k === 'excited') S.point(() => { S.dotS.Vg = D_mu(p, 2) / a + 0.2 * p.delta / a; S.dotS.Vds = Math.min(d.ranges.vdMax * 0.95, 1.6 * p.delta); });
    if (k === 'cold') S.params((s) => { s.T = 0.1; });
    if (k === 'hot') S.params((s) => { s.T = 77; });
  }

  refresh() {
    const S = this.st, s = S.s, rtd = s.mode === 'rtd';
    const show = (k: string, on: boolean) => { this.sl[k].row.hidden = !on; };
    show('V', rtd); show('Vds', !rtd); show('Vg', !rtd); show('well', rtd); show('area', rtd); show('diam', !rtd);
    const put = (k: string, v: number, lo: number, hi: number, log: boolean, text: string) => {
      const sl = this.sl[k];
      const u = log ? (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)) : (v - lo) / (hi - lo);
      if (document.activeElement !== sl.el) sl.el.value = String(Math.round(Math.max(0, Math.min(1, u)) * 1000));
      sl.out.textContent = text;
    };
    const norm = s.units === 'norm' && !rtd;
    if (rtd) {
      put('V', s.rtd.V, 0, S.rtd.vMax, false, mV(s.rtd.V, 0));
      put('barrier', s.rtd.barrier, 1.5, 4.5, false, `${s.rtd.barrier.toFixed(2)} nm`);
      put('well', s.rtd.well, 3, 9, false, `${s.rtd.well.toFixed(2)} nm`);
      put('area', s.rtd.area, 0.1, 10, true, `${s.rtd.area.toPrecision(2)} µm²`);
    } else {
      const ds = S.dotS, d = S.dot;
      put('Vds', ds.Vds, -d.ranges.vdMax, d.ranges.vdMax, false, norm ? `${(ds.Vds / d.p.Ec).toFixed(2)} Ec/e` : mV(ds.Vds, 2));
      put('Vg', ds.Vg, d.ranges.vg0, d.ranges.vg1, false, norm ? `${(ds.Vg / d.ranges.vgPeriod).toFixed(2)} e/Cg` : mV(ds.Vg, 1));
      put('barrier', ds.barrier, s.mode === 'set' ? 1 : 2, s.mode === 'set' ? 3 : 7, false, `${ds.barrier.toFixed(2)} nm`);
      put('diam', ds.diameter, s.mode === 'set' ? 3 : 10, s.mode === 'set' ? 120 : 80, true, `${ds.diameter.toFixed(0)} nm`);
    }
    put('T', s.T, 0.05, 300, true, temp(s.T));
    // materials
    const cur = rtd ? s.rtd.mat : S.dotS.mat;
    this.mats.innerHTML = MATERIALS.filter((m) => m.modes.includes(s.mode)).map((m) => `<button class="chip${m.id === cur ? ' on' : ''}" data-m="${m.id}" title="${m.note}">${m.name}</button>`).join('');
    // units toggle
    this.root.querySelectorAll<HTMLButtonElement>('#units button').forEach((b) => { b.classList.toggle('on', b.dataset.u === s.units); b.disabled = rtd; });
    // derived
    const kT = KB_EV * s.T;
    const row = (k: string, v: string, hint = '') => `<dt title="${hint}">${k}</dt><dd>${v}</dd>`;
    if (rtd) {
      const d = S.rtd;
      this.derived.innerHTML =
        row('E₁ (0 V)', meV(d.E1), 'first resonant level at zero bias') + row('E_F emitter', meV(d.EF), 'from 10¹⁸ cm⁻³ doping') +
        row('kT', meV(kT, 2)) + row('Peak', d.peak ? `${mV(d.peak.V, 0)} · ${(d.peak.J / 1e7).toFixed(1)} kA/cm²` : d.computing ? '…' : 'no NDR') +
        row('Peak/valley', d.peak ? d.pvcr.toFixed(1) : '—', 'peak-to-valley current ratio') + row('Current', si(d.I, 'A'));
      this.presets.innerHTML = `<button class="chip" data-p="zero">Zero bias</button><button class="chip" data-p="peak">Peak</button><button class="chip" data-p="valley">Valley (NDR)</button><button class="chip" data-p="cold">4 K</button><button class="chip" data-p="room">300 K</button>`;
    } else {
      const d = S.dot, p = d.p;
      this.derived.innerHTML =
        row('Ec = e²/CΣ', meV(p.Ec, 2), 'charging energy') + (p.kind === 'qd' ? row('Δ level spacing', meV(p.delta, 2), '2πħ²/m*A') : '') +
        row('kT', meV(kT, 3)) + row('Ec / kT', (p.Ec / kT).toFixed(p.Ec / kT > 100 ? 0 : 1), 'blockade needs ≫ 1') +
        row('e/Cg', mV(d.ranges.vgPeriod, 1), 'gate period') + row('CΣ', `${(p.Csum * 1e18).toFixed(2)} aF`) +
        (p.kind === 'qd' ? row('Γ tunnel rate', `${(p.gammaS / 1e9).toFixed(1)} GHz`) : row('R junction', si(p.Rs, 'Ω'))) +
        row('Electrons N', `${d.pt.Nmax}`) + row('Current', si(d.pt.I, 'A'));
      this.presets.innerHTML = `<button class="chip" data-p="block">Blockade</button><button class="chip" data-p="peak">Coulomb peak</button>${p.kind === 'qd' ? '<button class="chip" data-p="excited">Excited-state step</button>' : ''}<button class="chip" data-p="cold">100 mK</button><button class="chip" data-p="hot">77 K</button>`;
    }
  }
}

import { muAdd } from '../physics/dot';
import type { DotParams } from '../physics/dot';
/** gate-independent part of μ(N-1→N) (so Vg = this/α puts that level at zero) */
function D_mu(p: DotParams, N: number) { return muAdd(p, { Vg: 0, Vds: 0 }, N - 1); }
