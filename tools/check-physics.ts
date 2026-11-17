// Checks the solvers against textbook results. Run: npm run test:physics
import { MATERIALS, HB2M0, K_NM, Q, fermi3D } from '../src/physics/constants';
import { transmission, ivCurve, resonances, type RtdParams } from '../src/physics/rtd';
import { deriveDot, solve, naturalRanges } from '../src/physics/dot';

let fails = 0;
const ok = (name: string, cond: boolean, detail: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
  if (!cond) fails++;
};

const gaas = MATERIALS[0];

function findPeaks(xs: number[], ys: number[], minSep: number): number[] {
  const mx = Math.max(...ys);
  const out: number[] = [];
  for (let i = 1; i < ys.length - 1; i++) {
    if (ys[i] > 0.3 * mx && ys[i] >= ys[i - 1] && ys[i] > ys[i + 1]) {
      if (out.length && xs[i] - out[out.length - 1] < minSep) continue;
      out.push(xs[i]);
    }
  }
  return out;
}


// 1. Single rectangular barrier vs analytic
{
  const a = 2, V0 = 0.3, m = 0.067;
  const slices = [{ x0: 0, x1: a, U: V0 }];
  for (const E of [0.05, 0.15, 0.25]) {
    const kap = K_NM * Math.sqrt(m * (V0 - E));
    const Tan = 1 / (1 + (V0 * V0 * Math.sinh(kap * a) ** 2) / (4 * E * (V0 - E)));
    const Tn = transmission(E, slices, 0, m);
    ok('single barrier T(E)', Math.abs(Tn - Tan) / Tan < 1e-6, `E=${E} numeric=${Tn.toExponential(4)} analytic=${Tan.toExponential(4)}`);
  }
}

// 2. Double barrier: symmetric resonance reaches T≈1, below the infinite-well level
const p: RtdParams = { mat: gaas, barrier: 3, well: 5, T: 300, area: 1 };
{
  const res = resonances(p, 0);
  const Einf = (HB2M0 / gaas.mEff) * (Math.PI / p.well) ** 2;
  ok('resonance exists', res.length >= 1, `E1=${(res[0]?.E * 1000).toFixed(1)} meV, T=${res[0]?.T.toFixed(4)}, infinite well=${(Einf * 1000).toFixed(1)} meV`);
  ok('symmetric resonance T≈1', res[0].T > 0.98, `T=${res[0].T.toFixed(4)}`);
  ok('finite well below infinite well', res[0].E < Einf, '');
}

// 3. RTD I–V has NDR
{
  const t0 = performance.now();
  const iv = ivCurve(p, 0.6, 100);
  const ms = performance.now() - t0;
  let pk = 0;
  for (let i = 1; i < iv.length; i++) if (iv[i].J > iv[pk].J) pk = i; else break;
  let vl = pk;
  for (let i = pk; i < iv.length; i++) if (iv[i].J < iv[vl].J) vl = i;
  const EF = fermi3D(gaas.doping, gaas.mEff);
  console.log(`      EF=${(EF * 1000).toFixed(1)} meV  peak V=${iv[pk].V.toFixed(3)} J=${(iv[pk].J / 1e7).toFixed(2)} kA/cm²  valley V=${iv[vl].V.toFixed(3)}  PVCR=${(iv[pk].J / iv[vl].J).toFixed(2)}  (${ms.toFixed(0)} ms)`);
  ok('NDR present', iv[pk].J / iv[vl].J > 1.3 && pk < iv.length - 5, '');
  ok('peak near 2·E1/e', Math.abs(iv[pk].V - 2 * resonances(p, 0)[0].E) < 0.15, '');
  const cold = ivCurve({ ...p, T: 4 }, 0.6, 100);
  let pk4 = 0; for (let i = 1; i < cold.length; i++) if (cold[i].J > cold[pk4].J) pk4 = i; else break;
  let vl4 = pk4; for (let i = pk4; i < cold.length; i++) if (cold[i].J < cold[vl4].J) vl4 = i;
  console.log(`      4 K: PVCR=${(cold[pk4].J / Math.max(cold[vl4].J, 1e-30)).toExponential(2)} (sharper than 300 K)`);
}

