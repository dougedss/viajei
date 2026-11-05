import { SCENERY_LABELS, type PlaceSample, type SceneryKind, type Segment } from './segments.ts';

/**
 * Curiosidades do caminho, derivadas dos dados: onde a câmera mergulha na fase 5 e o que a
 * legenda diz. Cada uma tem a posição na rota (metros desde o início) e a legenda pronta.
 */
export type CuriosityKind = 'highest' | 'descent' | 'ascent' | 'sea' | 'scenery';
export type Curiosity = {
  kind: CuriosityKind;
  at_m: number;
  caption: string;
  scenery?: SceneryKind;
};

/** com a costa embutida (erro de 1 a 2 km), 3 km é o que dá para afirmar */
export const SEA_NEAR_M = 3_000;
export const MIN_RELIEF_M = 100;
export const MIN_DROP_M = 150;
export const WINDOW_M = 10_000;

const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR');
const km = (m: number) => `${Math.max(1, Math.round(m / 1000))} km`;

const ENTER: Record<SceneryKind, string> = {
  city: 'cidade grande à frente',
  interior: 'de volta ao interior',
  field: 'campos abertos pela frente',
  serra: 'entrando na serra',
  beach: 'chegando ao litoral',
};

/** A maior variação de altitude numa janela de até 10 km: `sign` 1 sobe, -1 desce. */
function biggestChange(
  elevation: readonly (readonly [number, number])[],
  sign: 1 | -1,
): { at_m: number; change_m: number; span_m: number } | null {
  let best: { at_m: number; change_m: number; span_m: number } | null = null;
  for (let i = 0; i < elevation.length; i++) {
    const [d0, a0] = elevation[i] ?? [0, 0];
    for (let j = i + 1; j < elevation.length; j++) {
      const [d1, a1] = elevation[j] ?? [0, 0];
      if (d1 - d0 > WINDOW_M) break;
      const change = (a1 - a0) * sign;
      if (change > (best?.change_m ?? 0)) best = { at_m: d0, change_m: change, span_m: d1 - d0 };
    }
  }
  return best && best.change_m >= MIN_DROP_M ? best : null;
}

export function curiosities(
  elevation: readonly (readonly [number, number])[],
  samples: readonly PlaceSample[],
  segments: readonly Segment[],
): Curiosity[] {
  const out: Curiosity[] = [];
  const alts = elevation.map((e) => e[1]);
  const maxAlt = Math.max(...alts, Number.NEGATIVE_INFINITY);
  const minAlt = Math.min(...alts, Number.POSITIVE_INFINITY);
  if (alts.length > 0 && maxAlt - minAlt >= MIN_RELIEF_M) {
    const top = elevation.find((e) => e[1] === maxAlt);
    if (top)
      out.push({
        kind: 'highest',
        at_m: top[0],
        caption: `ponto mais alto do dia: ${fmt(maxAlt)} m`,
      });
  }
  const down = biggestChange(elevation, -1);
  if (down) {
    out.push({
      kind: 'descent',
      at_m: down.at_m,
      caption: `desce ${fmt(down.change_m)} m em ${km(down.span_m)}`,
    });
  }
  const up = biggestChange(elevation, 1);
  if (up) {
    out.push({
      kind: 'ascent',
      at_m: up.at_m,
      caption: `sobe ${fmt(up.change_m)} m em ${km(up.span_m)}`,
    });
  }
  const sea = samples.find((s) => s.coast_m <= SEA_NEAR_M);
  if (sea) out.push({ kind: 'sea', at_m: sea.dist_m, caption: 'o mar a menos de 3 km' });
  segments.forEach((seg, i) => {
    if (i === 0) return;
    out.push({
      kind: 'scenery',
      at_m: seg.from_m,
      scenery: seg.kind,
      caption: `${ENTER[seg.kind]} (${SCENERY_LABELS[seg.kind]})`,
    });
  });
  return out.sort((a, b) => a.at_m - b.at_m);
}
