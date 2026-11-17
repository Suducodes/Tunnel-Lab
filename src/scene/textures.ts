// Procedural textures: the bench mat, a µm ruler, etched die tops, layered side walls, brushed metal.
import * as THREE from 'three';

const MONO = '"IBM Plex Mono", ui-monospace, monospace';
const DISPLAY = '"Saira Semi Condensed", "Arial Narrow", sans-serif';

export function canvasTex(w: number, h: number, ppu: number, draw: (g: CanvasRenderingContext2D, s: number, W: number, H: number) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w * ppu)); c.height = Math.max(2, Math.round(h * ppu));
  const g = c.getContext('2d')!;
  draw(g, ppu, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function noise(g: CanvasRenderingContext2D, w: number, h: number, n: number, a1: number, a2: number) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a1})` : `rgba(0,0,0,${a2})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random());
  }
}

/** Self-healing cutting mat, 5 units per tile with a 1-unit grid. */
export function matTexture(): THREE.Texture {
  const t = canvasTex(5, 5, 160, (g, s, W) => {
    g.fillStyle = '#26333c'; g.fillRect(0, 0, W, W);
    noise(g, W, W, 14000, 0.022, 0.05);
    g.strokeStyle = 'rgba(150,190,210,.09)'; g.lineWidth = 1.2;
    for (let i = 1; i < 5; i++) { const p = i * s; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, W); g.moveTo(0, p); g.lineTo(W, p); g.stroke(); }
    g.strokeStyle = 'rgba(150,190,210,.2)'; g.lineWidth = 2.4; g.strokeRect(0, 0, W, W);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Ruler in micrometres (1 world unit = 1 µm on the device bench). */
export function rulerTexture(len: number, unit: string, step = 1): THREE.Texture {
  return canvasTex(len, 1.6, 120, (g, s, W, H) => {
    g.fillStyle = 'rgba(226,180,87,.07)'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(236,230,214,.62)'; g.fillStyle = 'rgba(236,230,214,.72)'; g.lineWidth = 1.6;
    g.font = `500 ${0.42 * s}px ${MONO}`; g.textAlign = 'center';
    const n = Math.round(len / step * 10);
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * W + (i === 0 ? 1 : i === n ? -1 : 0);
      const l = i % 10 === 0 ? 0.62 : i % 5 === 0 ? 0.4 : 0.22;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, l * s); g.stroke();
      if (i % 10 === 0 && i > 0 && i < n) g.fillText(String((i / 10) * step), x, 1.1 * s);
    }
    g.textAlign = 'left'; g.font = `500 ${0.34 * s}px ${MONO}`; g.fillText(unit, 0.15 * s, 1.1 * s);
  });
}

/** Etched die top: wafer ID, alignment crosses, scale bar, pad labels. */
export function dieTopTexture(w: number, d: number, id: string, sub: string, pads: [string, number, number][] = []): THREE.Texture {
  return canvasTex(w, d, 110, (g, s, W, H) => {
    const gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, '#2a3440'); gr.addColorStop(0.5, '#222b35'); gr.addColorStop(1, '#2b3139');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    noise(g, W, H, W * H / 60, 0.02, 0.04);
    // faint interference sheen bands (thin-film colour on the cap layer)
    for (let i = 0; i < 6; i++) {
      const y = Math.random() * H, rg = g.createLinearGradient(0, y - 80, 0, y + 80);
      rg.addColorStop(0, 'rgba(120,90,160,0)'); rg.addColorStop(0.5, `rgba(${100 + Math.random() * 60},${110 + Math.random() * 40},170,.035)`); rg.addColorStop(1, 'rgba(120,90,160,0)');
      g.fillStyle = rg; g.fillRect(0, y - 80, W, 160);
    }
    g.strokeStyle = 'rgba(200,215,225,.18)'; g.lineWidth = 2; g.strokeRect(0.25 * s, 0.25 * s, W - 0.5 * s, H - 0.5 * s);
    // alignment crosses
    const cross = (x: number, y: number) => {
      g.strokeStyle = 'rgba(226,180,87,.55)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x - 0.35 * s, y); g.lineTo(x + 0.35 * s, y); g.moveTo(x, y - 0.35 * s); g.lineTo(x, y + 0.35 * s); g.stroke();
      g.strokeRect(x - 0.12 * s, y - 0.12 * s, 0.24 * s, 0.24 * s);
    };
    cross(0.8 * s, 0.8 * s); cross(W - 0.8 * s, 0.8 * s); cross(0.8 * s, H - 0.8 * s); cross(W - 0.8 * s, H - 0.8 * s);
    // die label
    g.fillStyle = 'rgba(230,226,214,.55)'; g.font = `600 ${0.42 * s}px ${DISPLAY}`; g.textAlign = 'left';
    g.fillText(id, 1.4 * s, 1.0 * s);
    g.fillStyle = 'rgba(200,205,210,.38)'; g.font = `500 ${0.24 * s}px ${MONO}`;
    g.fillText(sub, 1.4 * s, 1.36 * s);
    // scale bar
    const sbx = W - 3.3 * s, sby = H - 0.9 * s;
    g.fillStyle = 'rgba(230,226,214,.5)'; g.fillRect(sbx, sby, 2 * s, 0.07 * s);
    g.font = `500 ${0.22 * s}px ${MONO}`; g.textAlign = 'center'; g.fillText('2 µm', sbx + s, sby - 0.15 * s);
    // pad labels
    g.fillStyle = 'rgba(226,180,87,.55)'; g.font = `600 ${0.26 * s}px ${MONO}`;
    for (const [t, x, z] of pads) g.fillText(t, (x + w / 2) * s, (z + d / 2) * s);
  });
}

/** Side wall showing the heterostructure stack: list of [height fraction, colour] from top to bottom. */
export function stackTexture(layers: [number, string][], glowAt?: number): THREE.Texture {
  return canvasTex(4, 2, 128, (g, s, W, H) => {
    let y = 0;
    for (const [f, c] of layers) { g.fillStyle = c; g.fillRect(0, y, W, f * H + 1); y += f * H; }
    noise(g, W, H, 3000, 0.03, 0.05);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`; g.fillRect(Math.random() * W, 0, 1, H); }
    if (glowAt !== undefined) {
      const gy = glowAt * H;
      const gg = g.createLinearGradient(0, gy - 10, 0, gy + 10);
      gg.addColorStop(0, 'rgba(95,208,195,0)'); gg.addColorStop(0.5, 'rgba(130,240,225,.95)'); gg.addColorStop(1, 'rgba(95,208,195,0)');
      g.fillStyle = gg; g.fillRect(0, gy - 10, W, 20);
    }
  });
}

/** Grainy brushed-metal colour map. */
export function brushed(base: string, streak = 0.12): THREE.Texture {
  const t = canvasTex(2, 2, 256, (g, _s, W, H) => {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) {
      const y = Math.random() * H;
      g.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${Math.random() * streak})` : `rgba(40,30,10,${Math.random() * streak * 0.8})`;
      g.fillRect(0, y, W, 1 + Math.random() * 1.5);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Radial soft disc (alpha) for decals such as the dot's electron puddle. */
export function discTexture(): THREE.Texture {
  return canvasTex(1, 1, 128, (g, _s, W) => {
    const r = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.45, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, W, W);
  }, false);
}
