import * as THREE from 'three';
import { M } from './materials';
import { glowTexture } from './stage';

const SPH = new THREE.SphereGeometry(1, 16, 12);
let GLOW: THREE.Texture | null = null;

interface Flyer { obj: THREE.Group; path: (u: number) => THREE.Vector3; u: number; dur: number; fade: (u: number) => number; done?: () => void; }

/** Short-lived glowing electrons that travel along a path. */
export class Flyers {
  group = new THREE.Group();
  private live: Flyer[] = [];
  private pool: THREE.Group[] = [];

  constructor(private size = 0.075) {}

  private make(hot: boolean): THREE.Group {
    GLOW ??= glowTexture('#9eefff');
    const g = this.pool.pop() ?? (() => {
      const o = new THREE.Group();
      o.add(new THREE.Mesh(SPH, M.electron));
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: '#5fe1ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.scale.setScalar(5);
      o.add(s);
      return o;
    })();
    (g.children[0] as THREE.Mesh).material = hot ? M.electronHot : M.electron;
    ((g.children[1] as THREE.Sprite).material as THREE.SpriteMaterial).color.set(hot ? '#ffc96b' : '#5fe1ff');
    g.scale.setScalar(this.size);
    g.visible = true;
    this.group.add(g);
    return g;
  }

  spawn(path: (u: number) => THREE.Vector3, dur: number, opts: { hot?: boolean; fade?: (u: number) => number; done?: () => void } = {}) {
    if (this.live.length > 160) return;
    const obj = this.make(!!opts.hot);
    obj.position.copy(path(0));
    this.live.push({ obj, path, u: 0, dur, fade: opts.fade ?? (() => 1), done: opts.done });
  }

  update(dt: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const f = this.live[i];
      f.u += dt / f.dur;
      if (f.u >= 1) {
        f.obj.visible = false; this.group.remove(f.obj); this.pool.push(f.obj);
        this.live.splice(i, 1); f.done?.();
        continue;
      }
      f.obj.position.copy(f.path(f.u));
      const a = f.fade(f.u);
      f.obj.scale.setScalar(this.size * (0.35 + 0.65 * a));
      ((f.obj.children[1] as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 0.7 * a;
    }
  }

  clear() { for (const f of this.live) { this.group.remove(f.obj); this.pool.push(f.obj); } this.live = []; }
  get count() { return this.live.length; }
}

export const polyPath = (pts: THREE.Vector3[]) => {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  return (u: number) => curve.getPoint(u);
};
