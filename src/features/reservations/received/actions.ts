import type { AttachmentMime } from '@shared/constants.ts';
import { mutate } from '@/lib/db/mutate.ts';
import { db, type ReceivedReservation } from '@/lib/db/schema.ts';
import { uuidV4 } from '@/lib/ids/uuid.ts';
import { kickMedia, mediaQueue } from '@/lib/media/index.ts';
import { supabaseStorage } from '@/lib/media/storage.ts';
import type { Prepared } from '@/lib/media/types.ts';
import { supabase } from '@/lib/supabase/client.ts';
import { filesOf, type ReceivedFile } from './queries.ts';

/**
 * "Pôr nesta viagem" e "Dispensar" (fase 18), pela `mutate` (offline primeiro). Colocar cria a reserva
 * pelos caminhos de hoje e leva os anexos da caixa de entrada para a pasta da viagem pela fila: cada
 * arquivo é baixado da caixa (só a dona lê) e entra na fila como um envio novo, com o id definitivo e o
 * Blob já no aparelho; a linha de `attachments` nasce quando ele sobe (D78). Baixar precisa de rede:
 * uma recebida com anexos só se coloca com internet; sem anexos, funciona sem sinal como tudo.
 */
const storage = supabaseStorage(supabase);

const EXT: Record<AttachmentMime, Prepared['ext']> = {
  'image/jpeg': 'jpg',
  'image/png': 'jpg',
  'image/webp': 'jpg',
  'application/pdf': 'pdf',
};

export class PlaceError extends Error {
  readonly reason: 'offline' | 'missing';
  constructor(reason: 'offline' | 'missing') {
    super(
      reason === 'offline'
        ? 'Precisa de internet para trazer os anexos da reserva.'
        : 'Um anexo da reserva não está mais na caixa de entrada.',
    );
    this.name = 'PlaceError';
    this.reason = reason;
  }
}

function isMime(mime: string): mime is AttachmentMime {
  return mime in EXT;
}

/** O arquivo da caixa de entrada como a fila o quer; null quando não deu para baixar. */
async function fetchInboxFile(
  file: ReceivedFile,
): Promise<{ prepared: Prepared; kind: 'ok' } | { kind: 'offline' | 'missing' }> {
  if (!isMime(file.mime)) return { kind: 'missing' };
  const out = await storage.download(file.storage_path);
  if (out.kind === 'network') return { kind: 'offline' };
  if (out.kind !== 'ok') return { kind: 'missing' };
  const blob = out.blob.type === file.mime ? out.blob : new Blob([out.blob], { type: file.mime });
  return {
    kind: 'ok',
    prepared: {
      blob,
      mime: file.mime,
      ext: EXT[file.mime],
      kind: 'document',
      width: file.width,
      height: file.height,
      placeholder: null,
      filename: file.filename,
      size: blob.size,
    },
  };
}

/**
 * Cria a reserva na viagem com o que a leitura tirou e marca a recebida como colocada. Os anexos vão
 * primeiro para o aparelho (baixados da caixa) e depois para a fila: se um não dá para baixar, nada
 * muda (a pessoa tenta de novo com rede).
 */
export async function placeReceived(
  received: ReceivedReservation,
  tripId: string,
  uid: string,
): Promise<string> {
  const files = filesOf(received);
  const fetched: Prepared[] = [];
  for (const f of files) {
    const got = await fetchInboxFile(f);
    if (got.kind !== 'ok') throw new PlaceError(got.kind);
    fetched.push(got.prepared);
  }
  const id = uuidV4();
  const now = new Date().toISOString();
  await mutate.insert('reservations', {
    id,
    trip_id: tripId,
    stop_id: null,
    trip_day_id: null,
    type: received.type,
    name: received.name,
    start_at: received.start_at,
    end_at: received.end_at,
    confirmation_code: received.confirmation_code,
    amount: received.amount,
    cancel_policy: received.cancel_policy,
    cancel_until: received.cancel_until,
    phone: received.phone,
    address: received.address,
    booked_via: received.booked_via,
    notes: received.notes,
    created_by: uid,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });
  for (const prepared of fetched) {
    await mediaQueue.enqueueUpload(prepared, { tripId, stopId: null, reservationId: id }, uid);
  }
  if (fetched.length > 0) kickMedia();
  await mutate.patch('received_reservations', received.id, {
    status: 'placed',
    placed_trip_id: tripId,
    placed_reservation_id: id,
  });
  // a cópia já está na fila: os objetos da caixa podem sair (só a dona apaga, e só sem linha viva)
  for (const f of files) void storage.remove(f.storage_path);
  return id;
}

/** "Dispensar": a recebida sai da lista; o que ficou na caixa de entrada sai pelo expurgo (D79). */
export async function dismissReceived(received: Pick<ReceivedReservation, 'id'>): Promise<void> {
  await mutate.patch('received_reservations', received.id, { status: 'dismissed' });
}

/** Quantas recebidas esperam destino (o selo da lista de viagens). */
export async function countReceived(): Promise<number> {
  return db.received_reservations.where('status').equals('received').count();
}
