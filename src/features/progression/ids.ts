import type { AchievementKey, XpKind } from '@shared/constants.ts';
import type { Achievement, XpEvent } from '@/lib/db/schema.ts';
import { uuidV5 } from '@/lib/ids/uuid.ts';
import type { Progress } from './rules.ts';

/**
 * Os ids determinísticos, os mesmos que o banco confere por `check`: XP `v5(user_id, kind:ref_id)` e
 * conquista `v5(user_id, 'achievement:' || key)`. Duas abas, dois aparelhos ou o mesmo fato derivado
 * de novo caem na mesma linha, e o `sync_push` devolve `ignored`.
 */
export function xpId(uid: string, kind: XpKind, refId: string): Promise<string> {
  return uuidV5(uid, `${kind}:${refId}`);
}

export function achievementId(uid: string, key: AchievementKey): Promise<string> {
  return uuidV5(uid, `achievement:${key}`);
}

export type XpRow = Omit<XpEvent, 'synced_at'>;
export type AchievementRow = Omit<Achievement, 'synced_at'>;

/** As linhas de tudo a que a pessoa tem direito, como vão para a `mutate.insert`. */
export async function progressRows(
  uid: string,
  progress: Progress,
  now: string,
): Promise<{ xp: XpRow[]; achievements: AchievementRow[] }> {
  const xp = await Promise.all(
    progress.xp.map(async (g): Promise<XpRow> => ({
      id: await xpId(uid, g.kind, g.ref_id),
      user_id: uid,
      trip_id: g.trip_id,
      kind: g.kind,
      ref_id: g.ref_id,
      points: g.points,
      created_at: now,
    })),
  );
  const achievements = await Promise.all(
    progress.achievements.map(async (a): Promise<AchievementRow> => ({
      id: await achievementId(uid, a.key),
      user_id: uid,
      trip_id: a.trip_id,
      key: a.key,
      unlocked_at: a.unlocked_at,
      created_at: now,
    })),
  );
  return { xp, achievements };
}

/** Só o que ainda não está gravado no aparelho. */
export function missingRows<T extends { id: string }>(
  rows: readonly T[],
  existing: ReadonlySet<string>,
): T[] {
  return rows.filter((r) => !existing.has(r.id));
}
