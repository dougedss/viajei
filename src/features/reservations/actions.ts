import { mutate } from '@/lib/db/mutate.ts';
import { db } from '@/lib/db/schema.ts';
import { uuidV4 } from '@/lib/ids/uuid.ts';
import { addMediaFiles, removeAllMedia, type AddResult } from '@/lib/media/actions.ts';
import { mergeMedia } from '@/lib/media/hooks.ts';
import { toColumns, type ReservationFormValues } from './schemas.ts';

/**
 * As escritas das reservas, todas pela `mutate` (offline primeiro). Os anexos vão pela fila de
 * envio: prints e PDFs sobem quando há sinal, e abrem daqui do aparelho desde o primeiro instante.
 */
export async function createReservation(
  tripId: string,
  uid: string,
  values: ReservationFormValues,
): Promise<string> {
  const id = uuidV4();
  const now = new Date().toISOString();
  await mutate.insert('reservations', {
    id,
    trip_id: tripId,
    ...toColumns(values),
    created_by: uid,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });
  return id;
}

export async function updateReservation(id: string, values: ReservationFormValues): Promise<void> {
  const current = await db.reservations.get(id);
  if (!current) throw new Error('A reserva não existe mais neste aparelho.');
  const next = toColumns(values);
  // só as colunas que mudaram: duas pessoas editando campos diferentes não se atropelam
  const changes = Object.fromEntries(
    Object.entries(next).filter(([k, v]) => current[k as keyof typeof next] !== v),
  );
  await mutate.patch('reservations', id, changes);
}

/** Tira a reserva e os anexos dela (prints e PDFs saem do Storage quando a lápide for aceita). */
export async function removeReservation(id: string, uid: string, isOwner: boolean): Promise<void> {
  const r = await db.reservations.get(id);
  if (!r) return;
  const [rows, jobs] = await Promise.all([
    db.attachments.where('reservation_id').equals(id).toArray(),
    db.uploads.where('trip_id').equals(r.trip_id).toArray(),
  ]);
  await removeAllMedia(
    mergeMedia(rows, jobs, (row) => row.reservation_id === id),
    uid,
    isOwner,
  );
  await mutate.remove('reservations', id);
}

/** Prints e PDFs: comprime o que for imagem e põe na fila. */
export function addReservationFiles(
  tripId: string,
  reservationId: string,
  files: readonly File[],
  uid: string,
): Promise<AddResult> {
  return addMediaFiles(files, 'reservation', { tripId, stopId: null, reservationId }, uid);
}
