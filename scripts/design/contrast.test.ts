import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STOP_KIND_KEYS } from '../../supabase/functions/_shared/constants.ts';

/**
 * Contraste AA nos tokens (fase 12): cada texto do sistema de cores sobre cada superfície em que
 * aparece, nos dois temas, lido do próprio `app.css` (o teste quebra se um token mudar para pior).
 * Texto comum pede 4,5:1; texto grande (24 px, ou 18,66 px em negrito) e elementos gráficos, 3:1. O
 * branco sobre o pôr do sol só serve a texto grande (o prompt já dizia: 3,7:1).
 */
// o Vitest roda na raiz do projeto (no happy-dom, o import.meta.url não é um arquivo)
const css = readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`bloco ${selector} não encontrado`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    if (m[1] && m[2]) out[m[1]] = m[2].trim();
  }
  return out;
}

const light = block(':root {');
const dark = block(":root[data-theme='dark'] {");
const fixed = block('@theme {');

type Rgba = [number, number, number, number];
function parse(color: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1] ?? '', 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/.exec(color);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4] ?? 1)];
  throw new Error(`cor que o teste não lê: ${color}`);
}

/** cor translúcida sobre um fundo opaco */
function over([r, g, b, a]: Rgba, [br, bg, bb]: Rgba): Rgba {
  return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1];
}

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(fg: Rgba, bg: Rgba): number {
  const solid = fg[3] < 1 ? over(fg, bg) : fg;
  const [l1, l2] = [luminance(solid), luminance(bg)].sort((a, b) => b - a);
  return ((l1 ?? 0) + 0.05) / ((l2 ?? 0) + 0.05);
}

const WHITE: Rgba = [255, 255, 255, 1];

function tokens(theme: Record<string, string>) {
  const get = (name: string) => {
    const v = theme[name] ?? fixed[`color-${name}`];
    if (!v) throw new Error(`token --${name} não existe`);
    return parse(v);
  };
  return get;
}

describe.each([
  ['claro', light],
  ['escuro', dark],
])('tema %s', (name, theme) => {
  const t = tokens(theme);
  const surfaces = ['paper', 'card'] as const;

  it.each(['ink', 'ink-2', 'accent-ink', 'on-time-ink', 'tight-ink', 'late-ink', 'rain-ink'])(
    'o texto %s passa de 4,5:1 no papel e no cartão',
    (fg) => {
      for (const s of surfaces) expect(ratio(t(fg), t(s))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('o texto de acento sobre o fundo suave do acento passa de 4,5:1', () => {
    expect(ratio(t('accent-ink'), t('accent-soft'))).toBeGreaterThanOrEqual(4.5);
  });

  it('a linha divisória e o acento, como elementos gráficos, passam de 3:1 no cartão', () => {
    expect(ratio(t('accent'), t('card'))).toBeGreaterThanOrEqual(3);
  });

  // o ícone do tipo de parada é um elemento gráfico (3:1) no papel e no cartão; as cores são as
  // mesmas nos dois temas. Achado da fase 15, sem correção nela: Deslocamento (2,70) e Vinícola
  // (2,75) no cartão escuro; o teste as segura onde estão, e uma cor nova não entra assim
  const below: Record<string, Partial<Record<string, number>>> = {
    escuro: { transit: 2.7, winery: 2.75 },
  };
  it.each(STOP_KIND_KEYS)('o ícone do tipo %s passa de 3:1 no papel e no cartão', (kind) => {
    const color = t(`stop-${kind}`);
    expect(ratio(color, t('paper'))).toBeGreaterThanOrEqual(3);
    const known = below[name]?.[kind];
    if (known === undefined) expect(ratio(color, t('card'))).toBeGreaterThanOrEqual(3);
    else expect(ratio(color, t('card'))).toBeGreaterThanOrEqual(known - 0.01);
  });
});

describe('cores fixas', () => {
  const t = tokens({});
  it('branco sobre a noite passa de 4,5:1', () => {
    expect(ratio(WHITE, t('night'))).toBeGreaterThanOrEqual(4.5);
  });

  it('branco sobre o pôr do sol fundo (botões, chips com texto) passa de 4,5:1', () => {
    expect(ratio(WHITE, t('sunset-deep'))).toBeGreaterThanOrEqual(4.5);
  });

  it('branco sobre o pôr do sol só em texto grande: 3:1, e não 4,5:1', () => {
    const r = ratio(WHITE, t('sunset'));
    expect(r).toBeGreaterThanOrEqual(3);
    expect(r).toBeLessThan(4.5);
  });

  it('o HUD da maquete, translúcido, passa de 4,5:1 até sobre um cenário branco', () => {
    const hud = over(t('hud'), WHITE);
    expect(ratio(t('hud-ink'), hud)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t('hud-muted'), hud)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(STOP_KIND_KEYS)('o ícone branco sobre o círculo do tipo %s passa de 3:1', (kind) => {
    expect(ratio(WHITE, t(`stop-${kind}`))).toBeGreaterThanOrEqual(3);
  });

  it('a conta bate com o WCAG: preto sobre branco é 21:1', () => {
    expect(ratio([0, 0, 0, 1], WHITE)).toBeCloseTo(21, 5);
  });
});
