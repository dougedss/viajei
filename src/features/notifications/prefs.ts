import { useLiveQuery } from 'dexie-react-hooks';
import { z } from 'zod';
import {
  isNotificationKind,
  NOTIFICATION_DEFAULTS,
  NOTIFICATION_KIND_KEYS,
  type NotificationKind,
} from '@shared/constants.ts';
import { mutate } from '@/lib/db/mutate.ts';
import { db, type NotificationPref } from '@/lib/db/schema.ts';
import { uuidV5 } from '@/lib/ids/uuid.ts';
import { hhmm } from '@/lib/time/index.ts';

/**
 * Preferências de aviso por pessoa e viagem. Leitura ao vivo do Dexie com os padrões por cima
 * do que falta; escrita pela `mutate` (offline primeiro), com id `v5(user_id, trip_id)`: a linha
 * nasce na primeira mudança, e dois aparelhos da mesma pessoa escrevem a mesma linha.
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
