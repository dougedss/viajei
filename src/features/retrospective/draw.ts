import { CUE_MS, type FilmCue, type FilmPlan, type FinalTexts } from './rules.ts';

/**
 * O desenho em Canvas 2D da retrospectiva, um código só para três usos: os textos e as fotos por cima
 * da maquete no app, os mesmos por cima de cada quadro do vídeo exportado, e os cards como imagem.
 * O que se vê no app é o que se exporta. Tudo em unidades do quadro de 1080 de largura (`u`), com a
 * Barlow carregada pelo `FontFace` (`loadFonts`) e as fotos já decodificadas (ImageBitmap do cache).
 * Sem `html-to-image`: no Safari, o caminho por `foreignObject` perde fontes e imagens (D123).
 */
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type Bitmap = ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas;

export type FilmArt = {
  eyebrow: string;
  name: string;
  plan: FilmPlan;
  texts: FinalTexts;
  badges: readonly { name: string; color: string }[];
  team: readonly { name: string; color: string }[];
  /** as fotos dos nós, por id do anexo */
  photos: ReadonlyMap<string, Bitmap>;
  /** o carro da viagem de lado (o `CarSide` como imagem), para o fundo sem 3D e os cards */
  car: Bitmap | null;
};

const NIGHT = '#16213D';
const ASPHALT = '#3A4766';
const SUNSET = '#F2622E';
const LANE = '#FFD166';
const PAPER = '#F1EEE7';
const NUM = '"Barlow Condensed", "Barlow", "Arial Narrow", sans-serif';
const UI = '"Barlow", system-ui, sans-serif';

/** Carrega as fontes do desenho (as mesmas do app, self-hosted e no precache: funciona sem sinal). */
export async function loadFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  await Promise.all([
    document.fonts.load(`700 120px ${NUM}`),
    document.fonts.load(`600 60px ${NUM}`),
    document.fonts.load(`600 48px ${UI}`),
    document.fonts.load(`500 40px ${UI}`),
  ]).catch(() => undefined);
}

function dims(b: Bitmap): { w: number; h: number } {
  if (b instanceof HTMLImageElement) return { w: b.naturalWidth, h: b.naturalHeight };
  return { w: b.width, h: b.height };
}

/** A foto cobrindo a caixa, cortada no centro (como `object-fit: cover`). */
function cover(ctx: Ctx2D, img: Bitmap, x: number, y: number, w: number, h: number): void {
  const { w: iw, h: ih } = dims(img);
  if (iw === 0 || ih === 0) return;
  const k = Math.max(w / iw, h / ih);
  const sw = w / k;
  const sh = h / k;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

function contain(ctx: Ctx2D, img: Bitmap, x: number, y: number, w: number, h: number): void {
  const { w: iw, h: ih } = dims(img);
  if (iw === 0 || ih === 0) return;
  const k = Math.min(w / iw, h / ih);
  ctx.drawImage(img, x + (w - iw * k) / 2, y + (h - ih * k) / 2, iw * k, ih * k);
}

function rounded(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** O texto cabendo na largura: diminui a fonte até caber (nunca abaixo de 60%). */
function fitText(
  ctx: Ctx2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  weight: number,
  size: number,
  family: string,
): void {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxW && s > size * 0.6) {
    s -= size * 0.04;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  ctx.fillText(text, x, y);
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Entra e sai: 0 → 1 em `fade` ms no começo, 1 → 0 no fim do intervalo. */
function presence(t: number, t0: number, t1: number, fade = 220): number {
  if (t < t0 || t > t1) return 0;
  return Math.min(clamp01((t - t0) / fade), clamp01((t1 - t) / fade));
}

/** O fundo sem 3D: céu de fim de tarde, a serra, a estrada com a faixa e o carro de lado. */
export function drawBackground(ctx: Ctx2D, w: number, h: number, car: Bitmap | null): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, NIGHT);
  sky.addColorStop(0.55, '#3B3F6B');
  sky.addColorStop(0.8, '#C2613F');
  sky.addColorStop(1, '#E8A15A');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const u = w / 1080;
  ctx.fillStyle = 'rgb(20 26 44 / 0.75)';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.78);
  ctx.bezierCurveTo(w * 0.25, h * 0.7, w * 0.45, h * 0.74, w * 0.6, h * 0.69);
  ctx.bezierCurveTo(w * 0.8, h * 0.64, w * 0.9, h * 0.7, w, h * 0.68);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();
  ctx.fillStyle = ASPHALT;
  ctx.fillRect(0, h * 0.84, w, h * 0.16);
  ctx.strokeStyle = LANE;
  ctx.lineWidth = 8 * u;
  ctx.setLineDash([60 * u, 60 * u]);
  ctx.beginPath();
  ctx.moveTo(0, h * 0.92);
  ctx.lineTo(w, h * 0.92);
  ctx.stroke();
  ctx.setLineDash([]);
  if (car) contain(ctx, car, w * 0.12, h * 0.7, w * 0.76, h * 0.17);
}

