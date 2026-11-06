import { BookOpen, CarFront, Route, Ticket, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { CAR_MODELS } from '@shared/constants.ts';
import { normalizeCar } from '@/features/garage/rules.ts';
import type { Trip } from '@/lib/db/schema.ts';

/**
 * Os atalhos da visão geral, como no style tile: cada um com a sua cor e um número que diz o estado
 * (paradas, reservas, o diário, o carro). Listas, contatos, gastos e mapa entram nas fases deles.
 */
type Props = {
  trip: Trip;
  stops: number;
  reservations: number;
  /** paradas concluídas: o diário tem o que mostrar */
  diary: number;
};

type Tile = { to: string; label: string; value: string; icon: LucideIcon; color: string };

export function TripShortcuts({ trip, stops, reservations, diary }: Props) {
  const car = normalizeCar(trip);
  const tiles: Tile[] = [
    {
      to: `/viagens/${trip.id}/roteiro`,
      label: 'Roteiro',
      value: stops === 0 ? 'vazio' : `${stops} ${stops === 1 ? 'parada' : 'paradas'}`,
      icon: Route,
      color: '#E8653A',
    },
    {
      to: `/viagens/${trip.id}/reservas`,
      label: 'Reservas',
      value: String(reservations),
      icon: Ticket,
      color: '#6A62C9',
    },
    {
      to: `/viagens/${trip.id}/diario`,
      label: 'Diário',
      value: diary === 0 ? 'vazio' : `${diary} ${diary === 1 ? 'parada' : 'paradas'}`,
      icon: BookOpen,
      color: '#D6567C',
    },
    {
      to: `/viagens/${trip.id}/garagem`,
      label: 'Garagem',
      value: CAR_MODELS[car.model].label.toLowerCase(),
      icon: CarFront,
      color: '#5B6474',
    },
  ];
  return (
    <nav aria-label="Atalhos da viagem" className="grid grid-cols-4 gap-2">
      {tiles.map((t) => (
        <Link
          key={t.label}
          to={t.to}
          aria-label={`${t.label}: ${t.value}`}
          className="grid min-h-[88px] content-center justify-items-center gap-1 rounded-[16px] bg-card px-1 text-center shadow-[inset_0_0_0_1px_var(--color-line)]"
        >
          <span
            className="grid size-9 place-items-center rounded-[12px]"
            style={{
              background: `color-mix(in oklab, ${t.color} 16%, transparent)`,
              color: t.color,
            }}
            aria-hidden="true"
          >
            <t.icon className="size-5" />
          </span>
          <b className="text-[13px] font-semibold">{t.label}</b>
          <small className="-mt-0.5 font-num text-[13px] font-semibold text-ink-2">{t.value}</small>
        </Link>
      ))}
    </nav>
  );
}
