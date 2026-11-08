import {
  BookOpen,
  CarFront,
  ListChecks,
  Map as MapIcon,
  Phone,
  Route,
  Ticket,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import { CAR_MODELS } from '@shared/constants.ts';
import { normalizeCar } from '@/features/garage/rules.ts';
import type { Trip } from '@/lib/db/schema.ts';

/**
 * Os atalhos da visão geral, como no style tile: cada um com a sua cor e um número que diz o estado
 * (paradas, reservas, listas, contatos, gastos, o mapa, o diário, o carro). Oito atalhos: duas linhas
 * de quatro.
 */
type Props = {
  trip: Trip;
  stops: number;
  reservations: number;
  /** "7 de 11": antes e mala juntas */
  lists: string;
  contacts: number;
  /** o total gasto, já formatado */
  spent: string;
  /** paradas concluídas: o diário tem o que mostrar */
  diary: number;
  /** paradas com lugar no mapa */
  located: number;
};

type Tile = { to: string; label: string; value: string; icon: LucideIcon; color: string };

export function TripShortcuts({
  trip,
  stops,
  reservations,
  lists,
  contacts,
  spent,
  diary,
  located,
}: Props) {
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
      to: `/viagens/${trip.id}/checklists`,
      label: 'Listas',
      value: lists,
      icon: ListChecks,
      color: '#1F9A66',
    },
    {
      to: `/viagens/${trip.id}/contatos`,
      label: 'Contatos',
      value: String(contacts),
      icon: Phone,
      color: '#2F8FC9',
    },
    {
      to: `/viagens/${trip.id}/gastos`,
      label: 'Gastos',
      value: spent,
      icon: Wallet,
      color: '#D9922F',
    },
    {
      to: `/viagens/${trip.id}/mapa`,
      label: 'Mapa',
      value: located === 0 ? 'sem lugar' : `${located} ${located === 1 ? 'ponto' : 'pontos'}`,
      icon: MapIcon,
      color: '#3A8089',
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
          <b className="text-[13px] font-semibold">{t.label}</b>{' '}
          <small className="-mt-0.5 font-num text-[13px] font-semibold text-ink-2">{t.value}</small>
        </Link>
      ))}
    </nav>
  );
}
