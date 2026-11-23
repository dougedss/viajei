import type { ImportData, ImportTripHeader } from '@shared/import-schema.ts';
import { todayISO } from '@/features/trips/rules.ts';
import { db } from '@/lib/db/schema.ts';
import { NEW_TRIP_KEY, type StoredReview } from './draft.ts';
import { EMPTY_HEADER } from './format.ts';
import { lastOrigin, proposeHeader } from './new-trip.ts';
import { reviewOf, type ReviewStop } from './plan.ts';
import type { Schedule } from '@/features/intake/assemble.ts';
import type { OpeningPeriod } from '@shared/places-schema.ts';
import type { DayTime } from '@shared/plan-search-protocol.ts';

/** O rótulo do lugar confirmado no mapa (a revisão mostra; a atribuição do OSM vai junto). */
export const OSM_LABEL = 'Conferido no mapa (OpenStreetMap)';
/** O lugar escolhido entre os do Google (fase 27): a revisão diz a fonte. */
export const GOOGLE_LABEL = 'Conferido no Google Maps';

/**
 * A revisão da viagem nova (fase 17), do que foi lido: o cabeçalho do texto com as propostas para o
 * que faltar (a última origem da pessoa, as datas pelos dias) e a revisão contra uma viagem vazia
 * com essas datas. O campo da lista (o formato do Viajei, lido no toque) e a leitura com a IA passam
 * por aqui.
 */
export async function newTripReview(
  data: ImportData,
  header: ImportTripHeader | null,
  options: {
    uid: string | null;
    source: 'ai' | 'user';
    importId: string | null;
    partial: boolean;
    /** a conversa: o que o mapa confirmou tem coordenada, e o que saiu vai para a tela dizer */
    checked?: { removed: string[]; unchecked: string[]; missing?: string[] };
    /**
     * a conversa da fase 24: as sugestões do caminho pela chave da revisão (nascem desligadas) e os
     * horários para refazer ao ligar uma
     */
    plan?: {
      suggestions: Record<string, NonNullable<ReviewStop['suggestion']>>;
      schedule: Schedule;
      /** o objeto do OSM de cada lugar escolhido, pela chave da revisão (fase 23) */
      osm?: Record<string, NonNullable<ReviewStop['osm']>>;
      /** as paradas pendentes, pela chave da revisão (fase 25, D278) */
      pending?: readonly string[];
      /** o `place_id` do Google de cada lugar escolhido, pela chave da revisão (fase 27) */
      google?: Record<string, string>;
      /** os períodos de funcionamento de cada lugar do Google, para a conta do passeio (fase 27) */
      hours?: Record<string, OpeningPeriod[]>;
      /** a hora do dia dita para cada lugar, pela chave da revisão (fase 26) */
      dayTimes?: Record<string, DayTime>;
      /** as chaves da revisão das paradas que são o objetivo do trecho (fase 28, D318) */
      objective?: readonly string[];
    };
  },
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
  // o lugar que a conversa propôs e o mapa confirmou diz isso, e não "marcado no arquivo"
  const verified = options.checked
    ? {
        ...review,
        days: review.days.map((d) => ({
          ...d,
          stops: d.stops.map((s) => {
            const suggestion = options.plan?.suggestions[s.key] ?? null;
            const osm = options.plan?.osm?.[s.key] ?? null;
            const google = options.plan?.google?.[s.key] ?? null;
            const hours = options.plan?.hours?.[s.key] ?? null;
            const dayTime = options.plan?.dayTimes?.[s.key] ?? null;
            // o rótulo diz de onde veio o lugar: o Google (fase 27) ou o OpenStreetMap
            const located =
              s.geo?.status === 'found' && s.geo.via === 'file'
                ? {
                    ...s,
                    geo: {
                      status: 'found' as const,
                      label: google ? GOOGLE_LABEL : OSM_LABEL,
                      via: 'osm' as const,
                    },
                    osm,
                    google_place_id: google,
                    hours,
                    day_time: dayTime,
                  }
                : s;
            // o objetivo do trecho (fase 28): o destino dito, marcado na parada
            const marked = options.plan?.objective?.includes(s.key)
              ? { ...located, objective: true }
              : located;
            // a regra de ouro: a sugestão nasce desligada, e só a pessoa a liga
            if (suggestion) return { ...marked, suggestion, include: false };
            // o pendente (fase 25): a revisão só o procura pelo nome com a cidade
            return options.plan?.pending?.includes(s.key) ? { ...marked, pending: true } : marked;
          }),
        })),
      }
    : review;
  return {
    review: verified,
    checked: options.checked ?? null,
    schedule: options.plan?.schedule ?? null,
    importId: options.importId,
    partial: options.partial,
    saved_at: new Date().toISOString(),
    newTrip,
    source: options.source,
  };
}
