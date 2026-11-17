import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { matTexture, rulerTexture } from './textures';

export interface Pose { pos: THREE.Vector3; target: THREE.Vector3; }

/**
 * Product-photo lighting on a dark bench (the RP2040 bench recipe): soft hemisphere,
 * one warm key with soft shadows, a cool rim. No bloom: glow comes from un-tonemapped emissives only.
 */
export class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
  controls: OrbitControls;
  labels = new CSS2DRenderer();
  ruler: THREE.Mesh;
  private tickers = new Set<(dt: number, t: number) => void>();
  private clock = new THREE.Clock();
  private tween: { from: Pose; to: Pose; t: number; dur: number; done?: () => void } | null = null;

  constructor(public host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.labels.domElement.className = 'labels-layer';
    host.appendChild(this.labels.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    this.scene.environmentIntensity = 0.55;
    this.scene.background = new THREE.Color('#0d1216');
    this.scene.fog = new THREE.Fog('#0d1216', 45, 120);

    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a130c, 0.5));
    const key = new THREE.DirectionalLight(0xfff0dc, 1.15);
    key.position.set(9, 18, 12); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 2, far: 60 });
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffe2c2, 0.22); fill.position.set(-12, 6, 10); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0x7fb2ff, 0.4); rim.position.set(-10, 8, -14); this.scene.add(rim);

    // the bench: cutting mat plus a ruler
    const mt = matTexture(); mt.repeat.set(24, 24);
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ map: mt, roughness: 0.92, metalness: 0 }));
    mat.rotation.x = -Math.PI / 2; mat.receiveShadow = true;
    this.scene.add(mat);
    this.ruler = new THREE.Mesh(new THREE.PlaneGeometry(16, 1.6), new THREE.MeshStandardMaterial({ map: rulerTexture(16, 'µm', 2), transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    this.ruler.rotation.x = -Math.PI / 2; this.ruler.position.set(0, 0.01, 7.6);
    this.scene.add(this.ruler);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 6; this.controls.maxDistance = 48;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.screenSpacePanning = true;

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const r = this.host.getBoundingClientRect();
    const w = Math.max(10, r.width), h = Math.max(10, r.height);
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    const minH = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(15)) * 1.5);
    this.camera.fov = Math.max(30, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(minH / 2) / this.camera.aspect)));
    // keep the object centred in the space between the floating panels
    if (w > 980) this.camera.setViewOffset(w, h, (this.insetR - this.insetL) / 2, 0, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }
  insetL = 296; insetR = 384;

  onTick(fn: (dt: number, t: number) => void) { this.tickers.add(fn); }

  fly(to: Pose, dur = 1.4, done?: () => void) {
    this.tween = { from: { pos: this.camera.position.clone(), target: this.controls.target.clone() }, to, t: 0, dur, done };
  }
  jump(to: Pose) { this.camera.position.copy(to.pos); this.controls.target.copy(to.target); this.controls.update(); }

  private frame() {
    const dt = Math.min(0.05, this.clock.getDelta()), t = this.clock.elapsedTime;
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const e = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - Math.pow(-2 * tw.t + 2, 3) / 2;
      this.camera.position.lerpVectors(tw.from.pos, tw.to.pos, e);
      this.controls.target.lerpVectors(tw.from.target, tw.to.target, e);
      if (tw.t >= 1) { this.tween = null; tw.done?.(); }
    }
    this.controls.update();
    for (const f of this.tickers) f(dt, t);
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}

/** Soft radial sprite texture for halos. */
export function glowTexture(color = '#ffffff'): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, color); r.addColorStop(0.25, color + '88'); r.addColorStop(1, color + '00');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
