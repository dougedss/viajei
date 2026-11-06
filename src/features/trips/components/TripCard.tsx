import { CloudOff, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import { Avatar } from '@/components/ui/Avatar.tsx';
import { CarSide } from '@/art/cars/CarSide.tsx';
import { Chip } from '@/components/ui/Chip.tsx';
import { normalizeCar } from '@/features/garage/rules.ts';
import { asPersonColor } from '@/features/profile/queries.ts';
import type { TripListItem } from '../queries.ts';
import { formatPeriod, statusKind, statusLabel, tripStatus } from '../rules.ts';

type Props = { item: TripListItem; today: string };

const MAX_AVATARS = 4;

/**
 * Um card por viagem: estado, nome, período, o carro da garagem de lado, origem, o time e se há
 * alterações por enviar.
 */
export function TripCard({ item: { trip, members, pendingOps }, today }: Props) {
  const status = tripStatus(trip, today);
  const shown = members.slice(0, MAX_AVATARS);
  const extra = members.length - shown.length;
  return (
    <Link
      to={`/viagens/${trip.id}`}
      aria-label={trip.name}
      className="grid gap-3 rounded-card bg-card p-4 shadow-[inset_0_0_0_1px_var(--color-line)] transition active:scale-[.99]"
    >
      <div className="flex items-center justify-between gap-2">
        <Chip kind={statusKind(status)}>{statusLabel(trip, today)}</Chip>
        {pendingOps > 0 ? (
          <span
            className="grid size-8 place-items-center rounded-full bg-tight/20 text-tight-ink"
            role="img"
            aria-label="Alterações ainda não enviadas"
          >
            <CloudOff className="size-4" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="grid min-w-0 gap-0.5">
          <p className="font-num text-[24px] leading-tight font-semibold">{trip.name}</p>
          <p className="text-[15px] text-ink-2">{formatPeriod(trip.start_date, trip.end_date)}</p>
        </div>
        <CarSide car={normalizeCar(trip)} className="-mb-1 h-[46px] w-auto shrink-0" />
      </div>
      <div className="flex items-center justify-between gap-3">
        {trip.origin ? (
          <p className="flex min-w-0 items-center gap-1.5 text-[14px] text-ink-2">
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">de {trip.origin}</span>
          </p>
        ) : (
          <span />
        )}
        <div className="flex shrink-0 -space-x-2" aria-label={`${members.length} no time`}>
          {shown.map(({ member, profile }) => (
            <Avatar
              key={member.id}
              name={profile?.name ?? '?'}
              color={asPersonColor(profile?.color ?? 'sunset')}
              size="sm"
              className="ring-2 ring-card"
            />
          ))}
          {extra > 0 ? (
            <span className="grid size-8 place-items-center rounded-full bg-accent-soft font-num text-[14px] font-semibold text-accent-ink ring-2 ring-card">
              +{extra}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
