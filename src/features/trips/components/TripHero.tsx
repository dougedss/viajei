import { ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { CarSide } from '@/art/cars/CarSide.tsx';
import { describeCar } from '@/art/cars/describe.ts';
import { Chip } from '@/components/ui/Chip.tsx';
import { normalizeCar } from '@/features/garage/rules.ts';
import type { Trip } from '@/lib/db/schema.ts';
import {
  formatMoney,
  formatPeriod,
  statusKind,
  statusLabel,
  tripLength,
  tripStatus,
} from '../rules.ts';

/**
 * O topo da visão geral, como no style tile: o céu em degradê (os tokens do céu trocam com o tema),
 * o período, a origem e o orçamento, e embaixo a estrada com o carro da viagem de lado, desenhado
 * do mesmo perfil do 3D. O carro leva à garagem.
 */
type Props = { trip: Trip; today: string };

export function TripHero({ trip, today }: Props) {
  const car = useMemo(() => normalizeCar(trip), [trip]);
  const days = tripLength(trip);
  const meta = [
    trip.origin ? `Sai de ${trip.origin}` : 'Origem não informada',
    trip.budget === null ? 'Sem orçamento definido' : formatMoney(trip.budget),
  ];
  return (
    <section
      className="relative overflow-hidden rounded-card bg-linear-to-b from-sky-a to-sky-b px-4 pt-4 shadow-card"
      aria-label="Resumo da viagem"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="pt-1.5 label-caps text-accent-ink">
          {formatPeriod(trip.start_date, trip.end_date)} · {days} {days === 1 ? 'dia' : 'dias'}
        </p>
        <Chip kind={statusKind(tripStatus(trip, today))}>{statusLabel(trip, today)}</Chip>
      </div>
      <p className="mt-1 text-[15px] text-ink-2">{meta.join(' · ')}</p>

      <div className="relative -mx-4 mt-2 h-[118px]">
        <svg
          viewBox="0 0 336 118"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
          aria-hidden="true"
        >
          <path
            d="M0 72 C 40 48, 86 50, 120 66 C 160 44, 214 40, 258 60 C 290 48, 316 48, 336 54 L336 118 L0 118 Z"
            fill="rgb(62 157 90 / .22)"
          />
          <path
            d="M0 84 C 60 66, 130 70, 190 80 C 250 68, 300 68, 336 74 L336 118 L0 118 Z"
            fill="rgb(62 157 90 / .32)"
          />
          <rect x="0" y="92" width="336" height="26" fill="var(--color-road)" />
          <path
            d="M0 105 H336"
            stroke="var(--color-lane)"
            strokeWidth="2"
            strokeDasharray="12 12"
          />
        </svg>
        <Link
          to={`/viagens/${trip.id}/garagem`}
          aria-label={`Garagem: ${describeCar(car)}. Trocar o carro`}
          className="group absolute right-3 bottom-[10px] flex min-h-12 items-end gap-1 rounded-button"
        >
          <span className="mb-1 inline-flex items-center rounded-full bg-card/85 px-2 py-0.5 text-[13px] font-semibold text-ink backdrop-blur-sm">
            Garagem
            <ChevronRight className="size-4" aria-hidden="true" />
          </span>
          <CarSide
            car={car}
            className="h-[84px] w-auto drop-shadow-[0_6px_6px_rgb(0_0_0/.25)] transition group-active:scale-[.98]"
          />
        </Link>
      </div>
    </section>
  );
}
