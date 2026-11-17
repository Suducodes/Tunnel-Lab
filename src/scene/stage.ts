import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

export interface Pose { pos: THREE.Vector3; target: THREE.Vector3; }

export class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
  controls: OrbitControls;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  labels = new CSS2DRenderer();
  private tickers = new Set<(dt: number, t: number) => void>();
  private clock = new THREE.Clock();
  private tween: { from: Pose; to: Pose; t: number; dur: number; done?: () => void } | null = null;

  constructor(public host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.labels.domElement.className = 'labels-layer';
    host.appendChild(this.labels.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.22;
    this.scene.background = new THREE.Color('#06090d');
    this.scene.fog = new THREE.Fog('#06090d', 34, 80);

    const key = new THREE.DirectionalLight('#ffe2c4', 1.7);
    key.position.set(8, 14, 6); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
    key.shadow.bias = -0.0004;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#7fd8ff', 0.9); rim.position.set(-10, 6, -10); this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight('#a8c8e0', '#0a0c10', 0.2));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 5; this.controls.maxDistance = 55;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.enablePan = false;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const r = this.host.getBoundingClientRect();
    const w = Math.max(10, r.width), h = Math.max(10, r.height);
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    // keep a minimum horizontal field of view on narrow viewports
    const minH = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(15)) * 1.45);
    this.camera.fov = Math.max(30, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(minH / 2) / this.camera.aspect)));
    this.camera.updateProjectionMatrix();
  }

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
    this.composer.render();
    this.labels.render(this.scene, this.camera);
  }
}

/** Soft radial sprite texture for glows. */
export function glowTexture(color = '#ffffff'): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, color); r.addColorStop(0.25, color + 'aa'); r.addColorStop(1, color + '00');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
