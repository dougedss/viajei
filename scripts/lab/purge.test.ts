import { describe, expect, it } from 'vitest';
import { outOfRule, type PurgeSummaryLike } from './purge.ts';

const NOW = new Date('2027-03-01T07:00:00.000Z');
const empty = { count: 0, newest: null };

function summary(over: Partial<PurgeSummaryLike> = {}): PurgeSummaryLike {
  return {
    dry_run: true,
    by: 'user',
    trips: empty,
    trip_rows: {},
    trip_kept: {},
    tombstones: {},
    held: 0,
    horizons: { trips: 0, users: 0 },
    logs: {},
    storage: { trip_objects: 0, orphans: empty, removed: 0, failed: 0 },
    ms: 40,
    ...over,
  };
}

describe('outOfRule', () => {
  it('nada se qualificando está dentro da regra', () => {
    expect(outOfRule(summary(), NOW)).toEqual([]);
  });

  it('o mais novo de cada categoria mais velho que a regra passa', () => {
    expect(
      outOfRule(
        summary({
          trips: { count: 1, newest: '2027-01-20T00:00:00.000Z' },
          tombstones: { stops: { count: 3, newest: '2026-11-25T00:00:00.000Z' } },
          logs: { edge_calls: { count: 9, newest: '2026-11-30T00:00:00.000Z' } },
          storage: {
            trip_objects: 2,
            orphans: { count: 1, newest: '2027-02-20T00:00:00.000Z' },
            removed: 0,
            failed: 0,
          },
        }),
        NOW,
      ),
    ).toEqual([]);
  });

  it('uma viagem excluída há 20 dias, uma lápide de 60 e um objeto de 3 dias ficam de fora da regra', () => {
    const problems = outOfRule(
      summary({
        trips: { count: 1, newest: '2027-02-09T00:00:00.000Z' },
        tombstones: { stops: { count: 1, newest: '2026-12-31T00:00:00.000Z' } },
        storage: {
          trip_objects: 0,
          orphans: { count: 1, newest: '2027-02-26T00:00:00.000Z' },
          removed: 0,
          failed: 0,
        },
      }),
      NOW,
    );
    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain('viagens');
    expect(problems[1]).toContain('lápides de stops');
    expect(problems[2]).toContain('objetos sem linha');
  });
});
