import { haversineM, type LngLat } from '@shared/geo.ts';
import { ARRIVAL_RADIUS_M, type Fix } from '@/lib/geo/geofence.ts';

/**
 * O detector de paradas fora do roteiro (fase 15), puro: alimentado pelas leituras do
 * acompanhamento com o mapa aberto (`useLivePosition`), diz quando começou uma parada e quando ela
 * terminou. Nunca pergunta nada a ninguém e não sabe de banco nem de rede.
 *
 * As leituras a menos de 60 m do centro formam um grupo. O grupo vira parada quando dura:
 * - 8 min, com o centro a mais de 40 m da linha da estrada (um estacionamento, um posto, a rua do
 *   restaurante): fora da estrada, parar 8 min é parar de propósito;
 * - 20 min em qualquer lugar, inclusive em cima da linha e quando o dia não tem a rota em cache (aí
 *   não há como separar o acostamento de um estacionamento). Abaixo disso, parado na estrada é
 *   trânsito, e um semáforo nem chega perto.
 * A escala é a da D47: 3 min para chegar numa parada do roteiro, 10 min para o GPS econômico, que
 * passa a mandar uma leitura por minuto: o detector aceita leituras esparsas.
 *
 * Um buraco de mais de 3 min sem leitura (o app foi para o plano de fundo, a tela apagou) zera o
 * que ainda não era parada: ninguém sabe onde o carro esteve. Uma leitura com precisão pior que
 * 60 m não diz nada nessa escala: não entra nem sai do grupo, só mostra que o app estava aberto.
 * A saída é a primeira leitura a mais de 60 m do centro, confirmada pela leitura seguinte também
 * fora (um ponto solto do GPS não encerra a parada); com um buraco entre a última leitura dentro e
 * a primeira fora, a saída é a última leitura dentro: a hora que se sabe, nunca uma inventada.
 *
 * Não vira parada automática: o que fica no raio de chegada de uma parada do dia (aí o caminho é o
 * Chegamos!, D176) e o lugar (150 m) que já teve uma parada automática nas últimas 2 h, deste
 * aparelho, de outro do time ou desfeita aqui.
 */
export const STOP_RADIUS_M = 60;
/** a mais disto da linha da estrada, o carro está fora dela */
export const OFF_ROAD_M = 40;
/** a menos disto da linha, o carro está nela (o trânsito); entre os dois, vale a regra longa */
export const ON_ROAD_M = 25;
export const OFF_ROAD_DWELL_MS = 8 * 60_000;
export const ANY_DWELL_MS = 20 * 60_000;
/** sem leitura por mais que isto, o grupo que ainda não era parada recomeça */
export const MAX_GAP_MS = 3 * 60_000;
/** o mesmo lugar: a menos disto de outra parada automática */
export const SAME_PLACE_M = 150;
/** uma parada automática por lugar a cada 2 h */
export const SAME_PLACE_MS = 2 * 60 * 60_000;

export type Place = { lng: number; lat: number };

/** Uma parada automática que já existe (do time, deste aparelho, ou desfeita aqui), em ms. */
export type KnownAutoStop = Place & { from: number; to: number | null };

export type DetectorContext = {
  /** a distância do ponto à linha da estrada do dia, em metros; `null` sem a rota em cache */
  roadDistanceM: (point: LngLat) => number | null;
  /** as paradas do dia com lugar: no raio de chegada delas, quem marca é o Chegamos! */
  planned: readonly Place[];
  /** as paradas automáticas que já existem: um lugar só a cada 2 h */
  known: readonly KnownAutoStop[];
};

export type DetectorRule = 'off-road' | 'long';

export type DetectorEvent =
  | {
      kind: 'start';
      /** a hora medida da chegada: a primeira leitura do grupo */
      arrivedAt: number;
      center: Place;
      /** a distância do centro à linha da estrada; `null` sem rota */
      roadM: number | null;
      rule: DetectorRule;
    }
  | {
      kind: 'end';
      /** a hora medida da saída: a primeira leitura fora (ou a última dentro, se houve buraco) */
      leftAt: number;
    };

type Group = {
  first: Fix;
  last: Fix;
  n: number;
  sumLng: number;
  sumLat: number;
  /** o centro; congelado quando a parada é confirmada (é o lugar dela) */
  center: Place;
  confirmed: boolean;
  /** já se decidiu que este grupo não vira parada (parada do roteiro, lugar repetido) */
  excluded: boolean;
};

