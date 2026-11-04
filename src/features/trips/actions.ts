import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mutate } from '@/lib/db/mutate.ts';
import { db } from '@/lib/db/schema.ts';
import { syncEngine } from '@/lib/db/sync/engine.ts';
import { uuidV4, uuidV5 } from '@/lib/ids/uuid.ts';
import { supabase } from '@/lib/supabase/client.ts';
import { invitesKeys } from './queries.ts';
import type { TripFormValues } from './schemas.ts';

/**
 * Cria a viagem no Dexie e enfileira; o dono entra em trip_members como projeção local (o servidor
 * o cria por trigger e o pull confirma). Funciona sem sinal e devolve o id na hora.
 */
export async function createTrip(values: TripFormValues, uid: string): Promise<string> {
  const id = uuidV4();
  const now = new Date().toISOString();
  await mutate.insert('trips', {
    id,
    owner_id: uid,
    name: values.name,
    start_date: values.start_date,
    end_date: values.end_date,
    origin: values.origin,
    budget: values.budget,
    notes: values.notes,
    car_model: 'hatch',
    car_color: 'sunset',
    car_accessories: [],
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });
  await mutate.project('trip_members', {
    id: await uuidV5(id, 'owner'),
    trip_id: id,
    user_id: uid,
    invited_email: null,
    role: 'owner',
    status: 'accepted',
    invited_by: uid,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });
  return id;
}

export async function updateTrip(id: string, values: TripFormValues): Promise<void> {
  await mutate.patch('trips', id, values);
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
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { data, error } = await supabase.rpc('accept_invite', { p_member_id: memberId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => syncEngine.schedule(0), // a participação nova chega pelo pull e a viagem é puxada
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
