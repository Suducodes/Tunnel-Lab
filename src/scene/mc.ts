// Kinetic Monte-Carlo of single tunnelling events, slowed down to human time.
// Real rates are 10^8–10^11 per second; one reference rate is mapped to ~2.5 events per second
// so relative rates (and therefore blockade, steps and peaks) stay physically correct.
import { channels, type Bias, type Channel, type DotParams } from '../physics/dot';
import { Q } from '../physics/constants';

export interface Hop extends Channel { Nbefore: number; }

export class TunnelMC {
  N = 0;
  private p: DotParams | null = null;
  private b: Bias = { Vg: 0, Vds: 0 };
  private scale = 1;
  private clock = 0;

  set(p: DotParams, b: Bias, Nguess: number, reset: boolean) {
    const kindChanged = this.p?.kind !== p.kind;
    this.p = p; this.b = { ...b };
    const ref = p.kind === 'qd' ? p.gammaS : (p.Ec * 0.5) / (Q * p.Rs);
    this.scale = 2.6 / ref;
    if (reset || kindChanged || Math.abs(this.N - Nguess) > 3) this.N = Nguess;
  }

  step(dt: number, emit: (h: Hop) => void) {
    if (!this.p) return;
    this.clock += dt;
    let guard = 0;
    while (guard++ < 6) {
      const ch = channels(this.p, this.b, this.N);
      const tot = ch.reduce((s, c) => s + c.rate, 0) * this.scale;
      if (tot < 1e-6) { this.clock = 0; return; }
      // events are drawn per frame: Poisson with mean tot*dt, at most a few per frame
      const P = 1 - Math.exp(-Math.min(tot, 12) * this.clock);
      if (Math.random() > P) { this.clock = 0; return; }
      this.clock = 0;
      let r = Math.random() * tot / this.scale;
      let pick = ch[0];
      for (const c of ch) { r -= c.rate; if (r <= 0) { pick = c; break; } }
      const Nbefore = this.N;
      this.N += pick.kind === 'in' ? 1 : -1;
      emit({ ...pick, Nbefore });
      if (tot < 12) return;
    }
  }
}
