import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export const M = {
  gold: new THREE.MeshPhysicalMaterial({ color: '#f0bd68', metalness: 1, roughness: 0.2, clearcoat: 0.25 }),
  goldAlloy: new THREE.MeshPhysicalMaterial({ color: '#c99652', metalness: 1, roughness: 0.48 }),
  alu: new THREE.MeshPhysicalMaterial({ color: '#d4dbe2', metalness: 1, roughness: 0.26 }),
  gaas: new THREE.MeshPhysicalMaterial({ color: '#1a2129', metalness: 0.3, roughness: 0.45, clearcoat: 0.18, clearcoatRoughness: 0.45 }),
  algaas: new THREE.MeshPhysicalMaterial({ color: '#2c3845', metalness: 0.15, roughness: 0.5, clearcoat: 0.15 }),
  substrate: new THREE.MeshStandardMaterial({ color: '#12171d', metalness: 0.25, roughness: 0.55 }),
  nplus: new THREE.MeshPhysicalMaterial({ color: '#2b3643', metalness: 0.2, roughness: 0.6, clearcoat: 0.08, clearcoatRoughness: 0.6 }),
  barrier: new THREE.MeshPhysicalMaterial({ color: '#8c7360', metalness: 0.1, roughness: 0.5, clearcoat: 0.3 }),
  well: new THREE.MeshPhysicalMaterial({ color: '#171d25', metalness: 0.2, roughness: 0.3, clearcoat: 0.6 }),
  oxide: new THREE.MeshPhysicalMaterial({ color: '#7fb6ff', metalness: 0, roughness: 0.1, transmission: 0.6, transparent: true, opacity: 0.75 }),
  twoDeg: new THREE.MeshBasicMaterial({ color: new THREE.Color('#5fe1ff').multiplyScalar(1.15) }),
  electron: new THREE.MeshBasicMaterial({ color: new THREE.Color('#7fe9ff').multiplyScalar(2.2) }),
  electronHot: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a').multiplyScalar(2.4) }),
};
for (const k of ['gaas', 'algaas', 'substrate', 'nplus', 'well', 'barrier'] as const) M[k].envMapIntensity = 0.35;

export function label(text: string, sub?: string, cls = ''): CSS2DObject {
  const el = document.createElement('div');
  el.className = `lbl ${cls}`;
  el.innerHTML = `<span class="lbl-dot"></span><span class="lbl-t">${text}</span>${sub ? `<span class="lbl-s">${sub}</span>` : ''}`;
  const o = new CSS2DObject(el);
  o.center.set(0, 1);
  return o;
}

/** Lithographic wire: boxes along a polyline with round joints. Points are (x, z). */
export function trace(points: [number, number][], width: number, height: number, mat: THREE.Material, y: number): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, height, width), mat);
    m.position.set((ax + bx) / 2, y + height / 2, (az + bz) / 2);
    m.rotation.y = -Math.atan2(bz - az, bx - ax);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  }
  for (const [x, z] of points) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(width / 2, width / 2, height, 24), mat);
    c.position.set(x, y + height / 2, z); c.castShadow = true;
    g.add(c);
  }
  return g;
}

export function bondWire(a: THREE.Vector3, b: THREE.Vector3, lift = 1.4): THREE.Mesh {
  const mid = a.clone().lerp(b, 0.35); mid.y += lift;
  const mid2 = a.clone().lerp(b, 0.75); mid2.y += lift * 0.7;
  const curve = new THREE.CatmullRomCurve3([a, mid, mid2, b]);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.028, 8, false), M.gold);
  m.castShadow = true;
  return m;
}
