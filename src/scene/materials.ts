import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { brushed } from './textures';

const goldMap = brushed('#f4f4f4', 0.07);
const aluMap = brushed('#f0f0f0', 0.1);
const grainMap = brushed('#e2e2e2', 0.05);

/** Bench-style materials: metals with brushed maps, matte semiconductors, no clearcoat (no glare). */
export const M = {
  gold: new THREE.MeshStandardMaterial({ color: '#e9bf6c', map: goldMap, roughness: 0.3, metalness: 1 }),
  goldAlloy: new THREE.MeshStandardMaterial({ color: '#b99a6a', map: grainMap, roughness: 0.62, metalness: 0.85 }),
  wire: new THREE.MeshStandardMaterial({ color: '#e8bd6a', roughness: 0.3, metalness: 1 }),
  alu: new THREE.MeshStandardMaterial({ color: '#cfd5da', map: aluMap, roughness: 0.32, metalness: 1 }),
  gaas: new THREE.MeshStandardMaterial({ color: '#27303a', roughness: 0.62, metalness: 0.15 }),
  algaas: new THREE.MeshStandardMaterial({ color: '#36414d', roughness: 0.66, metalness: 0.1 }),
  substrate: new THREE.MeshStandardMaterial({ color: '#1b2027', roughness: 0.8, metalness: 0.1 }),
  nplus: new THREE.MeshStandardMaterial({ color: '#33404c', roughness: 0.6, metalness: 0.15 }),
  spacer: new THREE.MeshStandardMaterial({ color: '#3e4a56', roughness: 0.62, metalness: 0.1 }),
  barrier: new THREE.MeshStandardMaterial({ color: '#a08566', roughness: 0.6, metalness: 0.05 }),
  well: new THREE.MeshStandardMaterial({ color: '#202832', roughness: 0.5, metalness: 0.2 }),
  oxide: new THREE.MeshStandardMaterial({ color: '#8fbfe8', roughness: 0.2, metalness: 0, transparent: true, opacity: 0.7 }),
  twoDeg: new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#5fd0c3', emissiveIntensity: 1.1, toneMapped: false }),
  electron: new THREE.MeshBasicMaterial({ color: new THREE.Color('#8ff3e6').multiplyScalar(1.6), toneMapped: false }),
  electronHot: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a').multiplyScalar(1.6), toneMapped: false }),
};
for (const m of [M.gaas, M.algaas, M.substrate, M.nplus, M.spacer, M.barrier, M.well]) m.side = THREE.DoubleSide;

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
    c.position.set(x, y + height / 2, z); c.castShadow = true; c.receiveShadow = true;
    g.add(c);
  }
  return g;
}

/** Gold bond wire with a ball bond at the pad and a wedge at the far end. */
export function bondWire(a: THREE.Vector3, b: THREE.Vector3, lift = 1.4): THREE.Group {
  const g = new THREE.Group();
  const c1 = a.clone().add(new THREE.Vector3(0, lift, 0));
  const c2 = b.clone().lerp(a, 0.25).add(new THREE.Vector3(0, lift * 0.6, 0));
  const curve = new THREE.CubicBezierCurve3(a, c1, c2, b);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.035, 8, false), M.wire);
  m.castShadow = true; g.add(m);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10), M.wire);
  ball.scale.y = 0.55; ball.position.copy(a); ball.castShadow = true; g.add(ball);
  const wedge = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.12), M.wire);
  wedge.position.copy(b); g.add(wedge);
  return g;
}
