import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { validateImport } from '@shared/import-schema.ts';
import type { Stop } from '@/lib/db/schema.ts';
import { uuidV5 } from '@/lib/ids/uuid.ts';
import { makeItem, makeTrip, TRIP_ID, UID } from '@/test/factories.ts';
import { docOfTrip } from './export.ts';
import { readViajei, writeViajei } from './format.ts';
import { planImport, reviewOf, type PlanContext } from './plan.ts';

const seed = validateImport(JSON.parse(readFileSync('supabase/seed/viagem-rs.json', 'utf8')));
const golden = readFileSync('supabase/seed/viagem-rs.viajei', 'utf8');
const DATES = ['2026-12-11', '2026-12-12', '2026-12-13', '2026-12-14'];
const trip = makeTrip({
  id: TRIP_ID,
  name: 'RS — concurso em Montenegro',
  start_date: '2026-12-11',
  end_date: '2026-12-14',
  origin: 'Papanduva/SC',
  budget: 3000,
});
const dayIds: Record<string, string> = {};
beforeAll(async () => {
  for (const date of DATES) dayIds[date] = await uuidV5(TRIP_ID, date);
});

/** A viagem como a importação do seed a gravaria no aparelho (o mesmo caminho do exemplo, D135). */
function savedSeed() {
  let n = 0;
  const ctx: PlanContext = {
    uid: UID,
    now: '2026-11-20T12:00:00.000Z',
    dayIds,
    newId: () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`,
    source: 'user',
  };
  const existing = { trip, days: [], stops: [], reservations: [], contacts: [], items: [] };
  const plan = planImport(reviewOf(seed, existing), existing, ctx);
  const synced = <T extends object>(rows: T[]) => rows.map((r) => ({ ...r, synced_at: null }));
  return {
    trip,
    days: synced(plan.newDays),
    stops: synced(plan.stops),
    reservations: synced(plan.reservations),
    contacts: synced(plan.contacts),
    items: synced(plan.items),
  };
}

describe('Copiar roteiro como texto', () => {
  it('a viagem do seed, gravada pela importação, volta como o seed e como o arquivo de referência', () => {
    const doc = docOfTrip(savedSeed());
    expect(doc.data).toEqual(seed);
    expect(writeViajei(doc)).toBe(golden);
    const back = readViajei(writeViajei(doc), '2026-11-15');
    expect(back.ok ? back.doc : null).toEqual(doc);
  });

  it('ficam de fora o que foi apagado, as sugestões não aceitas e o dia vazio sem título', () => {
    const rows = savedSeed();
    const [first, ...rest] = rows.stops;
    const gone: Stop | undefined = first
      ? { ...first, deleted_at: '2026-11-21T00:00:00Z' }
      : undefined;
    const doc = docOfTrip({
      ...rows,
      stops: gone ? [gone, ...rest] : rest,
      days: [
        ...rows.days,
        { ...rows.days[0]!, id: 'vazio', date: '2026-12-15', title: null, synced_at: null },
      ],
      items: [
        ...rows.items,
        makeItem({ kind: 'pack', text: 'Sugestão', status: 'suggested', position: 'z9' }),
        makeItem({ kind: 'pack', text: 'Dispensada', status: 'dismissed', position: 'z8' }),
      ],
    });
    expect(doc.data.days.flatMap((d) => d.stops)).toHaveLength(17);
    expect(doc.data.days.map((d) => d.date)).toEqual(DATES);
    expect(doc.data.checklist_pack).toEqual(seed.checklist_pack);
  });

  it('a reserva ligada só à parada leva também o dia dela', () => {
    const rows = savedSeed();
    const steffen = rows.stops.find((s) => s.name === 'Hotel Steffen');
    const doc = docOfTrip({
      ...rows,
      reservations: rows.reservations.map((r) => ({ ...r, trip_day_id: null })),
    });
    expect(steffen).toBeDefined();
    expect(doc.data.reservations[0]).toMatchObject({
      stop_ref: 'Hotel Steffen',
      day_ref: '2026-12-11',
      start_at: '2026-12-11T16:30',
    });
  });
});
