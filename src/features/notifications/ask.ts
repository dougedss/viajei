import { addDays, format, parseISO } from 'date-fns';

/**
 * Quando oferecer os avisos (a folha "Avisos da viagem"), puro: uma vez por aparelho e viagem, na
 * primeira abertura de uma viagem que começa em até 7 dias (ou já está acontecendo), nunca na
 * primeira abertura do app, e só enquanto a permissão ainda não foi decidida. No iPhone fora da
 * Tela de Início a folha de instalação vem antes: o push só funciona instalado.
 */
export const ASK_WINDOW_DAYS = 7;

/** Estado da assinatura push neste aparelho. */
export type PushStatus =
  'unsupported' | 'not-installed' | 'default' | 'denied' | 'granted' | 'subscribed';

export type PushAskInput = {
  /** 'yyyy-MM-dd' */
  today: string;
  trip: { start_date: string; end_date: string };
  /** a folha já foi respondida neste aparelho para esta viagem */
  asked: boolean;
  /** esta é a primeira abertura do app neste aparelho */
  firstOpen: boolean;
  status: PushStatus;
};

export function tripWithinAskWindow(
  trip: { start_date: string; end_date: string },
  today: string,
): boolean {
  const opens = format(addDays(parseISO(trip.start_date), -ASK_WINDOW_DAYS), 'yyyy-MM-dd');
  return today >= opens && today <= trip.end_date;
}

export function shouldOfferPush(input: PushAskInput): boolean {
  if (input.asked || input.firstOpen) return false;
  if (input.status !== 'default' && input.status !== 'not-installed') return false;
  return tripWithinAskWindow(input.trip, input.today);
}

/** Chaves em `sync_state` (por aparelho). */
export const askKeys = {
  firstOpen: 'app:first-open',
  asked: (tripId: string) => `push:asked:${tripId}`,
  lastSeen: 'push:last-seen',
  geoAsked: 'geo:asked',
  geoDeclinedAt: 'geo:declined-at',
} as const;
