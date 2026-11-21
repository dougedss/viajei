import { describe, expect, it } from 'vitest';
import type { Place } from '@shared/places-schema.ts';
import type { PlanWrite } from '@shared/plan-protocol.ts';
import {
  assemble,
  hasPlace,
  placesForAi,
  reconcile,
  scheduleDay,
  type AssembleInput,
  type PlacePick,
} from './assemble.ts';

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
  opening_hours: id === 'torten' ? 'Tu-Su 13:00-19:00' : null,
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
const MUSEU = {
  ref: 's2',
  place: place('museu', 'Museu Pomerano', -49.6, -26.5, ['entertainment.museum']),
  kind: 'city' as const,
  detour: 5,
  fraction: 0.2,
};

const write = (over: Partial<PlanWrite> = {}): PlanWrite => ({
  trip: { name: 'Café colonial em Pomerode', start_date: '2026-11-21', end_date: '2026-11-21' },
  days: [
    {
      date: '2026-11-21',
      title: 'Cucas e cafés',
      start: '12:30',
      stops: [{ ref: 'e1', note: 'café da colonização alemã' }],
    },
  ],
  suggestions: [
    { ref: 's1', note: 'um dos zoológicos mais antigos do estado' },
    { ref: 's2', note: 'a história da imigração' },
  ],
  quests: [{ text: 'Foto com a cuca mais alta', ref: 'e1' }],
  checklist_before: ['Conferir se abre no sábado'],
  checklist_pack: ['Casaco'],
  ...over,
});
const input = (over: Partial<AssembleInput> = {}): AssembleInput => ({
  origin: { label: 'Papanduva, SC', at: [-50.144, -26.37] },
  chosen: [TORTEN],
  chosenFractions: [0.5],
  suggestions: [ZOO, MUSEU],
  nights: [],
  // a ida (2 h 05) e a volta (2 h)
  legs: [{ duration_s: 7_500 }, { duration_s: 7_200 }],
  write: write(),
  firstDate: '2026-11-16',
  defaultStart: '08:00',
  ...over,
});

describe('a regra de ouro em código (fase 24): a reconciliação', () => {
  it('só as escolhas, cada uma uma vez, na ordem do caminho; o resto que a IA pôs sai', () => {
    const days = reconcile(
      write({
        days: [
          {
            date: '2026-11-21',
            title: null,
            start: null,
            stops: [
              { ref: 'e2', note: null },
              { ref: 'x9', note: 'um lugar que a IA inventou' },
              { ref: 's1', note: 'a IA ligou uma sugestão sozinha' },
              { ref: 'e1', note: null },
              { ref: 'e2', note: 'repetida' },
            ],
          },
          { date: '2026-11-22', title: null, start: null, stops: [] },
        ],
      }),
      ['e1', 'e2', 'e3'],
    );
    // e3, que a IA esqueceu, volta no dia da escolha anterior; os dias não andam para trás
    expect(days).toEqual([['e1', 'e2', 'e3'], []]);
  });

  it('as escolhas divididas em dois dias continuam na ordem do caminho', () => {
    const days = reconcile(
      write({
        days: [
          { date: 'a', title: null, start: null, stops: [{ ref: 'e2', note: null }] },
          { date: 'b', title: null, start: null, stops: [{ ref: 'e1', note: null }] },
        ],
      }),
      ['e1', 'e2'],
    );
    expect(days).toEqual([[], ['e1', 'e2']]);
  });
});

