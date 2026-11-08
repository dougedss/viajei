import {
  BedDouble,
  Building2,
  Fuel,
  Grape,
  House,
  MapPin,
  Route,
  Star,
  Trees,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import type { StopKind } from '@shared/constants.ts';
import { cx } from '@/lib/cx.ts';
import { asStopKind, KIND_BG, KIND_TEXT } from '../stop-kinds.ts';

const ICONS: Record<StopKind, LucideIcon> = {
  origin: House,
  transit: Route,
  nature: Trees,
  winery: Grape,
  hotel: BedDouble,
  food: UtensilsCrossed,
  event: Star,
  city: Building2,
  fuel: Fuel,
  other: MapPin,
};

type Props = { kind: string; className?: string; filled?: boolean };

/** Ícone e cor do tipo da parada. `filled`: círculo cheio com o ícone branco (nós da trilha). */
export function StopKindIcon({ kind, className, filled = false }: Props) {
  const k = asStopKind(kind);
  const Icon = ICONS[k];
  if (filled) {
    return (
      <span
        className={cx('grid place-items-center rounded-full text-white', KIND_BG[k], className)}
        aria-hidden="true"
      >
        <Icon className="size-[55%]" />
      </span>
    );
  }
  return <Icon className={cx(KIND_TEXT[k], className)} aria-hidden="true" />;
}
