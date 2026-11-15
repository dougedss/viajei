import { useLiveQuery } from 'dexie-react-hooks';
import { z } from 'zod';
import {
  isNotificationKind,
  NOTIFICATION_DEFAULTS,
  NOTIFICATION_KIND_KEYS,
  type NotificationKind,
} from '@shared/constants.ts';
import { mutate } from '@/lib/db/mutate.ts';
import { db, type NotificationPref, type Profile } from '@/lib/db/schema.ts';
import { uuidV5 } from '@/lib/ids/uuid.ts';
import { hhmm } from '@/lib/time/index.ts';

/**
 * Preferências de aviso por pessoa e viagem. Leitura ao vivo do Dexie com os padrões por cima
 * do que falta; escrita pela `mutate` (offline primeiro), com id `v5(user_id, trip_id)`: dois
 * aparelhos da mesma pessoa escrevem a mesma linha.
 *
 * Onde a linha nasce: até a fase 15, só na primeira mudança em Avisos (sem ela, o servidor usa os
 * padrões da coluna, 15 min e 7h). Desde a 16, também quando a viagem nasce no aparelho e quando a
 * pessoa aceita um convite, com a antecedência e a hora do briefing que ela escolheu no Perfil para
 * as viagens novas (`profiles.notify_*`). As viagens que já existiam sem linha continuam como eram.
 */
export type Prefs = {
  enabled: boolean;
  lead_minutes: number;
  /** 'HH:mm' */
  morning_time: string;
  kinds: Record<NotificationKind, boolean>;
};

const kindsSchema = z.record(z.string(), z.boolean());

export const DEFAULT_PREFS: Prefs = {
  enabled: NOTIFICATION_DEFAULTS.enabled,
  lead_minutes: NOTIFICATION_DEFAULTS.lead_minutes,
  morning_time: NOTIFICATION_DEFAULTS.morning_time,
  kinds: { ...NOTIFICATION_DEFAULTS.kinds },
};

/** Os padrões com a linha por cima; chaves desconhecidas em `kinds` são ignoradas. */
export function mergePrefs(
  row:
    | Pick<NotificationPref, 'enabled' | 'lead_minutes' | 'morning_time' | 'kinds'>
    | null
    | undefined,
): Prefs {
  if (!row) return { ...DEFAULT_PREFS, kinds: { ...DEFAULT_PREFS.kinds } };
  const kinds = { ...DEFAULT_PREFS.kinds };
  const parsed = kindsSchema.safeParse(row.kinds);
  if (parsed.success) {
    for (const [k, v] of Object.entries(parsed.data)) if (isNotificationKind(k)) kinds[k] = v;
  }
  return {
    enabled: row.enabled,
    lead_minutes: row.lead_minutes,
    morning_time: hhmm(row.morning_time),
    kinds,
  };
}

/** Os padrões de uma viagem nova: os do Perfil da pessoa (ou os do app, sem perfil no aparelho). */
export function newTripDefaults(
  profile: Pick<Profile, 'notify_lead_minutes' | 'notify_morning_time'> | null | undefined,
): Prefs {
  const lead: unknown = profile?.notify_lead_minutes;
  const morning: unknown = profile?.notify_morning_time;
  return {
    ...DEFAULT_PREFS,
    kinds: { ...DEFAULT_PREFS.kinds },
    lead_minutes: typeof lead === 'number' ? lead : DEFAULT_PREFS.lead_minutes,
    morning_time: typeof morning === 'string' ? hhmm(morning) : DEFAULT_PREFS.morning_time,
  };
}

export function prefsId(uid: string, tripId: string): Promise<string> {
  return uuidV5(uid, tripId);
}

export type PrefsPatch = Partial<Omit<Prefs, 'kinds'>> & { kinds?: Partial<Prefs['kinds']> };

/** A linha desta viagem (só a própria chega ao aparelho). `undefined` enquanto carrega. */
export function usePrefsRow(tripId: string): NotificationPref | null | undefined {
  return useLiveQuery(
    async () => (await db.notification_prefs.where('trip_id').equals(tripId).first()) ?? null,
    [tripId],
  );
}

export function usePrefs(tripId: string): {
  prefs: Prefs;
  row: NotificationPref | null | undefined;
} {
  const row = usePrefsRow(tripId);
  return { prefs: mergePrefs(row), row };
}

/** Grava uma mudança: patch na linha existente, ou a linha inteira na primeira vez. */
export async function savePrefs(uid: string, tripId: string, patch: PrefsPatch): Promise<void> {
  const id = await prefsId(uid, tripId);
  const current = await db.notification_prefs.get(id);
  const merged = mergePrefs(current);
  const kinds = { ...merged.kinds, ...patch.kinds };
  const values = {
    enabled: patch.enabled ?? merged.enabled,
    lead_minutes: patch.lead_minutes ?? merged.lead_minutes,
    morning_time: patch.morning_time ?? merged.morning_time,
    kinds,
  };
  if (current) {
    await mutate.patch('notification_prefs', id, values);
    return;
  }
  const now = new Date().toISOString();
  await mutate.insert('notification_prefs', {
    id,
    user_id: uid,
    trip_id: tripId,
    ...values,
    created_at: now,
    updated_at: now,
  });
}

export { NOTIFICATION_KIND_KEYS };

/**
 * A linha de uma viagem nova (criada aqui ou aceita por convite), com os padrões do Perfil. Se ela
 * já existe no aparelho (o pull a trouxe, de outro aparelho ou de uma participação anterior), nada
 * muda: o que a pessoa escolheu vale.
 */
export async function bornPrefs(uid: string, tripId: string): Promise<void> {
  const row = await bornPrefsRow(uid, tripId, new Date().toISOString());
  if (row) await mutate.insert('notification_prefs', row);
}

/**
 * A linha que `bornPrefs` grava, para quem a põe num lote (a viagem nova do campo nasce com ela, na
 * mesma transação: fase 17); null quando a linha já existe no aparelho.
 */
export async function bornPrefsRow(
  uid: string,
  tripId: string,
  now: string,
): Promise<Omit<NotificationPref, 'synced_at'> | null> {
  const id = await prefsId(uid, tripId);
  if (await db.notification_prefs.get(id)) return null;
  const values = newTripDefaults(await db.profiles.get(uid));
  return { id, user_id: uid, trip_id: tripId, ...values, created_at: now, updated_at: now };
}