describe('a viagem nasce do que foi escolhido', () => {
  it('exatamente a saída, a escolha, as sugestões desligadas e a chegada, com as coordenadas do mapa', () => {
    const out = assemble(input());
    const stops = out.data.days[0]?.stops ?? [];
    expect(stops.map((s) => s.name)).toEqual([
      'Saída de Papanduva, SC',
      'Museu Pomerano',
      'Torten Paradies',
      'Bioparque Zoo Pomerode',
      'Chegada em Papanduva, SC',
    ]);
    expect(stops.map((s) => s.kind)).toEqual(['origin', 'city', 'food', 'nature', 'origin']);
    expect(stops[2]).toMatchObject({
      lat: -26.74,
      lng: -49.172,
      notes: 'café da colonização alemã',
    });
    // as sugestões, pela chave da revisão, desligadas, com o desvio e a cidade
    expect(out.suggestions).toEqual({
      d0s1: { detour: 5, city: 'Pomerode', night: false },
      d0s3: { detour: 10, city: 'Pomerode', night: false },
    });
    expect(stops[1]?.notes).toBe('a história da imigração');
  });

  it('os horários: a hora de sair, o tempo de carro da rota e a permanência do tipo, sem as sugestões', () => {
    const stops = assemble(input()).data.days[0]?.stops ?? [];
    // 12:30 saída, 2 h 05 de carro → 14:35 no café, 75 min lá, 2 h de volta → 17:50 em casa
    expect(stops.map((s) => s.time)).toEqual(['12:30', null, '14:35', null, '17:50']);
    expect(stops[0]?.travel_minutes_to_next).toBe(125);
    expect(stops[2]?.travel_minutes_to_next).toBe(120);
  });

  it('o cabeçalho, as missões pela parada e as listas vêm da escrita', () => {
    const out = assemble(input());
    expect(out.trip).toEqual({
      name: 'Café colonial em Pomerode',
      start_date: '2026-11-21',
      end_date: '2026-11-21',
      origin: 'Papanduva, SC',
    });
    expect(out.data.quests).toEqual([
      { text: 'Foto com a cuca mais alta', stop_ref: 'Torten Paradies' },
    ]);
    expect(out.data.checklist_before).toEqual(['Conferir se abre no sábado']);
  });

  it('ligar uma sugestão refaz os horários pela estimativa nos trechos novos', () => {
    const out = assemble(input());
    const points = out.points['2026-11-21'] ?? [];
    const on = points.filter((p) => p.key !== 'd0s1');
    const times = scheduleDay(on, '12:30', out.schedule);
    expect(times.get('d0s2')?.time).toBe('14:35');
    // café → zoo pela estimativa (perto), zoo → casa pela estimativa: a chegada passa das 17:50
    expect(times.get('d0s3')?.time).toBe('15:55');
    expect(Number((times.get('d0s4')?.time ?? '').replace(':', ''))).toBeGreaterThan(1750);
  });

  it('numa viagem de mais de um dia, onde dormir vira sugestão no fim de cada dia que não é o último', () => {
    const hotel: PlacePick = {
      ref: 'h1',
      place: place('h', 'Pousada', -49.17, -26.74, ['accommodation.hotel']),
      kind: 'hotel',
    };
    const out = assemble(
      input({
        suggestions: [],
        nights: [hotel],
        write: write({
          trip: { name: 'x', start_date: '2026-11-21', end_date: '2026-11-22' },
          days: [
            { date: '2026-11-21', title: null, start: '09:00', stops: [{ ref: 'e1', note: null }] },
            { date: '2026-11-22', title: null, start: '10:00', stops: [] },
          ],
        }),
      }),
    );
    expect(out.data.days.map((d) => d.stops.map((s) => s.name))).toEqual([
      ['Saída de Papanduva, SC', 'Torten Paradies', 'Pousada'],
      ['Chegada em Papanduva, SC'],
    ]);
    expect(out.suggestions.d0s2).toEqual({ detour: 0, city: 'Pomerode', night: true });
  });

  it('o que vai para a IA: as escolhas com o tempo de carro e as sugestões com o desvio, como dado', () => {
    const places = placesForAi(
      [TORTEN],
      [ZOO],
      [{ duration_s: 7_500 }, { duration_s: 7_200 }],
      true,
    );
    // sem pendentes, nada a mais (o app de antes continua lendo o mesmo pedido)
    expect(places).not.toHaveProperty('pending');
    expect(
      placesForAi([TORTEN], [], null, true, [{ name: 'Feirinha', kind: 'event', why: 'not_found' }])
        .pending,
    ).toEqual([{ name: 'Feirinha', kind: 'event', why: 'not_found' }]);
    expect(places).toEqual({
      chosen: [
        {
          ref: 'e1',
          name: 'Torten Paradies',
          city: 'Pomerode',
          kind: 'food',
          category: 'catering.cafe',
          lat: -26.74,
          lng: -49.172,
          opening_hours: 'Tu-Su 13:00-19:00',
          minutes: 125,
        },
      ],
      suggestions: [
        expect.objectContaining({ ref: 's1', minutes: 10, category: 'entertainment.zoo' }),
      ],
      home_minutes: 120,
    });
  });

  it('uma viagem só com a saída e a chegada não tem lugar', () => {
    expect(
      hasPlace([
        { kind: 'origin', include: true },
        { kind: 'origin', include: true },
      ]),
    ).toBe(false);
    expect(
      hasPlace([
        { kind: 'origin', include: true },
        { kind: 'food', include: false },
      ]),
    ).toBe(false);
    expect(hasPlace([{ kind: 'food', include: true }])).toBe(true);
  });
});
