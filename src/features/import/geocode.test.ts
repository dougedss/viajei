import { describe, expect, it, vi } from 'vitest';
import type { GeocodeResult } from '@/lib/db/schema.ts';
import {
  applyGeo,
  classifyResults,
  fromLink,
  geoProgress,
  geoTargets,
  locate,
  MAX_OPTIONS,
  previewTargets,
  queriesFor,
  type GeoState,
} from './geocode.ts';
import type { Review, ReviewStop } from './plan.ts';
import { EMPTY_PREVIEW, type Preview } from './preview.ts';

const place = (name: string, lat: number, lng: number): GeocodeResult => ({
  name,
  address: `${name}, RS`,
  lat,
  lng,
});

function stop(over: Partial<ReviewStop> = {}): ReviewStop {
  return {
    key: 'd0s0',
    include: true,
    repeated: null,
    geo: null,
    time: null,
    kind: 'nature',
    name: 'Cascata Vale do Mel',
    address: 'Alto Feliz',
    closes_at: null,
    travel_minutes_to_next: null,
    notes: null,
    url: null,
    lat: null,
    lng: null,
    ...over,
  };
}

function review(stops: ReviewStop[], include = true): Review {
  return {
    days: [{ date: '2026-12-12', title: null, outside: !include, include, stops }],
    reservations: [],
    contacts: [],
    before: [],
    pack: [],
    quests: [],
    unclassified: [],
  };
}

describe('o resultado da busca', () => {
  it('nenhum resultado deixa a parada sem local', () => {
    expect(classifyResults([])).toEqual({ kind: 'none' });
  });

  it('um resultado, ou vários a até 2 km entre si, marcam sozinhos pelo primeiro', () => {
    const one = place('Parque do Caracol', -29.3117, -50.8536);
    expect(classifyResults([one])).toEqual({
      kind: 'found',
      lat: one.lat,
      lng: one.lng,
      label: one.address,
      via: 'search',
    });
    // a entrada e o estacionamento do parque, a ~1 km
    const parking = place('Estacionamento do Caracol', -29.3027, -50.8536);
    expect(classifyResults([one, parking]).kind).toBe('found');
  });

  it('resultados espalhados viram escolha, com no máximo três opções', () => {
    const spread = [
      place('Vale do Mel', -29.358, -51.29),
      place('Vale do Mel', -29.65, -51.13),
      place('Vale do Mel', -28.9, -51.5),
      place('Vale do Mel', -27.5, -52.0),
    ];
    const state = classifyResults(spread);
    expect(state.kind).toBe('choice');
    expect(state.kind === 'choice' ? state.options : []).toHaveLength(MAX_OPTIONS);
  });
});

describe('as consultas de uma parada', () => {
  it('nome e endereço, depois só o endereço; sem endereço, só o nome', () => {
    expect(queriesFor({ name: 'Cascata Vale do Mel', address: 'Alto Feliz' })).toEqual([
      'Cascata Vale do Mel, Alto Feliz',
      'Alto Feliz',
    ]);
    expect(queriesFor({ name: 'Gramado', address: null })).toEqual(['Gramado']);
    expect(queriesFor({ name: 'Gramado', address: '  ' })).toEqual(['Gramado']);
  });

  it('sem consulta curta demais nem repetida', () => {
    expect(queriesFor({ name: 'X', address: null })).toEqual([]);
    expect(queriesFor({ name: '', address: 'RS' })).toEqual([]);
  });
});

