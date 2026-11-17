export function si(v: number, unit: string, digits = 3): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a === 0) return `0 ${unit}`;
  const pre: [number, string][] = [[1e-15, 'f'], [1e-12, 'p'], [1e-9, 'n'], [1e-6, 'µ'], [1e-3, 'm'], [1, ''], [1e3, 'k'], [1e6, 'M']];
  let s = pre[0];
  for (const p of pre) if (a >= p[0] * 0.9995) s = p;
  const x = v / s[0];
  const ax = Math.abs(x);
  const d = ax >= 100 ? Math.max(0, digits - 3) : ax >= 10 ? Math.max(0, digits - 2) : Math.max(0, digits - 1);
  return `${x.toFixed(d)} ${s[1]}${unit}`;
}

export const meV = (e: number, d = 1) => `${(e * 1000).toFixed(d)} meV`;
export const mV = (v: number, d = 1) => `${(v * 1000).toFixed(d)} mV`;

export function temp(T: number): string {
  if (T < 1) return `${(T * 1000).toFixed(0)} mK`;
  if (T < 10) return `${T.toFixed(1)} K`;
  return `${T.toFixed(0)} K`;
}

/** "nice" tick values covering [a, b] */
export function ticks(a: number, b: number, n = 5): number[] {
  const span = b - a;
  if (!(span > 0)) return [a];
  const raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(a / step) * step; v <= b + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

/** Pick a display scale for current arrays: returns [factor, unit] */
export function currentScale(maxA: number): [number, string] {
  const a = Math.abs(maxA);
  if (a >= 1e-3) return [1e3, 'mA'];
  if (a >= 1e-6) return [1e6, 'µA'];
  if (a >= 1e-9) return [1e9, 'nA'];
  if (a >= 1e-12) return [1e12, 'pA'];
  return [1e15, 'fA'];
}
