import type { ImportData, ImportTripHeader } from '@shared/import-schema.ts';
import { todayISO } from '@/features/trips/rules.ts';
import { db } from '@/lib/db/schema.ts';
import { NEW_TRIP_KEY, type StoredReview } from './draft.ts';
import { EMPTY_HEADER } from './format.ts';
import { lastOrigin, proposeHeader } from './new-trip.ts';
import { reviewOf } from './plan.ts';

/**
 * A revisão da viagem nova (fase 17), do que foi lido: o cabeçalho do texto com as propostas para o
 * que faltar (a última origem da pessoa, as datas pelos dias) e a revisão contra uma viagem vazia
 * com essas datas. O campo da lista (o formato do Viajei, lido no toque) e a leitura com a IA passam
 * por aqui.
 */
export async function newTripReview(
  data: ImportData,
  header: ImportTripHeader | null,
  options: { uid: string | null; source: 'ai' | 'user'; importId: string | null; partial: boolean },
): Promise<StoredReview> {
  const newTrip = proposeHeader(header ?? EMPTY_HEADER, data, {
    today: todayISO(),
    lastOrigin: options.uid ? lastOrigin(await db.trips.toArray(), options.uid) : null,
    daysFromText: options.source === 'user',
  });
  const review = reviewOf(data, {
    trip: {
      id: NEW_TRIP_KEY,
      start_date: newTrip.header.start_date,
      end_date: newTrip.header.end_date,
    },
    days: [],
    stops: [],
    reservations: [],
    contacts: [],
    items: [],
  });
  return {
    review,
    importId: options.importId,
    partial: options.partial,
    saved_at: new Date().toISOString(),
    newTrip,
    source: options.source,
  };
}
