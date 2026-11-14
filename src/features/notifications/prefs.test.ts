import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/schema.ts';
import { makeProfile, TRIP_ID, UID } from '@/test/factories.ts';
import {
  bornPrefs,
  DEFAULT_PREFS,
  mergePrefs,
  newTripDefaults,
  prefsId,
  savePrefs,
} from './prefs.ts';

describe('preferências de aviso', () => {
  beforeEach(async () => {
    await db.notification_prefs.clear();
    await db.outbox.clear();
    await db.profiles.clear();
  });

  it('padrões: tudo ligado menos o time, 15 min, 07:00', () => {
    const p = mergePrefs(null);
    expect(p).toEqual(DEFAULT_PREFS);
    expect(p.kinds.team_arrived).toBe(false);
    expect(p.kinds.departure_soon).toBe(true);
    expect(p.lead_minutes).toBe(15);
    expect(p.morning_time).toBe('07:00');
  });

  it('a linha vence os padrões; chaves estranhas em kinds são ignoradas; time vem como HH:mm', () => {
    const p = mergePrefs({
      enabled: false,
      lead_minutes: 30,
      morning_time: '06:30:00',
      kinds: { team_arrived: true, departure_soon: false, bogus: true },
    });
    expect(p.enabled).toBe(false);
    expect(p.lead_minutes).toBe(30);
    expect(p.morning_time).toBe('06:30');
    expect(p.kinds.team_arrived).toBe(true);
    expect(p.kinds.departure_soon).toBe(false);
    expect(p.kinds.departure_now).toBe(true);
    expect(p.kinds).not.toHaveProperty('bogus');
  });

  it('a primeira mudança cria a linha com id v5(user_id, trip_id); a segunda é um patch', async () => {
    await savePrefs(UID, TRIP_ID, { lead_minutes: 30 });
    const id = await prefsId(UID, TRIP_ID);
    const row = await db.notification_prefs.get(id);
    expect(row).toMatchObject({ user_id: UID, trip_id: TRIP_ID, lead_minutes: 30, enabled: true });
    expect((await db.outbox.toArray()).map((o) => [o.table, o.op, o.trip_id])).toEqual([
      ['notification_prefs', 'upsert', null],
    ]);

    await savePrefs(UID, TRIP_ID, { kinds: { team_arrived: true } });
    const ops = await db.outbox.toArray();
    expect(ops).toHaveLength(2);
    expect(ops[1]).toMatchObject({ op: 'patch', table: 'notification_prefs' });
    expect(mergePrefs(await db.notification_prefs.get(id)).kinds).toMatchObject({
      team_arrived: true,
      departure_soon: true,
    });
  });

  it('a viagem nova nasce com a antecedência e o briefing do Perfil (fase 16)', async () => {
    await db.profiles.put(
      makeProfile({ notify_lead_minutes: 30, notify_morning_time: '06:30:00' }),
    );
    await bornPrefs(UID, TRIP_ID);
    const row = await db.notification_prefs.get(await prefsId(UID, TRIP_ID));
    expect(mergePrefs(row)).toEqual({ ...DEFAULT_PREFS, lead_minutes: 30, morning_time: '06:30' });
    expect((await db.outbox.toArray()).map((o) => [o.table, o.op])).toEqual([
      ['notification_prefs', 'upsert'],
    ]);
  });

  it('sem o perfil no aparelho, os padrões do app; com a linha já lá, nada muda', async () => {
    expect(newTripDefaults(undefined)).toEqual(DEFAULT_PREFS);
    await savePrefs(UID, TRIP_ID, { lead_minutes: 60 });
    await db.profiles.put(makeProfile({ notify_lead_minutes: 5 }));
    await bornPrefs(UID, TRIP_ID);
    const row = await db.notification_prefs.get(await prefsId(UID, TRIP_ID));
    // o que a pessoa escolheu para esta viagem vale: a linha que já existia não muda
    expect(row?.lead_minutes).toBe(60);
    expect(await db.outbox.count()).toBe(1);
  });
});
