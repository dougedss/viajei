import { uuidV5 } from '../../src/lib/ids/uuid.ts';
import { must, ok, syncPush } from './client.ts';
import type { Session } from './session.ts';

/**
 * O expurgo de uma viagem do laboratório (fase 17): os cenários que criam a viagem pelo campo têm um
 * id do aparelho, não um id fixo. No fim, a exclusão de sempre (o dono, pela outbox do servidor) e o
 * `lab_drop_trip` da 0015, que a apaga já (a cascata leva o resto), para o lab-a não acumular viagens
 * excluídas que o aparelho novo de cada cenário puxaria (D171).
 */
export async function dropLabTrip(a: Session, tripId: string): Promise<void> {
  const rows = must(
    await a.client.from('trips').select('id, deleted_at').eq('id', tripId),
    'a viagem do laboratório',
  );
  const row = rows[0];
  if (!row) return;
  if (row.deleted_at === null) {
    await syncPush(a.client, [
      { table: 'trips', id: tripId, op: 'patch', values: { deleted_at: new Date().toISOString() } },
    ]);
  }
  ok(await a.client.rpc('lab_drop_trip', { p_trip_id: tripId }), 'lab_drop_trip');
}

/**
 * A viagem fixa do `app_importar` de antes da fase 17 (`v5(lab-a, 'lab:importar')`), que o cenário
 * esvaziava a cada dia: agora ele cria a viagem pelo campo, e a fixa sai uma vez, pelo mesmo caminho.
 */
export async function retireFixedImportTrip(a: Session): Promise<void> {
  await dropLabTrip(a, await uuidV5(a.uid, 'lab:importar'));
}
