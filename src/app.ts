import * as THREE from 'three';
import { Store, mat, type Mode, type View } from './state';
import { Stage, type Pose } from './scene/stage';
import { Devices } from './scene/device';
import { Landscape } from './scene/landscape';
import { TunnelMC } from './scene/mc';
import { Panel } from './ui/panel';
import { BandPlot, CurvePlot, GatePlot, MapPlot, SpectrumPlot } from './ui/plots';
import { narrate } from './ui/narrate';
import { TASKS, type Task } from './ui/tasks';
import { si } from './ui/format';
import { KB_EV } from './physics/constants';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const POSES: Record<string, Pose> = {
  lateral: { pos: v(9.6, 12.4, 15.2), target: v(0.3, 0.9, 0.9) },
  rtd: { pos: v(10.4, 9.4, 14.4), target: v(0.2, 2.2, 0.4) },
  land: { pos: v(-2.0, 17.6, 18.6), target: v(0, 2.0, 0.2) },
  intro: { pos: v(18, 16, 26), target: v(0, 1, 0) },
};

const MODE_INFO: Record<Mode, { name: string; tag: string; chip: string; blurb: string }> = {
  rtd: { name: 'Resonant diode', tag: 'RTD', chip: 'RTD-3/5', blurb: 'Two barriers, one quantum well. Current flows only when the well level lines up with the electron sea, giving a peak and negative differential resistance.' },
  set: { name: 'Single-electron', tag: 'SET', chip: 'SET-AL2', blurb: 'A tiny metal island between two tunnel junctions. Each electron costs charging energy e²/C, so charge moves one electron at a time.' },
  qd: { name: 'Quantum dot', tag: 'QD', chip: 'QD-24', blurb: 'Both effects at once: discrete quantum levels and single-electron charging. Diamonds alternate in size as orbitals fill.' },
};

export class App {
  st = new Store();
  stage: Stage;
  dev = new Devices();
  land: Landscape;
  mc = new TunnelMC();
  panel: Panel;
  plots: { band: BandPlot; curve: CurvePlot; gate: GatePlot; map: MapPlot; spec: SpectrumPlot };
  private $ = <T extends HTMLElement>(q: string) => document.querySelector(q) as T;
  private labelsOn = true;
  private done = new Set<string>();
  private active: Task | null = null;
  private level = 0;

  constructor() {
    this.stage = new Stage(this.$('#stage'));
    this.land = new Landscape(this.st);
    this.stage.scene.add(this.dev.group, this.land.group);
    this.land.group.visible = false;
    this.panel = new Panel(this.$('#controls'), this.st);
    this.plots = {
      band: new BandPlot(this.$('#p-band'), this.st),
      curve: new CurvePlot(this.$('#p-curve'), this.st),
      gate: new GatePlot(this.$('#p-gate'), this.st),
      map: new MapPlot(this.$('#p-map'), this.st),
      spec: new SpectrumPlot(this.$('#p-spec'), this.st),
    };
    try { for (const id of JSON.parse(localStorage.getItem('tl-done') ?? '[]')) this.done.add(id); } catch { /* storage blocked */ }

    this.wire();
    this.st.on((why) => this.onChange(why));
    this.stage.onTick((dt, t) => this.tick(dt, t));
    this.applyMode(true);
    this.stage.jump(POSES.intro);
    this.applyLabels();
    // deep links: #rtd, #set, #qd, optionally with -landscape
    const m = /^#(rtd|set|qd)(-landscape|-explode)?$/.exec(location.hash);
    if (m) {
      this.$('#intro').classList.add('gone');
      this.setMode(m[1] as Mode, false);
      if (m[2] === '-landscape') { this.st.ui((s) => { s.view = 'landscape'; }); this.applyView(); }
      this.stage.jump(this.st.s.view === 'device' ? this.devicePose() : POSES.land);
      if (m[2] === '-explode') this.toggleExplode();
      this.applyLabels();
    }
    addEventListener('hashchange', () => location.reload());
  }

  private get introOpen() { return !this.$('#intro').classList.contains('gone'); }

