import { isDepartureKind, STOP_KINDS, type StopKind } from '@shared/constants.ts';

/** Classes completas, para o Tailwind enxergar cada cor de tipo de parada. */
export const KIND_TEXT: Record<StopKind, string> = {
  origin: 'text-stop-origin',
  transit: 'text-stop-transit',
  nature: 'text-stop-nature',
  winery: 'text-stop-winery',
  hotel: 'text-stop-hotel',
  food: 'text-stop-food',
  event: 'text-stop-event',
  city: 'text-stop-city',
  fuel: 'text-stop-fuel',
  other: 'text-stop-other',
};
export const KIND_BG: Record<StopKind, string> = {
  origin: 'bg-stop-origin',
  transit: 'bg-stop-transit',
  nature: 'bg-stop-nature',
  winery: 'bg-stop-winery',
  hotel: 'bg-stop-hotel',
  food: 'bg-stop-food',
  event: 'bg-stop-event',
  city: 'bg-stop-city',
  fuel: 'bg-stop-fuel',
  other: 'bg-stop-other',
};

export function asStopKind(value: string): StopKind {
  return Object.hasOwn(STOP_KINDS, value) ? (value as StopKind) : 'other';
}

export function kindLabel(kind: string): string {
  return STOP_KINDS[asStopKind(kind)].label;
}

/** "saída" para a origem e o deslocamento; "3ª parada" para as demais (a posição na lista do dia). */
export function stopRole(kind: string, position: number | null): string {
  if (isDepartureKind(kind)) return 'saída';
  return position === null ? 'parada' : `${String(position)}ª parada`;
}
