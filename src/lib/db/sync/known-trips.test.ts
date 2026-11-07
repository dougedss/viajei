import { describe, expect, it } from 'vitest';
import { makeMember, makeTrip } from '@/test/factories.ts';
import { tripsKnownToServer } from './apply-pull.ts';

const ME = 'eu';
const STAMP = '2026-11-05T10:00:00.000Z';

describe('tripsKnownToServer', () => {
  it('uma viagem criada aqui e ainda não enviada não é consultada (seria apagada como revoked)', () => {
    const pending = makeTrip({ id: 'p', synced_at: null });
    // a participação do dono criada aqui é só projeção local, sem carimbo do servidor
    const projected = makeMember({ id: 'mp', trip_id: 'p', user_id: ME, synced_at: null });
    const synced = makeTrip({ id: 's', synced_at: STAMP });
    const gone = makeTrip({ id: 'g', synced_at: STAMP, deleted_at: 'x' });
    expect(tripsKnownToServer([pending, synced, gone], [projected], ME)).toEqual(['s']);
  });

  it('a participação aceita que veio do servidor entra mesmo sem a viagem no aparelho', () => {
    // o primeiro pull da viagem foi interrompido: a participação ficou, a viagem não
    const synced = makeTrip({ id: 's', synced_at: STAMP });
    const memberships = [
      makeMember({ id: 'ms', trip_id: 's', user_id: ME, synced_at: STAMP }),
      makeMember({ id: 'mn', trip_id: 'n', user_id: ME, synced_at: STAMP }),
    ];
    expect(tripsKnownToServer([synced], memberships, ME)).toEqual(['s', 'n']);
  });

  it('participação de outra pessoa, pendente, com lápide ou de viagem apagada aqui não entra', () => {
    const deletedHere = makeTrip({ id: 'd', synced_at: STAMP, deleted_at: 'x' });
    const memberships = [
      makeMember({ id: 'm1', trip_id: 'a', user_id: 'outra', synced_at: STAMP }),
      makeMember({ id: 'm2', trip_id: 'b', user_id: ME, status: 'pending', synced_at: STAMP }),
      makeMember({ id: 'm3', trip_id: 'c', user_id: ME, synced_at: STAMP, deleted_at: STAMP }),
      makeMember({ id: 'm4', trip_id: 'd', user_id: ME, synced_at: STAMP }),
    ];
    expect(tripsKnownToServer([deletedHere], memberships, ME)).toEqual([]);
  });
});