describe('o link do Maps', () => {
  it('resolve sem rede, pelo leitor da fase 3', () => {
    expect(fromLink('https://www.google.com/maps/place/X/@-29.31,-50.85,15z')).toEqual({
      kind: 'found',
      lat: -29.31,
      lng: -50.85,
      label: 'Marcada pelo link do Maps',
      via: 'link',
    });
    expect(fromLink('https://example.com/cascata')).toBeNull();
    expect(fromLink(null)).toBeNull();
  });

  it('com link, a busca nem é chamada', async () => {
    const search = vi.fn<(q: string) => Promise<GeocodeResult[]>>();
    const state = await locate(
      { name: 'Caracol', address: null, url: 'https://maps.google.com/?q=-29.31,-50.85' },
      search,
    );
    expect(state.kind).toBe('found');
    expect(search).not.toHaveBeenCalled();
  });

  it('sem link, a primeira consulta que acha decide; nenhuma acha, fica sem local', async () => {
    const found = place('Alto Feliz', -29.39, -51.31);
    const search = vi
      .fn<(q: string) => Promise<GeocodeResult[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([found]);
    const state = await locate({ name: 'Cascata', address: 'Alto Feliz', url: null }, search);
    expect(search.mock.calls.map(([q]) => q)).toEqual(['Cascata, Alto Feliz', 'Alto Feliz']);
    expect(state).toMatchObject({ kind: 'found', lat: found.lat });

    const nothing = vi.fn<(q: string) => Promise<GeocodeResult[]>>().mockResolvedValue([]);
    expect(await locate({ name: 'Lugar', address: 'Rua', url: null }, nothing)).toEqual({
      kind: 'none',
    });
  });
});

describe('a fila e a revisão', () => {
  it('enquanto chega, só as paradas que já fecharam entram na fila', () => {
    const preview: Preview = {
      ...EMPTY_PREVIEW,
      days: [
        {
          date: '2026-12-11',
          title: null,
          complete: false,
          stops: [
            {
              name: 'Saída',
              kind: 'origin',
              time: '07:00',
              closes_at: null,
              address: null,
              url: null,
              complete: true,
            },
            {
              name: 'Park Sal',
              kind: null,
              time: null,
              closes_at: null,
              address: null,
              url: null,
              complete: false,
            },
          ],
        },
      ],
    };
    expect(previewTargets(preview)).toEqual([
      { key: 'd0s0', name: 'Saída', address: null, url: null },
    ]);
  });

  it('na revisão, só as mantidas sem local e sem decisão', () => {
    const r = review([
      stop({ key: 'd0s0' }),
      stop({ key: 'd0s1', include: false }),
      stop({ key: 'd0s2', lat: -29, lng: -51, geo: { status: 'found', label: 'x', via: 'file' } }),
      stop({ key: 'd0s3', geo: { status: 'none' } }),
    ]);
    expect(geoTargets(r).map((t) => t.key)).toEqual(['d0s0']);
    expect(geoTargets(review([stop()], false))).toEqual([]);
  });

  it('o que a busca achou entra na revisão sem gravar; escolha e decisão não mudam', () => {
    const r = review([
      stop({ key: 'd0s0' }),
      stop({ key: 'd0s1' }),
      stop({ key: 'd0s2', geo: { status: 'none' } }),
    ]);
    const states: Record<string, GeoState> = {
      d0s0: { kind: 'found', lat: -29.35, lng: -51.29, label: 'Alto Feliz, RS', via: 'search' },
      d0s1: { kind: 'choice', options: [] },
      d0s2: { kind: 'found', lat: 1, lng: 1, label: 'não', via: 'search' },
    };
    const out = applyGeo(r, states);
    expect(out.days[0]?.stops.map((s) => [s.lat, s.geo?.status ?? null])).toEqual([
      [-29.35, 'found'],
      [null, null],
      [null, 'none'],
    ]);
    expect(r.days[0]?.stops[0]?.lat).toBeNull();
    expect(applyGeo(r, {})).toBe(r);
  });

  it('o progresso conta o que terminou e avisa quando a rede caiu', () => {
    const targets = geoTargets(
      review([stop({ key: 'a' }), stop({ key: 'b' }), stop({ key: 'c' })]),
    );
    expect(
      geoProgress(targets, {
        a: { kind: 'none' },
        b: { kind: 'searching' },
        c: { kind: 'waiting' },
      }),
    ).toEqual({ done: 1, total: 3, offline: false });
    expect(geoProgress(targets, { a: { kind: 'offline' } }).offline).toBe(true);
  });
});
