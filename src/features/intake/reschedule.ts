import { missingPairs, type DriveTable } from '@shared/drive-schema.ts';
import type { LngLat } from '@shared/geo.ts';
import type { Review } from '@/features/import/plan.ts';
import { scheduleDay, type Schedule } from './assemble.ts';

/**
 * Os horários de novo, no aparelho, quando a pessoa liga ou desliga **qualquer parada** da revisão da
 * conversa (fase 24; desde a correção de 22/11/2026 também a que não é sugestão: desmarcar "Canoinhas"
 * deixava o sushi às 19:15 com um trecho de 25 min). O dia que mudou é refeito da hora de sair (ou da
 * hora que a pessoa disse para estar num lugar, D311), com o tempo em cada lugar e o tempo de carro
 * **medido** de cada trecho (D310); o trecho que não foi medido deixa os horários seguintes sem hora,
 * nunca com uma estimativa (a tela o mede em seguida: `unmeasuredLegs`). A parada desligada fica sem
 * horário. Puro.
 */
export function reschedule(review: Review, schedule: Schedule, date: string): Review {
  return {
    ...review,
    days: review.days.map((day) => {
      if (day.date !== date) return day;
      const on = day.stops.filter((s) => s.include);
      const start = schedule.starts[day.date] ?? on[0]?.time ?? '08:00';
      const times = scheduleDay(
        on.map((s) => ({ key: s.key, kind: s.kind, lat: s.lat, lng: s.lng })),
        start,
        schedule,
        schedule.startRule?.[day.date] ?? 'default',
      );
      return {
        ...day,
        stops: day.stops.map((s) => {
          const t = times.get(s.key);
          if (t) return { ...s, time: t.time, travel_minutes_to_next: t.travel };
          return { ...s, time: null, travel_minutes_to_next: null };
        }),
      };
    }),
  };
}

/**
 * Os trechos da revisão que ainda não têm tempo de carro medido (D310): em cada dia que entra, entre
 * dois pontos com lugar seguidos entre as paradas ligadas (a parada sem lugar não tem estrada). Aparecem
 * quando a pessoa liga uma sugestão, ou desmarca uma escolha (o anterior passa a ir direto ao seguinte).
 * A tela os mede no Google e refaz os horários desses dias. Numa revisão guardada antes da D310 (só os
 * trechos pelas chaves), a tabela começa vazia; o par que o Google já disse não ter estrada não volta.
 */
export function unmeasuredLegs(
  review: Review,
  schedule: Schedule | null | undefined,
): { date: string; pair: [LngLat, LngLat] }[] {
  if (!schedule) return [];
  const table: DriveTable = schedule.drive ?? {};
  const out: { date: string; pair: [LngLat, LngLat] }[] = [];
  for (const day of review.days) {
    if (!day.include) continue;
    const placed = day.stops.filter((s) => s.include && s.lat !== null && s.lng !== null);
    placed.forEach((stop, i) => {
      const next = placed[i + 1];
      if (!next || stop.lat === null || stop.lng === null) return;
      if (next.lat === null || next.lng === null) return;
      // o trecho guardado pelas chaves (uma revisão de antes) já tem tempo
      if (schedule.legs[`${stop.key}>${next.key}`] !== undefined) return;
      const pair: [LngLat, LngLat] = [
        [stop.lng, stop.lat],
        [next.lng, next.lat],
      ];
      if (missingPairs(table, [pair]).length > 0) out.push({ date: day.date, pair });
    });
  }
  return out;
}
