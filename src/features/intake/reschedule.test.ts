import { describe, expect, it } from 'vitest';
import { driveKey } from '@shared/drive-schema.ts';
import type { Place } from '@shared/places-schema.ts';
import { parseStoredReview } from '@/features/import/draft.ts';
import { newTripReview } from '@/features/import/new-review.ts';
import { setStopIncluded } from '@/features/import/review-edit.ts';
import { assemble, type PlacePick } from './assemble.ts';
import { reschedule, unmeasuredLegs } from './reschedule.ts';

const place = (
  id: string,
  name: string,
  lng: number,
  lat: number,
  categories: string[],
): Place => ({
  id,
  name,
  lat,
  lng,
  categories,
  city: 'Pomerode',
  address: `${name}, Pomerode - SC`,
  opening_hours: null,
  website: null,
  osm: null,
  distance_m: null,
});
const TORTEN: PlacePick = {
  ref: 'e1',
  place: place('torten', 'Torten Paradies', -49.172, -26.74, ['catering.cafe']),
  kind: 'food',
};
const ZOO = {
  ref: 's1',
  place: place('zoo', 'Bioparque Zoo Pomerode', -49.175, -26.73, ['entertainment.zoo']),
  kind: 'nature' as const,
  detour: 10,
  fraction: 0.52,
};

async function review() {
  const built = assemble({
    origin: { label: 'Papanduva, SC', at: [-50.144, -26.37] },
    chosen: [TORTEN],
    chosenFractions: [0.5],
    suggestions: [ZOO],
    nights: [],
    legs: [{ duration_s: 7_500 }, { duration_s: 7_200 }],
    write: {
      trip: { name: 'Café colonial', start_date: '2026-11-21', end_date: '2026-11-21' },
      days: [
        { date: '2026-11-21', title: null, start: '12:30', stops: [{ ref: 'e1', note: null }] },
      ],
      suggestions: [{ ref: 's1', note: 'o zoológico' }],
      quests: [],
      checklist_before: [],
      checklist_pack: [],
    },
    firstDate: '2026-11-16',
    defaultStart: '08:00',
  });
  return newTripReview(
    built.data,
    { ...built.trip, budget: null },
    {
      uid: null,
      source: 'ai',
      importId: null,
      partial: false,
      checked: { removed: [], unchecked: [], missing: [] },
      plan: { suggestions: built.suggestions, schedule: built.schedule },
    },
  );
}

describe('a revisão da conversa nova (fase 24)', () => {
  it('a sugestão nasce desligada, com o desvio; as escolhas com o rótulo do mapa', async () => {
    const stored = await review();
    const stops = stored.review.days[0]?.stops ?? [];
    expect(stops.map((s) => [s.name, s.include])).toEqual([
      ['Saída de Papanduva, SC', true],
      ['Torten Paradies', true],
      ['Bioparque Zoo Pomerode', false],
      ['Chegada em Papanduva, SC', true],
    ]);
    expect(stops[2]?.suggestion).toEqual({ detour: 10, city: 'Pomerode', night: false });
    expect(stops[1]?.geo).toMatchObject({ status: 'found', via: 'osm' });
    expect(stored.schedule?.starts).toEqual({ '2026-11-21': '12:30' });
    // guardada e lida de novo do disco, a revisão continua com as sugestões e os horários
    const back = parseStoredReview(JSON.stringify(stored));
    expect(back?.schedule).toEqual(stored.schedule);
    expect(back?.review.days[0]?.stops[2]?.suggestion).toEqual(stops[2]?.suggestion);
  });

  it('ligar a sugestão a põe na ordem do caminho e refaz os horários do dia; o trecho novo espera a medida; desligar volta', async () => {
    const stored = await review();
    const schedule = stored.schedule;
    if (!schedule) throw new Error('sem horários');
    const before = stored.review.days[0]?.stops.map((s) => s.time);
    expect(before).toEqual(['12:30', '14:35', null, '17:50']);
    const on = reschedule(setStopIncluded(stored.review, 'd0s2', true), schedule, '2026-11-21');
    // café → zoo e zoo → casa não foram medidos: sem hora (D310), e a tela sabe o que medir
    expect(on.days[0]?.stops.map((s) => s.time)).toEqual(['12:30', '14:35', null, null]);
    expect(unmeasuredLegs(on, schedule).map((l) => driveKey(...l.pair))).toEqual([
      driveKey([-49.172, -26.74], [-49.175, -26.73]),
      driveKey([-49.175, -26.73], [-50.144, -26.37]),
    ]);
    const measured = {
      ...schedule,
      drive: {
        [driveKey([-49.172, -26.74], [-49.175, -26.73])]: 300,
        [driveKey([-49.175, -26.73], [-50.144, -26.37])]: 7_200,
      },
    };
    const done = reschedule(on, measured, '2026-11-21');
    expect(done.days[0]?.stops.map((s) => s.time)).toEqual(['12:30', '14:35', '15:55', '19:25']);
    expect(unmeasuredLegs(done, measured)).toEqual([]);
    const off = reschedule(setStopIncluded(done, 'd0s2', false), measured, '2026-11-21');
    expect(off.days[0]?.stops.map((s) => s.time)).toEqual(before);
  });

  it('desmarcar uma parada que não é sugestão também refaz o dia: as seguintes não ficam com a hora de antes', async () => {
    const stored = await review();
    const schedule = stored.schedule;
    if (!schedule) throw new Error('sem horários');
    const off = reschedule(setStopIncluded(stored.review, 'd0s1', false), schedule, '2026-11-21');
    // sem o café, a casa é logo depois da saída (o mesmo ponto): a chegada às 12:30
    expect(off.days[0]?.stops.map((s) => s.time)).toEqual(['12:30', null, null, '12:30']);
  });
});
