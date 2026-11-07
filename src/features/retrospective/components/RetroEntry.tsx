import { Clapperboard } from 'lucide-react';
import { Link } from 'react-router';
import type { Stop, Trip } from '@/lib/db/schema.ts';
import { retroState } from '../rules.ts';

/**
 * A entrada da retrospectiva na visão geral: do dia seguinte ao fim em diante, se a viagem
 * aconteceu (pelo menos uma parada concluída). Antes disso, nada aqui; a rota diz quando fica pronta.
 */
export function RetroEntry({
  trip,
  stops,
  today,
}: {
  trip: Trip;
  stops: readonly Stop[];
  today: string;
}) {
  if (retroState(trip, stops, today).status !== 'ready') return null;
  const done = stops.filter((s) => s.deleted_at === null && s.done_at).length;
  return (
    <Link
      to={`/viagens/${trip.id}/retrospectiva`}
      className="flex min-h-16 items-center gap-4 rounded-card bg-night px-4 py-3 text-white shadow-[var(--shadow-card)]"
      data-retro-entry
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-sunset">
        <Clapperboard className="size-6" aria-hidden="true" />
      </span>
      <span className="grid gap-0.5">
        <b className="font-num text-[24px] leading-none font-bold">Viajei!</b>
        <span className="text-[15px] text-white/80">
          A retrospectiva está pronta · {done} {done === 1 ? 'parada' : 'paradas'}
        </span>
      </span>
    </Link>
  );
}
