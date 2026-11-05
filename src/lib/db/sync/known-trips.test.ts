import { describe, expect, it } from 'vitest';
import { makeTrip } from '@/test/factories.ts';
import { tripsKnownToServer } from './apply-pull.ts';

describe('tripsKnownToServer', () => {
  it('uma viagem criada aqui e ainda não enviada não é consultada (seria apagada como revoked)', () => {
    const pending = makeTrip({ id: 'p', synced_at: null });
    const synced = makeTrip({ id: 's', synced_at: '2026-11-05T10:00:00.000Z' });
    const gone = makeTrip({ id: 'g', synced_at: '2026-11-05T10:00:00.000Z', deleted_at: 'x' });
    expect(tripsKnownToServer([pending, synced, gone], [])).toEqual(['s']);
  });

  it('as participações confirmadas pelo pull do usuário entram, sem repetir', () => {
    const synced = makeTrip({ id: 's', synced_at: '2026-11-05T10:00:00.000Z' });
    expect(tripsKnownToServer([synced], ['s', 'p'])).toEqual(['s', 'p']);
  });
});
