import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three/webgpu';

/**
 * Texturas procedurais, desenhadas num canvas 2D na hora: asfalto com faixas, fachada e janelas
 * acesas das torres, normal da água e a placa do carro. Nenhum arquivo para baixar. Determinísticas
 * por um gerador próprio, para a mesma maquete sair igual em qualquer aparelho.
 */
type Draw = (g: CanvasRenderingContext2D, w: number, h: number, rnd: () => number) => void;

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTexture(w: number, h: number, draw: Draw, srgb = true, seed = 7): Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) draw(g, w, h, seeded(seed));
  const t = new CanvasTexture(c);
  if (srgb) t.colorSpace = SRGBColorSpace;
  return t;
}

export type SceneTextures = {
  road: Texture;
  facade: Texture;
  windows: Texture;
  waterNormal: Texture;
  dispose: () => void;
};

export function createSceneTextures(colors: { road: string; lane: string }): SceneTextures {
  const road = canvasTexture(256, 512, (g, w, h, rnd) => {
    g.fillStyle = colors.road;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(${200 + rnd() * 55},${200 + rnd() * 55},${210 + rnd() * 45},${0.05 + rnd() * 0.08})`;
      g.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
    g.fillStyle = '#e8e4da';
    g.fillRect(w * 0.055, 0, w * 0.02, h);
    g.fillRect(w * 0.925, 0, w * 0.02, h);
    g.fillStyle = colors.lane;
    for (let y = 0; y < h; y += h / 3) g.fillRect(w * 0.49, y + h / 24, w * 0.02, h / 6);
  });
  road.wrapT = RepeatWrapping;
  road.anisotropy = 8;

  const facade = canvasTexture(64, 128, (g, w, h, rnd) => {
    g.fillStyle = '#d3d4cf';
    g.fillRect(0, 0, w, h);
    for (let r = 0; r < 20; r++) {
      for (let c = 0; c < 6; c++) {
        g.fillStyle = rnd() < 0.5 ? '#39434f' : '#4b5663';
        g.fillRect(4 + c * 10, 4 + r * 6, 6, 3.5);
      }
    }
    g.fillStyle = '#7a7c78';
    g.fillRect(w - 8, 0, 8, 8);
  });

  const windows = canvasTexture(64, 128, (g, w, h, rnd) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    for (let r = 0; r < 20; r++) {
      for (let c = 0; c < 6; c++) {
        if (rnd() < 0.42) {
          g.fillStyle = rnd() < 0.7 ? '#ffcf84' : '#cfe2ff';
          g.fillRect(4 + c * 10, 4 + r * 6, 6, 3.5);
        }
      }
    }
    g.fillStyle = '#000';
    g.fillRect(w - 8, 0, 8, 8);
  });

  const waterNormal = canvasTexture(
    128,
    128,
    (g, w, h) => {
      const img = g.createImageData(w, h);
      const d = img.data;
      const hgt = (u: number, v: number) =>
        0.5 * Math.sin(u * 6.283 * 3) +
        0.5 * Math.sin((v * 2 + u) * 6.283) +
        0.25 * Math.sin((u * 5 - v * 3) * 6.283);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const u = x / w;
          const v = y / h;
          const e = 1 / w;
          const dx = (hgt(u + e, v) - hgt(u - e, v)) * 0.5;
          const dy = (hgt(u, v + e) - hgt(u, v - e)) * 0.5;
          const l = Math.hypot(dx, dy, 1);
          const i = (y * w + x) * 4;
          d[i] = ((-dx / l) * 0.5 + 0.5) * 255;
          d[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
          d[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
          d[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    },
    false,
  );
  waterNormal.wrapS = waterNormal.wrapT = RepeatWrapping;

  return {
    road,
    facade,
    windows,
    waterNormal,
    dispose: () => {
      for (const t of [road, facade, windows, waterNormal]) t.dispose();
    },
  };
}

/** O texto da placa: maiúsculo, uma linha, sem espaços repetidos; "VIAJEI" quando vazio. */
export function plateText(text: string | null | undefined): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('pt-BR');
  return clean.length > 0 ? clean : 'VIAJEI';
}

/**
 * A placa do carro: "VIAJEI" por padrão; com o acessório da conquista Viajei!, o nome da viagem. O
 * texto encolhe até caber e, se nem no menor tamanho couber, termina em reticências.
 */
export function createPlateTexture(text?: string | null): Texture {
  const label = plateText(text);
  return canvasTexture(256, 72, (g, w, h) => {
    g.fillStyle = '#f2efe6';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f3a8a';
    g.fillRect(0, 0, w, 14);
    g.fillStyle = '#111';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const max = w - 20;
    let size = 44;
    const font = (s: number) => `700 ${s}px "Barlow Condensed", "Barlow", sans-serif`;
    g.font = font(size);
    while (size > 20 && g.measureText(label).width > max) {
      size -= 2;
      g.font = font(size);
    }
    let shown = label;
    while (shown.length > 1 && g.measureText(shown).width > max) shown = `${shown.slice(0, -2)}…`;
    g.fillText(shown, w / 2, h / 2 + 8);
  });
}

/** Um adesivo redondo, desenhado da mesma arte (paths de 24 × 24) que a vista lateral usa. */
export function createStickerTexture(art: {
  bg: string;
  ring: string;
  ink: string;
  strokes: readonly string[];
  fills: readonly string[];
  highlights: readonly string[];
  stroke: number;
  ringWidth: number;
}): Texture {
  const t = canvasTexture(128, 128, (g, w) => {
    if (typeof Path2D === 'undefined') return;
    const s = w / 24;
    g.scale(s, s);
    g.beginPath();
    g.arc(12, 12, 11.2, 0, Math.PI * 2);
    g.fillStyle = art.bg;
    g.fill();
    g.lineWidth = art.ringWidth;
    g.strokeStyle = art.ring;
    g.stroke();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = art.stroke;
    g.strokeStyle = art.ink;
    for (const d of art.strokes) g.stroke(new Path2D(d));
    g.fillStyle = art.ink;
    for (const d of art.fills) g.fill(new Path2D(d));
    g.fillStyle = '#ffffff';
    for (const d of art.highlights) g.fill(new Path2D(d));
  });
  t.anisotropy = 4;
  return t;
}

/** Sombra de contato: um degradê radial escuro no centro que some na borda, sem shader próprio. */
export function createContactShadowTexture(): Texture {
  return canvasTexture(
    128,
    128,
    (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(0,0,0,0.62)');
      grad.addColorStop(0.55, 'rgba(0,0,0,0.3)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    },
    true,
  );
}