  // ------------------------------------------------------------------ DOM wiring
  private wire() {
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => b.addEventListener('click', () => this.setMode(b.dataset.mode as Mode)));
    document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.addEventListener('click', () => this.setView(b.dataset.view as View)));
    this.$('#btn-labels').addEventListener('click', () => { this.labelsOn = !this.labelsOn; this.applyLabels(); this.$('#btn-labels').classList.toggle('on', this.labelsOn); });
    this.$('#btn-tasks').addEventListener('click', () => this.$('#tasks').classList.toggle('open'));
    this.$('#btn-explode').addEventListener('click', () => this.toggleExplode());
    this.$('#btn-reset').addEventListener('click', () => this.stage.fly(this.st.s.view === 'device' ? this.devicePose() : POSES.land, 1.1));
    this.$('#tasks-close').addEventListener('click', () => this.$('#tasks').classList.remove('open'));
    this.$('#btn-model').addEventListener('click', () => this.$('#model').classList.add('open'));
    this.$('#model-close').addEventListener('click', () => this.$('#model').classList.remove('open'));
    this.$('#map-kind').addEventListener('click', (e) => {
      const k = (e.target as HTMLElement).dataset.k as 'didv' | 'i' | undefined;
      if (k) this.st.ui((s) => { s.mapKind = k; });
    });
    // intro cards
    document.querySelectorAll<HTMLButtonElement>('[data-start]').forEach((b) => b.addEventListener('click', () => {
      this.$('#intro').classList.add('gone');
      this.setMode(b.dataset.start as Mode, false);
      this.applyLabels();
      this.stage.fly(this.devicePose(), 2.4);
    }));
    addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
      if (e.key === '1') this.setMode('rtd'); if (e.key === '2') this.setMode('set'); if (e.key === '3') this.setMode('qd');
      if (e.key === 'v') this.setView(this.st.s.view === 'device' ? 'landscape' : 'device');
      if (e.key === 'e') this.toggleExplode();
      if (e.key === 'Escape') { this.$('#model').classList.remove('open'); this.$('#tasks').classList.remove('open'); }
    });
    this.renderTasks();
  }

  private toggleExplode() {
    if (this.st.s.view !== 'device') this.setView('device');
    this.dev.setExplode(!this.dev.exploded);
    this.$('#btn-explode').classList.toggle('on', this.dev.exploded);
    const p = this.devicePose();
    this.stage.fly(this.dev.exploded ? { pos: p.pos.clone().multiplyScalar(1.22).add(v(0, 3.2, 0)), target: p.target.clone().add(v(0, this.st.s.mode === 'rtd' ? 2.6 : 1.8, 0)) } : p, 1.1);
  }

  private devicePose() { return this.st.s.mode === 'rtd' ? POSES.rtd : POSES.lateral; }

  setMode(m: Mode, fly = true) {
    if (m === this.st.s.mode && !fly) { this.applyMode(true); return; }
    this.st.ui((s) => { s.mode = m; });
    this.applyMode(true);
    if (fly) this.stage.fly(this.st.s.view === 'device' ? this.devicePose() : POSES.land, 1.3);
  }

  setView(vw: View) {
    if (vw === this.st.s.view) return;
    const veil = this.$('#veil');
    veil.classList.add('on');
    const to = vw === 'device' ? this.devicePose() : POSES.land;
    // dive: fly part-way, swap under the veil, settle
    const mid: Pose = { pos: this.stage.camera.position.clone().lerp(new THREE.Vector3(0, 1.2, 0), 0.6), target: this.stage.controls.target.clone() };
    this.stage.fly(mid, 0.45, () => {
      this.st.ui((s) => { s.view = vw; });
      this.applyView();
      const start: Pose = { pos: to.pos.clone().multiplyScalar(0.55).add(new THREE.Vector3(0, 0.8, 0)), target: to.target.clone() };
      this.stage.jump(start);
      veil.classList.remove('on');
      this.stage.fly(to, 1.1);
    });
  }

  private applyView() {
    const dev = this.st.s.view === 'device';
    this.dev.group.visible = dev;
    this.land.group.visible = !dev;
    this.stage.ruler.visible = dev;
    this.$('#btn-explode').toggleAttribute('disabled', !dev);
    document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === this.st.s.view));
    this.applyLabels();
  }

  private applyLabels() {
    const dev = this.st.s.view === 'device', on = this.labelsOn && !this.introOpen;
    this.dev.setLabels(on && dev);
    this.land.setLabels(on && !dev);
    if (!this.introOpen) try { history.replaceState(null, '', `#${this.st.s.mode}${dev ? '' : '-landscape'}`); } catch { /* sandboxed */ }
  }

  private applyMode(reset: boolean) {
    const m = this.st.s.mode;
    this.dev.setMode(m);
    this.land.setMode(m);
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    document.body.dataset.mode = m;
    this.$('#mode-name').textContent = MODE_INFO[m].name;
    this.$('#mode-blurb').textContent = MODE_INFO[m].blurb;
    this.$('#t-map').textContent = m === 'rtd' ? 'Transmission spectrum T(E)' : 'Stability diagram';
    this.$('#t-curve').textContent = m === 'rtd' ? 'Current density vs bias' : 'Current vs bias (at this gate)';
    this.applyView();
    this.land.sync();
    if (m !== 'rtd') this.mc.set(this.st.dot.p, { Vg: this.st.dotS.Vg, Vds: this.st.dotS.Vds }, this.st.dot.pt.Nmax, reset);
    this.redraw();
  }

  // ------------------------------------------------------------------ updates
  private onChange(why: string) {
    if (why === 'ui') { this.applyModeLight(); }
    if (this.st.s.mode !== 'rtd') this.mc.set(this.st.dot.p, { Vg: this.st.dotS.Vg, Vds: this.st.dotS.Vds }, this.st.dot.pt.Nmax, why === 'params');
    this.land.sync();
    if (this.st.s.mode === 'rtd' && (why === 'point' || why === 'params' || why === 'curve')) this.land.markDirty();
    this.redraw();
    this.checkTasks();
  }
  private applyModeLight() {
    document.querySelectorAll<HTMLButtonElement>('#map-kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === this.st.s.mapKind));
  }

  private redraw() {
    const p = this.plots;
    p.band.draw(); p.curve.draw();
    if (this.st.s.mode === 'rtd') p.spec.draw(); else { p.map.draw(); p.gate.draw(); }
    this.panel.refresh();
    this.hud();
  }

  private hud() {
    const st = this.st, s = narrate(st);
    const I = st.s.mode === 'rtd' ? st.rtd.I : st.dot.pt.I;
    const ref = st.s.mode === 'rtd' ? (st.rtd.peak?.I ?? Math.max(st.rtd.I, 1e-12)) : st.dot.Imax;
    this.level = Math.max(0, Math.min(1, Math.abs(I) / Math.max(ref, 1e-30)));
    this.$('#meter-i').textContent = si(I, 'A', 3);
    this.$('#meter-bar').style.setProperty('--lvl', `${(this.level * 100).toFixed(1)}%`);
    const pill = this.$('#regime');
    pill.textContent = s.regime; pill.dataset.tone = s.tone;
    this.$('#story').textContent = s.text;
    const extra = this.$('#meter-x');
    if (st.s.mode === 'rtd') extra.textContent = `V = ${(st.s.rtd.V * 1000).toFixed(0)} mV · ${(st.rtd.J / 1e7).toFixed(2)} kA/cm²`;
    else extra.textContent = `N = ${st.dot.pt.Nmax} · ⟨N⟩ = ${st.dot.pt.Nmean.toFixed(2)}`;
    // brand block: chip id, material, temperature, key numbers
    const m = st.s.mode, T = st.s.T;
    const matName = mat(m === 'rtd' ? st.s.rtd.mat : st.dotS.mat).short;
    this.$('#brand-eyebrow').textContent = `${MODE_INFO[m].chip} · ${matName}`;
    this.$('#brand-temp').textContent = T < 1 ? `${(T * 1000).toFixed(0)} mK` : `${T < 10 ? T.toFixed(1) : T.toFixed(0)} K`;
    const meV = (e: number) => `${(e * 1000).toFixed(1)} meV`;
    this.$('#brand-meta').textContent = m === 'rtd'
      ? `E₁ ${meV(st.rtd.E1)} · E_F ${meV(st.rtd.EF)} · barrier ${st.s.rtd.barrier.toFixed(1)} nm · well ${st.s.rtd.well.toFixed(1)} nm`
      : `Ec ${meV(st.dot.p.Ec)}${st.dot.p.kind === 'qd' ? ` · Δ ${meV(st.dot.p.delta)}` : ''} · e/Cg ${(st.dot.ranges.vgPeriod * 1000).toFixed(1)} mV · ⌀ ${st.dotS.diameter.toFixed(0)} nm`;
  }

  private tick(dt: number, t: number) {
    const dot = this.st.s.mode !== 'rtd';
    if (dot) {
      this.mc.step(dt, (h) => {
        if (this.st.s.view === 'device') this.dev.hop(h.kind, h.lead);
        else this.land.hop(h);
      });
    }
    const N = dot ? this.mc.N : 0;
    if (this.dev.group.visible) this.dev.update(dt, t, this.level, N);
    if (this.land.group.visible) this.land.update(dt, t, N);
    const nEl = this.$('#meter-n');
    if (dot && nEl.textContent !== String(N)) { nEl.textContent = String(N); nEl.classList.remove('blip'); void nEl.offsetWidth; nEl.classList.add('blip'); }
  }

  // ------------------------------------------------------------------ tasks
  private renderTasks() {
    const list = this.$('#task-list');
    list.innerHTML = TASKS.map((t) => `
      <li class="task${this.done.has(t.id) ? ' done' : ''}${this.active?.id === t.id ? ' active' : ''}" data-id="${t.id}">
        <button class="task-h"><span class="tk-mode">${MODE_INFO[t.mode].tag}</span><span class="tk-title">${t.title}</span><span class="tk-check" aria-label="${this.done.has(t.id) ? 'done' : 'open'}"></span></button>
        <div class="task-b">
          <p>${t.goal}</p><p class="hint">${t.hint}</p>
          ${t.ask ? `<form class="ask"><label for="ans-${t.id}">${t.ask.label}</label><input id="ans-${t.id}" type="number" step="any" inputmode="decimal"><span>${t.ask.unit}</span><button type="submit">Check</button></form>` : ''}
          <p class="learn">${t.learn}</p>
        </div>
      </li>`).join('');
    this.$('#task-count').textContent = `${this.done.size}/${TASKS.length}`;
    list.querySelectorAll<HTMLElement>('.task').forEach((li) => {
      const t = TASKS.find((x) => x.id === li.dataset.id)!;
      li.querySelector('.task-h')!.addEventListener('click', () => {
        this.active = this.active?.id === t.id ? null : t;
        if (this.active && this.st.s.mode !== t.mode) this.setMode(t.mode);
        this.renderTasks();
      });
      li.querySelector('form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const inp = li.querySelector('input') as HTMLInputElement;
        if (this.st.s.mode !== t.mode) this.setMode(t.mode);
        const ok = t.check(this.st, parseFloat(inp.value));
        inp.classList.toggle('bad', !ok);
        if (ok) this.complete(t);
      });
    });
  }

  private checkTasks() {
    const t = this.active;
    if (!t || t.ask || this.done.has(t.id) || this.st.s.mode !== t.mode) return;
    if (t.check(this.st)) this.complete(t);
  }

  private complete(t: Task) {
    this.done.add(t.id);
    try { localStorage.setItem('tl-done', JSON.stringify([...this.done])); } catch { /* storage blocked */ }
    const toast = this.$('#toast');
    toast.innerHTML = `<b>${t.title}</b><span>${t.learn}</span>`;
    toast.classList.remove('show'); void toast.offsetWidth; toast.classList.add('show');
    this.renderTasks();
  }

  get kT() { return KB_EV * this.st.s.T; }
}