function drawTitle(ctx: Ctx2D, w: number, h: number, art: FilmArt, alpha: number): void {
  const u = w / 1080;
  ctx.save();
  ctx.globalAlpha = alpha;
  const shade = ctx.createLinearGradient(0, 0, 0, h * 0.55);
  shade.addColorStop(0, 'rgb(10 14 28 / 0.65)');
  shade.addColorStop(1, 'rgb(10 14 28 / 0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h * 0.55);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = LANE;
  ctx.font = `600 ${40 * u}px ${UI}`;
  ctx.fillText(art.eyebrow.toLocaleUpperCase('pt-BR'), w / 2, h * 0.17);
  ctx.fillStyle = PAPER;
  fitText(ctx, 'Viajei!', w / 2, h * 0.17 + 230 * u, w * 0.9, 700, 250 * u, NUM);
  ctx.fillStyle = 'rgb(241 238 231 / 0.92)';
  fitText(ctx, art.name, w / 2, h * 0.17 + 320 * u, w * 0.88, 600, 60 * u, UI);
  ctx.restore();
}

function stars(rating: number | null): string {
  const n = Math.max(0, Math.min(5, rating ?? 0));
  return n > 0 ? '★'.repeat(n) : '';
}

function drawCue(ctx: Ctx2D, w: number, h: number, art: FilmArt, cue: FilmCue, t: number): void {
  const u = w / 1080;
  const a = presence(t, cue.t, cue.until);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  if (cue.kind === 'day') {
    ctx.font = `600 ${50 * u}px ${NUM}`;
    const tw = ctx.measureText(cue.label).width;
    rounded(ctx, 60 * u, h * 0.08, tw + 64 * u, 84 * u, 42 * u);
    ctx.fillStyle = 'rgb(16 22 40 / 0.78)';
    ctx.fill();
    ctx.fillStyle = PAPER;
    ctx.textBaseline = 'middle';
    ctx.fillText(cue.label, 92 * u, h * 0.08 + 44 * u);
    ctx.restore();
    return;
  }
  // a foto (ou a missão) entra crescendo um pouco, inclinada, como um cartão sobre a mesa
  const grow = 0.92 + 0.08 * clamp01((t - cue.t) / 260);
  const cw = 720 * u * grow;
  const ch = (cue.kind === 'photo' ? 760 : 420) * u * grow;
  const cx = w / 2;
  const cy = h * 0.4;
  const tilt = ((cue.t / CUE_MS) % 2 === 0 ? -1 : 1) * 0.05;
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.shadowColor = 'rgb(0 0 0 / 0.35)';
  ctx.shadowBlur = 40 * u;
  rounded(ctx, -cw / 2, -ch / 2, cw, ch, 28 * u);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.shadowBlur = 0;
  const pad = 26 * u;
  if (cue.kind === 'photo') {
    const img = art.photos.get(cue.attachment_id);
    const ph = ch - pad * 2 - 150 * u;
    ctx.save();
    rounded(ctx, -cw / 2 + pad, -ch / 2 + pad, cw - pad * 2, ph, 18 * u);
    ctx.clip();
    if (img) cover(ctx, img, -cw / 2 + pad, -ch / 2 + pad, cw - pad * 2, ph);
    else {
      ctx.fillStyle = ASPHALT;
      ctx.fill();
    }
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.fillStyle = SUNSET;
    ctx.font = `700 ${46 * u}px ${UI}`;
    ctx.fillText(stars(cue.rating), -cw / 2 + pad, ch / 2 - 100 * u);
    ctx.fillStyle = NIGHT;
    fitText(ctx, cue.name, -cw / 2 + pad, ch / 2 - 40 * u, cw - pad * 2, 700, 52 * u, UI);
  } else {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#15754C';
    ctx.font = `700 ${40 * u}px ${UI}`;
    ctx.fillText('MISSÃO', -cw / 2 + pad + 6 * u, -ch / 2 + 90 * u);
    ctx.fillStyle = NIGHT;
    fitText(ctx, cue.text, -cw / 2 + pad + 6 * u, -ch / 2 + 190 * u, cw - pad * 2, 700, 58 * u, UI);
    ctx.fillStyle = '#5B6474';
    fitText(ctx, cue.name, -cw / 2 + pad + 6 * u, -ch / 2 + 270 * u, cw - pad * 2, 500, 44 * u, UI);
  }
  ctx.restore();
}

/** O card final: os números, o gasto contra o orçamento, as conquistas da viagem e o time. */
function drawFinal(
  ctx: Ctx2D,
  w: number,
  h: number,
  art: FilmArt,
  alpha: number,
  top: number,
): void {
  const u = w / 1080;
  ctx.save();
  ctx.globalAlpha = alpha;
  const panel = ctx.createLinearGradient(0, top - 120 * u, 0, h);
  panel.addColorStop(0, 'rgb(10 14 28 / 0)');
  panel.addColorStop(0.18, 'rgb(10 14 28 / 0.82)');
  panel.addColorStop(1, 'rgb(10 14 28 / 0.92)');
  ctx.fillStyle = panel;
  ctx.fillRect(0, top - 120 * u, w, h - top + 120 * u);
  ctx.textAlign = 'center';
  ctx.fillStyle = LANE;
  ctx.font = `600 ${38 * u}px ${UI}`;
  ctx.fillText('O FIM DO FILME', w / 2, top + 20 * u);
  const stats = art.texts.stats;
  const col = (w - 120 * u) / Math.max(1, stats.length);
  stats.forEach((s, i) => {
    const x = 60 * u + col * i + col / 2;
    ctx.fillStyle = PAPER;
    fitText(ctx, s.value, x, top + 180 * u, col - 16 * u, 700, 130 * u, NUM);
    ctx.fillStyle = 'rgb(241 238 231 / 0.75)';
    ctx.font = `500 ${36 * u}px ${UI}`;
    ctx.fillText(s.label, x, top + 232 * u);
  });
  let y = top + 330 * u;
  if (art.texts.budget) {
    ctx.fillStyle = PAPER;
    fitText(ctx, art.texts.budget, w / 2, y, w - 120 * u, 600, 44 * u, UI);
    y += 90 * u;
  }
  // as conquistas da viagem: um selo por linha de duas colunas, com a cor de cada uma
  const badges = art.badges.slice(0, 6);
  const bw = (w - 160 * u) / 2;
  badges.forEach((b, i) => {
    const bx = 60 * u + (i % 2) * (bw + 40 * u);
    const by = y + Math.floor(i / 2) * 96 * u;
    rounded(ctx, bx, by, bw, 76 * u, 38 * u);
    ctx.fillStyle = 'rgb(255 255 255 / 0.1)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bx + 38 * u, by + 38 * u, 24 * u, 0, Math.PI * 2);
    ctx.fillStyle = b.color;
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = PAPER;
    fitText(ctx, b.name, bx + 76 * u, by + 50 * u, bw - 96 * u, 600, 34 * u, UI);
  });
  y += Math.ceil(badges.length / 2) * 96 * u + 40 * u;
  if (art.team.length > 0) {
    ctx.textAlign = 'center';
    const names = art.team.map((m) => m.name);
    const line =
      names.length <= 1
        ? (names[0] ?? '')
        : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1] ?? ''}`;
    ctx.font = `600 ${40 * u}px ${UI}`;
    const tw = ctx.measureText(line).width;
    const dots = art.team.length * 30 * u;
    let x = w / 2 - (tw + dots + 16 * u) / 2;
    for (const m of art.team) {
      ctx.beginPath();
      ctx.arc(x + 12 * u, y - 14 * u, 12 * u, 0, Math.PI * 2);
      ctx.fillStyle = m.color;
      ctx.fill();
      x += 30 * u;
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = PAPER;
    ctx.fillText(line, x + 16 * u, y);
  }
  ctx.restore();
}

/**
 * Um quadro do filme por cima da maquete (ou do fundo sem 3D): o título na abertura, os chips dos
 * dias, as fotos e as missões no sobrevoo e o card final. `t` é o relógio do filme, em ms. Não limpa
 * o quadro: na exportação ele vem depois dos pixels da maquete; no app, quem chama limpa.
 */
export function drawFilmOverlay(
  ctx: Ctx2D,
  w: number,
  h: number,
  art: FilmArt,
  t: number,
  opts: { background: boolean },
): void {
  if (opts.background) drawBackground(ctx, w, h, art.car);
  const { plan } = art;
  const titleAlpha = t < plan.opening.t1 ? presence(t, 0, plan.opening.t1, 400) : 0;
  if (titleAlpha > 0) drawTitle(ctx, w, h, art, titleAlpha);
  for (const cue of plan.cues) drawCue(ctx, w, h, art, cue, t);
  if (t >= plan.final.t0) {
    const a = clamp01((t - plan.final.t0) / 500);
    drawFinal(ctx, w, h, art, a, h * 0.5);
  }
}

// ------------------------------------------------------------------ os cards como imagem
export type CardKind = 'abertura' | 'numeros' | 'conquistas' | 'fotos';
export const CARD_KINDS: readonly CardKind[] = ['abertura', 'numeros', 'conquistas', 'fotos'];
export const CARD_LABELS: Record<CardKind, string> = {
  abertura: 'Abertura',
  numeros: 'Números',
  conquistas: 'Conquistas',
  fotos: 'Fotos',
};

/** Feed (4:5) e stories (9:16), a 1080 de largura. */
export const CARD_SIZES = {
  feed: { w: 1080, h: 1350, label: 'Feed 4:5' },
  stories: { w: 1080, h: 1920, label: 'Stories 9:16' },
} as const;
export type CardSize = keyof typeof CARD_SIZES;

/** Um card estático: o mesmo desenho do filme, parado no momento de cada um. */
export function drawCard(ctx: Ctx2D, w: number, h: number, kind: CardKind, art: FilmArt): void {
  const u = w / 1080;
  drawBackground(ctx, w, h, kind === 'abertura' || kind === 'numeros' ? art.car : null);
  if (kind === 'abertura') {
    drawTitle(ctx, w, h, art, 1);
  } else if (kind === 'numeros') {
    drawFinal(ctx, w, h, { ...art, badges: [], team: [] }, 1, h * 0.18);
  } else if (kind === 'conquistas') {
    drawFinal(ctx, w, h, art, 1, h * 0.12);
  } else {
    const photos = [...art.plan.cues.filter((c) => c.kind === 'photo')].slice(0, 4);
    const gap = 24 * u;
    const cols = photos.length <= 1 ? 1 : 2;
    const rows = Math.ceil(Math.max(1, photos.length) / cols);
    const top = h * 0.16;
    const cellW = (w - 120 * u - gap * (cols - 1)) / cols;
    const cellH = (h * 0.78 - top - gap * (rows - 1)) / rows;
    ctx.textAlign = 'center';
    ctx.fillStyle = PAPER;
    fitText(ctx, art.name, w / 2, h * 0.1, w - 120 * u, 700, 72 * u, NUM);
    photos.forEach((c, i) => {
      const x = 60 * u + (i % cols) * (cellW + gap);
      const y = top + Math.floor(i / cols) * (cellH + gap);
      ctx.save();
      rounded(ctx, x, y, cellW, cellH, 24 * u);
      ctx.clip();
      const img = art.photos.get(c.attachment_id);
      if (img) cover(ctx, img, x, y, cellW, cellH);
      else {
        ctx.fillStyle = ASPHALT;
        ctx.fillRect(x, y, cellW, cellH);
      }
      const label = ctx.createLinearGradient(0, y + cellH * 0.6, 0, y + cellH);
      label.addColorStop(0, 'rgb(0 0 0 / 0)');
      label.addColorStop(1, 'rgb(0 0 0 / 0.65)');
      ctx.fillStyle = label;
      ctx.fillRect(x, y + cellH * 0.6, cellW, cellH * 0.4);
      ctx.restore();
      ctx.textAlign = 'left';
      ctx.fillStyle = PAPER;
      fitText(ctx, c.name, x + 24 * u, y + cellH - 28 * u, cellW - 48 * u, 700, 40 * u, UI);
    });
    if (photos.length === 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgb(241 238 231 / 0.8)';
      ctx.font = `500 ${44 * u}px ${UI}`;
      ctx.fillText('Sem fotos nesta viagem', w / 2, h * 0.45);
    }
  }
}
