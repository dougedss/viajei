import coastJson from './data/coast.json';
import type { CoastData } from './codec.ts';
import { toPolyline, type Polyline } from './polyline.ts';

/**
 * A linha de costa, decodificada uma vez. Cada conjunto de dados mora no seu módulo: quem só pergunta
 * a distância até o mar (a conquista da praia) baixa 15 KB, não os municípios (fase 12, D162).
 */
let cache: Polyline[] | null = null;

export function coastLines(): Polyline[] {
  cache ??= (coastJson as CoastData).lines.map(toPolyline);
  return cache;
}

export const COAST_SOURCE = {
  source: (coastJson as CoastData).source,
  license: (coastJson as CoastData).license,
};