const dist = (a: Place, b: Place) => haversineM([a.lng, a.lat], [b.lng, b.lat]);

function isCoarse(fix: Fix): boolean {
  return fix.accuracy !== undefined && fix.accuracy > STOP_RADIUS_M;
}

function seed(fix: Fix): Group {
  return {
    first: fix,
    last: fix,
    n: 1,
    sumLng: fix.lng,
    sumLat: fix.lat,
    center: { lng: fix.lng, lat: fix.lat },
    confirmed: false,
    excluded: false,
  };
}

/** A regra que vale para o centro e quanto tempo ela pede. */
export function dwellRule(roadM: number | null): { rule: DetectorRule; needMs: number } {
  return roadM !== null && roadM > OFF_ROAD_M
    ? { rule: 'off-road', needMs: OFF_ROAD_DWELL_MS }
    : { rule: 'long', needMs: ANY_DWELL_MS };
}

/** Outra parada automática no mesmo lugar nas últimas 2 h (ou ainda aberta). */
export function recentAutoStopNear(
  known: readonly KnownAutoStop[],
  center: Place,
  now: number,
): boolean {
  return known.some((k) => dist(k, center) <= SAME_PLACE_M && now - (k.to ?? now) < SAME_PLACE_MS);
}

export type StopDetector = {
  push: (fix: Fix, ctx: DetectorContext) => DetectorEvent[];
};

export function createStopDetector(): StopDetector {
  let group: Group | null = null;
  /** a primeira leitura fora do grupo, à espera da seguinte para confirmar a saída */
  let outside: Fix | null = null;
  /** a última leitura de qualquer precisão: o relógio do buraco */
  let lastSeen: number | null = null;

  const evaluate = (g: Group, ctx: DetectorContext): DetectorEvent[] => {
    if (g.confirmed || g.excluded) return [];
    const roadM = ctx.roadDistanceM([g.center.lng, g.center.lat]);
    const { rule, needMs } = dwellRule(roadM);
    if (g.last.t - g.first.t < needMs) return [];
    if (
      ctx.planned.some((p) => dist(p, g.center) <= ARRIVAL_RADIUS_M) ||
      recentAutoStopNear(ctx.known, g.center, g.last.t)
    ) {
      g.excluded = true;
      return [];
    }
    g.confirmed = true;
    return [{ kind: 'start', arrivedAt: g.first.t, center: { ...g.center }, roadM: roadM, rule }];
  };

  const add = (g: Group, fix: Fix) => {
    g.last = fix;
    if (g.confirmed) return;
    g.n += 1;
    g.sumLng += fix.lng;
    g.sumLat += fix.lat;
    g.center = { lng: g.sumLng / g.n, lat: g.sumLat / g.n };
  };

  return {
    push(fix, ctx) {
      const gap = lastSeen === null ? 0 : fix.t - lastSeen;
      lastSeen = Math.max(lastSeen ?? fix.t, fix.t);
      const events: DetectorEvent[] = [];

      // o buraco: o que ainda não era parada recomeça; a parada confirmada continua aberta, e a
      // saída, se houve, aparece na próxima leitura fora
      if (group && !group.confirmed && gap > MAX_GAP_MS) {
        group = null;
        outside = null;
      }
      if (isCoarse(fix)) return events;
      if (!group) {
        group = seed(fix);
        return events;
      }

      if (dist(fix, group.center) <= STOP_RADIUS_M) {
        // um ponto solto lá fora não encerra nada
        outside = null;
        add(group, fix);
        return evaluate(group, ctx);
      }

      if (!outside) {
        outside = fix;
        return events;
      }
      // a segunda leitura fora: saiu, na hora da primeira (ou da última dentro, se houve buraco)
      if (group.confirmed) {
        const blind = outside.t - group.last.t > MAX_GAP_MS;
        events.push({ kind: 'end', leftAt: blind ? group.last.t : outside.t });
      }
      const restart = dist(fix, outside) <= STOP_RADIUS_M ? outside : fix;
      group = seed(restart);
      if (restart !== fix) add(group, fix);
      outside = null;
      return [...events, ...evaluate(group, ctx)];
    },
  };
}
