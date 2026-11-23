import { forgedPoint } from '../../src/features/lab/forged-stop.ts';
import { uuidV5 } from '../../src/lib/ids/uuid.ts';
import { syncPush, type Op } from './client.ts';
import type { Session } from './session.ts';

/**
 * A viagem de ida e volta do `app_maquete` (fase 28): a maquete por trechos na produção. Uma viagem
 * fixa do lab-a (`v5(lab-a, 'lab:trechos')`), numa data longe à frente (a tela mostra o Dia 1 antes da
 * viagem: sem GPS, o carro na saída), com a saída, o mirante a 20 km e a chegada na mesma coordenada
 * da saída, pela estrada forjada do e2e (`src/features/lab/forged-stop.ts`: um lugar inventado, nenhuma
 * coordenada de viagem de verdade). **Sem objetivo marcado:** a regra de reserva divide o dia no ponto
 * mais longe de casa. A `route-day` é respondida na página, com a estrada forjada (nenhuma chamada nova
 * de verdade). O upsert com ids determinísticos refaz a mesma viagem a cada execução, sem acumular nada.
 */
export const TRECHOS = {
  name: 'Laboratório · ida e volta',
  date: '2030-01-15',
  casa: 'Saída da casa do laboratório',
  mirante: 'Mirante da ida e volta',
  chegada: 'Chegada na casa do laboratório',
  miranteX: 20_000,
} as const;

export async function prepareTrechos(a: Session): Promise<{ tripId: string }> {
  const trip = await uuidV5(a.uid, 'lab:trechos');
  const day = await uuidV5(trip, TRECHOS.date);
  const casa = forgedPoint(0);
  const mirante = forgedPoint(TRECHOS.miranteX);
  const stop = async (key: string, values: Record<string, unknown>): Promise<Op> => ({
    table: 'stops',
    id: await uuidV5(trip, `stop:${key}`),
    op: 'upsert',
    values: {
      trip_id: trip,
      trip_day_id: day,
      travel_minutes_to_next: null,
      skipped: false,
      deleted_at: null,
      done_at: null,
      done_by: null,
      departed_at: null,
      objective: false,
      ...values,
    },
  });
  await syncPush(a.client, [
    {
      table: 'trips',
      id: trip,
      op: 'upsert',
      values: {
        owner_id: a.uid,
        name: TRECHOS.name,
        start_date: TRECHOS.date,
        end_date: TRECHOS.date,
        budget: null,
        deleted_at: null,
      },
    },
  ]);
  await syncPush(a.client, [
    {
      table: 'trip_days',
      id: day,
      op: 'upsert',
      values: { trip_id: trip, date: TRECHOS.date, title: 'Ida e volta', deleted_at: null },
    },
    await stop('casa', {
      position: 'a0',
      kind: 'origin',
      name: TRECHOS.casa,
      time: '08:00',
      lat: casa.latitude,
      lng: casa.longitude,
    }),
    await stop('mirante', {
      position: 'a1',
      kind: 'nature',
      name: TRECHOS.mirante,
      time: '10:00',
      lat: mirante.latitude,
      lng: mirante.longitude,
    }),
    await stop('chegada', {
      position: 'a2',
      kind: 'origin',
      name: TRECHOS.chegada,
      time: '13:00',
      lat: casa.latitude,
      lng: casa.longitude,
    }),
  ]);
  return { tripId: trip };
}
