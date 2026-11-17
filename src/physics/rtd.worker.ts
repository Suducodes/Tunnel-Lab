import { ivCurve, type RtdParams } from './rtd';

self.onmessage = (ev: MessageEvent<{ id: number; p: RtdParams; vMax: number; n: number }>) => {
  const { id, p, vMax, n } = ev.data;
  const curve = ivCurve(p, vMax, n);
  (self as unknown as Worker).postMessage({ id, curve });
};