// 4. SET: Coulomb peak spacing = e/Cg, blockade at Vds≈0
{
  const sp = deriveDot({ kind: 'set', diameter: 20, barrier: 3, mEff: gaas.mEff, vb: gaas.vb, epsR: gaas.epsR, T: 1 });
  const r = naturalRanges(sp);
  console.log(`      SET: Ec=${(sp.Ec * 1000).toFixed(2)} meV  CΣ=${(sp.Csum * 1e18).toFixed(2)} aF  e/Cg=${(r.vgPeriod * 1000).toFixed(1)} mV  R=${(sp.Rs / 1e3).toFixed(0)} kΩ`);
  const xs: number[] = [], ys: number[] = [];
  const n = 2000;
  for (let i = 0; i <= n; i++) { const Vg = r.vg0 + ((r.vg1 - r.vg0) * i) / n; xs.push(Vg); ys.push(solve(sp, { Vg, Vds: sp.Ec * 0.02 }).I); }
  const peaks = findPeaks(xs, ys, 0.2 * r.vgPeriod);
  const d = peaks.slice(1).map((v, i) => v - peaks[i]);
  ok('SET peak spacing e/Cg', d.length > 1 && d.every((x) => Math.abs(x - r.vgPeriod) / r.vgPeriod < 0.02), d.map((x) => (x * 1000).toFixed(2)).join(', ') + ' mV');
  const mid = (peaks[0] + peaks[1]) / 2;
  const Ib = solve(sp, { Vg: mid, Vds: 0.8 * sp.Ec }).I, Io = solve(sp, { Vg: mid, Vds: 1.2 * sp.Ec }).I;
  ok('diamond tip at Vds = Ec/e (symmetric)', Math.abs(Ib) < 1e-3 * Math.abs(Io), `I(0.8Ec)=${Ib.toExponential(2)} A  I(1.2Ec)=${Io.toExponential(2)} A`);
}

// 5. QD: alternating addition energies Ec and Ec+Δ (shell filling)
{
  const qp = deriveDot({ kind: 'qd', diameter: 20, barrier: 4, mEff: gaas.mEff, vb: gaas.vb, epsR: gaas.epsR, T: 1 });
  const r = naturalRanges(qp);
  const alpha = qp.Cg / qp.Csum;
  console.log(`      QD: Ec=${(qp.Ec * 1000).toFixed(2)} meV  Δ=${(qp.delta * 1000).toFixed(2)} meV  Γ=${qp.gammaS.toExponential(2)} /s  I_max≈${(Q * qp.gammaS / 2 * 1e12).toFixed(1)} pA`);
  const xs: number[] = [], ys: number[] = [];
  const n = 4000;
  for (let i = 0; i <= n; i++) { const Vg = r.vg0 + ((r.vg1 - r.vg0) * i) / n; xs.push(Vg); ys.push(solve(qp, { Vg, Vds: 2e-5 }).I); }
  const peaks = findPeaks(xs, ys, 0.2 * r.vgPeriod);
  const add = peaks.slice(1).map((v, i) => (v - peaks[i]) * alpha * 1000);
  ok('QD shell filling (1→2: Ec, 2→3: Ec+Δ)', add.length >= 4 &&
    Math.abs(add[0] - qp.Ec * 1000) < 0.3 && Math.abs(add[1] - (qp.Ec + qp.delta) * 1000) < 0.3,
    'addition energies ' + add.map((x) => x.toFixed(2)).join(', ') + ' meV');
  const t0 = performance.now();
  let s = 0;
  for (let i = 0; i < 160 * 120; i++) s += solve(qp, { Vg: r.vg0 + (i % 160) * 1e-4, Vds: 0.001 * (i % 7) }).I;
  console.log(`      160×120 map: ${(performance.now() - t0).toFixed(0)} ms ${s > -1 ? '' : ''}`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
