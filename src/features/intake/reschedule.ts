import type { Review } from '@/features/import/plan.ts';
import { scheduleDay, type Schedule } from './assemble.ts';

/**
 * Os horários de novo, no aparelho, quando a pessoa liga ou desliga uma sugestão (fase 24): o dia que
 * mudou é refeito da hora de sair, com a permanência do tipo e o tempo de carro (o da rota real onde
 * houve; a estimativa nos trechos novos). A sugestão desligada fica sem horário. Puro.
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
      );
      return {
        ...day,
        stops: day.stops.map((s) => {
          const t = times.get(s.key);
          if (t) return { ...s, time: t.time, travel_minutes_to_next: t.travel };
          return s.suggestion ? { ...s, time: null, travel_minutes_to_next: null } : s;
        }),
      };
    }),
  };
}
