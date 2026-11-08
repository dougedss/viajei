import { useLiveQuery } from 'dexie-react-hooks';
import { todayISO } from '@/features/trips/rules.ts';
import { db, type Trip } from '@/lib/db/schema.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { askKeys, shouldOfferPush, type PushStatus } from './ask.ts';
import { isFirstOpenSession } from './first-open.ts';
import { usePushStatus } from './subscription.ts';

export type PushOffer = {
  userId: string;
  status: PushStatus;
  /** a pessoa respondeu (ou dispensou): não se oferece de novo neste aparelho para esta viagem */
  close: () => void;
};

/**
 * Se é hora de oferecer os avisos desta viagem (D48): uma vez por aparelho e viagem, na primeira
 * abertura de uma viagem que começa em até 7 dias, nunca na primeira abertura do app. Quem oferece
 * decide a forma: a folha "Avisos da viagem" ou, no iPhone fora da Tela de Início, o cartão de
 * instalação (`status === 'not-installed'`).
 */
export function usePushOffer(
  trip: Pick<Trip, 'id' | 'name' | 'start_date' | 'end_date'>,
): PushOffer | null {
  const { session } = useSession();
  const push = usePushStatus();
  const asked = useLiveQuery(
    async () => (await db.sync_state.get(askKeys.asked(trip.id))) !== undefined,
    [trip.id],
  );

  if (asked === undefined || !push.checked || !session) return null;
  const offer = shouldOfferPush({
    today: todayISO(),
    trip,
    asked,
    firstOpen: isFirstOpenSession(),
    status: push.status,
  });
  if (!offer) return null;
  return {
    userId: session.user.id,
    status: push.status,
    close: () =>
      void db.sync_state.put({ key: askKeys.asked(trip.id), value: new Date().toISOString() }),
  };
}
