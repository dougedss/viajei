import { useMutation, useQueryClient } from '@tanstack/react-query';
import { checkDays, DaysBlockedError, syncDays } from '@/features/itinerary/actions.ts';
import { bornPrefs, bornPrefsRow } from '@/features/notifications/prefs.ts';
import { mutate, type BatchWrite } from '@/lib/db/mutate.ts';
import { db, type Trip } from '@/lib/db/schema.ts';
import { syncEngine } from '@/lib/db/sync/engine.ts';
import { uuidV5 } from '@/lib/ids/uuid.ts';
import { supabase } from '@/lib/supabase/client.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { invitesKeys } from './queries.ts';
import type { TripFormValues } from './schemas.ts';

/** O que a viagem nova leva de saída: o cabeçalho que a revisão do campo decidiu (fase 17). */
export type NewTripValues = Pick<
  Trip,
  'name' | 'start_date' | 'end_date' | 'origin' | 'budget' | 'notes'
>;

/**
 * As escritas da viagem nova, para o lote que também grava o roteiro dela (`saveNewTrip`): a viagem,
 * o dono em trip_members como projeção local (o servidor o cria por trigger e o pull confirma) e os
 * avisos com os padrões do Perfil (fase 16). Não grava nada: quem grava é o lote, inteiro ou nada.
 * Funciona sem sinal.
 */
export async function newTripWrites(
  values: NewTripValues,
  uid: string,
  id: string,
  now: string,
): Promise<BatchWrite[]> {
  const prefs = await bornPrefsRow(uid, id, now);
  return [
    {
      kind: 'insert',
      table: 'trips',
      row: {
        id,
        owner_id: uid,
        ...values,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    },
    {
      kind: 'project',
      table: 'trip_members',
      row: {
        id: await uuidV5(id, 'owner'),
        trip_id: id,
        user_id: uid,
        invited_email: null,
        role: 'owner',
        status: 'accepted',
        invited_by: uid,
        share_position: true,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    },
    ...(prefs ? [{ kind: 'insert', table: 'notification_prefs', row: prefs } as const] : []),
  ];
}

/**
 * Salva a viagem e alinha os dias às datas. Encurtar com parada em dia que sairia lança
 * `DaysBlockedError` antes de gravar qualquer coisa: a pessoa move ou exclui as paradas antes.
 */
export async function updateTrip(id: string, values: TripFormValues): Promise<void> {
  const plan = await checkDays(id, values);
  if (plan.blocked.length > 0) throw new DaysBlockedError(plan.blocked);
  await mutate.patch('trips', id, values);
  await syncDays(id, values);
}

/** O toggle "compartilhar minha posição nesta viagem": só a própria linha (o banco confere). */
export async function setSharePosition(memberId: string, value: boolean): Promise<void> {
  await mutate.patch('trip_members', memberId, { share_position: value });
}

/** Soft delete; só o dono (o banco confere). A lápide volta pelo pull e some de todos os aparelhos. */
export async function deleteTrip(id: string): Promise<void> {
  await mutate.remove('trips', id);
}

export class AlreadyInvitedError extends Error {}

/**
 * Convite por e-mail: fica pendente em trip_members com id determinístico v5(trip, 'invite:' + e-mail),
 * então dois aparelhos sem sinal convidando a mesma pessoa escrevem a mesma linha. Quem recusou pode
 * ser convidado de novo: o convite recusado (deleted_at) é reativado.
 */
export async function inviteMember(tripId: string, email: string, uid: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const id = await uuidV5(tripId, `invite:${normalized}`);
  const existing = await db.trip_members.get(id);
  if (existing?.deleted_at === null) throw new AlreadyInvitedError(normalized);
  if (existing) {
    await mutate.patch('trip_members', id, { deleted_at: null });
    return;
  }
  const now = new Date().toISOString();
  await mutate.insert('trip_members', {
    id,
    trip_id: tripId,
    user_id: null,
    invited_email: normalized,
    role: 'member',
    status: 'pending',
    invited_by: uid,
    share_position: true,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });
}

/** Remove um membro ou cancela um convite (só o dono; o banco confere). */
export async function removeMember(memberId: string): Promise<void> {
  await mutate.remove('trip_members', memberId);
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const uid = session?.user.id ?? '';
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { data, error } = await supabase.rpc('accept_invite', { p_member_id: memberId });
      if (error) throw error;
      return data;
    },
    // a participação nova chega pelo pull e a viagem é puxada; depois dele (que traria uma linha de
    // avisos de uma participação anterior), os avisos dela nascem com os padrões do Perfil (fase 16)
    onSuccess: async (tripId) => {
      await syncEngine.syncNow();
      if (uid) await bornPrefs(uid, tripId);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: invitesKeys.pending }),
  });
}

export function useDeclineInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.rpc('decline_invite', { p_member_id: memberId });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: invitesKeys.pending }),
  });
}
