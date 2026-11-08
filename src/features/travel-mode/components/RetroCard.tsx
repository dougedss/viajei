import { Clapperboard, X } from 'lucide-react';
import { Link } from 'react-router';
import { markRetroSeen } from '../retro-seen.ts';

/**
 * "Viajei!": o convite à retrospectiva sobre a maquete, depois da viagem (fase 14). Dispensado por
 * aparelho (`retro-seen.ts`); a retrospectiva continua em Detalhes e na rota dela.
 */

export function RetroCard({ tripId, done }: { tripId: string; done: number }) {
  return (
    <section
      aria-label="Viajei! A retrospectiva está pronta"
      className="relative flex min-h-16 items-center gap-4 rounded-card bg-night px-4 py-3 text-white shadow-card"
      data-retro-card
    >
      <Link
        to={`/viagens/${tripId}/retrospectiva`}
        className="flex min-w-0 flex-1 items-center gap-4"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-sunset">
          <Clapperboard className="size-6" aria-hidden="true" />
        </span>
        <span className="grid min-w-0 gap-0.5">
          <b className="font-num mv-text-22 leading-none font-bold">Viajei!</b>
          <span className="mv-text-14 text-white/80">
            A retrospectiva está pronta · {done} {done === 1 ? 'parada' : 'paradas'}
          </span>
        </span>
      </Link>
      <button
        type="button"
        aria-label="Dispensar"
        onClick={() => markRetroSeen(tripId)}
        className="grid size-12 shrink-0 place-items-center rounded-full text-white/80"
      >
        <X className="size-5" aria-hidden="true" />
      </button>
    </section>
  );
}
