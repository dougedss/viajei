import {
  NOTIFICATION_KIND_KEYS,
  type NotificationKind,
} from '../../supabase/functions/_shared/constants.ts';
import { uuidV5 } from '../../src/lib/ids/uuid.ts';
import { must, ok, syncPush, type Lab } from './client.ts';
import { LAB_USERS } from './env.ts';

/**
 * O que o executor e os módulos do laboratório compartilham: a sessão de um usuário de laboratório,
 * o convite do lab-b para uma viagem e as preferências com só alguns tipos ligados. (O `run.ts`
 * roda o laboratório ao ser importado, então nada compartilhado mora nele.)
 */
export type Session = { client: Lab; uid: string };

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const log = (msg: string) => {
  console.log(`[lab ${new Date().toISOString().slice(11, 19)}] ${msg}`);
};

export function kindsOnly(...on: NotificationKind[]): Record<string, boolean> {
  return Object.fromEntries(NOTIFICATION_KIND_KEYS.map((k) => [k, on.includes(k)]));
}

/** B entra no time de uma viagem: convite de A, claim e accept de B. Idempotente. */
export async function ensureTeamMember(a: Session, b: Session, tripId: string): Promise<void> {
  const members = must(
    await a.client
      .from('trip_members')
      .select('id, user_id, status, deleted_at')
      .eq('trip_id', tripId),
    'membros do time',
  );
  if (
    members.some((m) => m.user_id === b.uid && m.status === 'accepted' && m.deleted_at === null)
  ) {
    return;
  }
  const email = LAB_USERS.b.email;
  const inviteId = await uuidV5(tripId, `invite:${email}`);
  const invite = members.find((m) => m.id === inviteId);
  if (!invite) {
    await syncPush(a.client, [
      {
        table: 'trip_members',
        id: inviteId,
        op: 'upsert',
        values: {
          trip_id: tripId,
          invited_email: email,
          role: 'member',
          status: 'pending',
          invited_by: a.uid,
        },
      },
    ]);
  } else if (invite.deleted_at !== null) {
    await syncPush(a.client, [
      { table: 'trip_members', id: inviteId, op: 'patch', values: { deleted_at: null } },
    ]);
  }
  ok(await b.client.rpc('claim_invites'), 'claim_invites');
  ok(await b.client.rpc('accept_invite', { p_member_id: inviteId }), 'accept_invite');
}
