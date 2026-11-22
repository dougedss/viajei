/**
 * O tempo de carro por estimativa (fase 24, D228), dos dois lados: o app (os cartões das opções, o
 * raio de um alcance em horas) e as funções (a ferramenta `tempo_de_carro` do planejador, fase 27).
 * A linha reta vezes um fator de estrada, por faixas de velocidade média, arredondado a 5 min. Tudo
 * é estimativa e a tela diz "cerca de"; a rota real (a `route-day`) só para o que foi escolhido.
 */

/** A estrada não é linha reta: um fator que cobre as curvas das estradas do Sul. */
export const ROAD_FACTOR = 1.3;
/** As faixas de velocidade média, pela distância de estrada: a cidade, a estrada vicinal, a rodovia. */
const BANDS: readonly { upToKm: number; kmh: number }[] = [
  { upToKm: 15, kmh: 35 },
  { upToKm: 60, kmh: 55 },
  { upToKm: Number.POSITIVE_INFINITY, kmh: 75 },
];

export const round5 = (min: number): number => Math.max(5, Math.round(min / 5) * 5);

/** Minutos de carro, por estimativa, para uma distância em linha reta (arredondados a 5). */
export function driveMinutes(straightKm: number): number {
  let road = straightKm * ROAD_FACTOR;
  let from = 0;
  let minutes = 0;
  for (const band of BANDS) {
    const stretch = Math.min(road, band.upToKm - from);
    if (stretch <= 0) break;
    minutes += (stretch / band.kmh) * 60;
    road -= stretch;
    from = band.upToKm;
  }
  return round5(minutes);
}

/** O raio (em linha reta) que se faz em tantas horas de carro, pela mesma estimativa. */
export function radiusForHours(hours: number): number {
  let lo = 1;
  let hi = 800;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (driveMinutes(mid) <= hours * 60) lo = mid;
    else hi = mid;
  }
  return Math.round(lo);
}

/** "cerca de 40 min", "cerca de 1 h 20": a estimativa sempre dita como estimativa. */
export function aboutMinutes(minutes: number): string {
  if (minutes < 60) return `cerca de ${String(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `cerca de ${String(h)} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`;
}
