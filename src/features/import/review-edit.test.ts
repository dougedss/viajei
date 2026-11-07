import { describe, expect, it } from 'vitest';
import { fromAi } from '@shared/import-schema.ts';
import { seedAiJson } from '@/test/fixtures/import-recording.ts';
import { makeDay, makeTrip } from '@/test/factories.ts';
import { reviewOf, type Review } from './plan.ts';
import {
  canSave,
  chooseGeo,
  looseValue,
  parseLooseValue,
  reviewCounts,
  reviewWarnings,
  setDayIncluded,
  setItemIncluded,
  setLooseDestination,
  setStopIncluded,
  updateStop,
} from './review-edit.ts';

const data = { ...fromAi(JSON.parse(seedAiJson())), unclassified: ['Levar o carregador'] };
const base = (): Review =>
  reviewOf(data, {
    trip: makeTrip(),
    days: [makeDay()],
    stops: [],
    reservations: [],
    contacts: [],
    items: [],
  });

describe('editar a revisão', () => {
  it('cada edição devolve uma revisão nova e não mexe na anterior', () => {
    const before = base();
    const after = setStopIncluded(before, 'd0s1', false);
    expect(after).not.toBe(before);
    expect(before.days[0]?.stops[1]?.include).toBe(true);
    expect(after.days[0]?.stops[1]?.include).toBe(false);
    // os outros dias continuam os mesmos objetos
    expect(after.days[1]).toBe(before.days[1]);
  });

  it('a parada editada no formulário leva o lugar do formulário, ou nenhum', () => {
    const values = {
      kind: 'nature' as const,
      name: 'Park Salto Ventoso',
      time: '13:30',
      closes_at: '17:00',
      address: 'Farroupilha, RS',
      lat: -29.28,
      lng: -51.35,
      travel_minutes_to_next: 60,
      notes: null,
      url: null,
    };
    const located = updateStop(base(), 'd0s1', values).days[0]?.stops[1];
    expect(located).toMatchObject({ ...values, geo: { status: 'found', via: 'edit' } });
    const cleared = updateStop(base(), 'd0s1', { ...values, lat: null, lng: null }).days[0]
      ?.stops[1];
    expect(cleared?.geo).toEqual({ status: 'none' });
  });

  it('escolher uma opção marca o lugar; "nenhum destes" deixa sem local, decidido', () => {
    const option = { name: 'Vale do Mel', address: 'Alto Feliz, RS', lat: -29.35, lng: -51.29 };
    const chosen = chooseGeo(base(), 'd1s0', option).days[1]?.stops[0];
    expect(chosen).toMatchObject({
      lat: -29.35,
      lng: -51.29,
      geo: { status: 'found', label: 'Alto Feliz, RS', via: 'choice' },
    });
    expect(chooseGeo(base(), 'd1s0', null).days[1]?.stops[0]?.geo).toEqual({ status: 'none' });
  });

  it('as contas da tela seguem o que está marcado e os dias mantidos', () => {
    let r = base();
    expect(reviewCounts(r)).toEqual({
      days: 4,
      stops: 18,
      reservations: 2,
      contacts: 6,
      before: 5,
      pack: 6,
      quests: 4,
    });
    r = setItemIncluded(r, 'reservations', 'r0', false);
    r = setItemIncluded(r, 'pack', 'p5', false);
    r = setDayIncluded(r, '2026-12-14', false);
    expect(reviewCounts(r)).toMatchObject({ days: 3, stops: 14, reservations: 1, pack: 5 });
  });

  it('salvar espera cada não classificado ter destino', () => {
    const r = base();
    expect(reviewWarnings(r).undecided).toBe(1);
    expect(canSave(r)).toBe(false);
    expect(canSave(setLooseDestination(r, 'u0', { kind: 'discard' }))).toBe(true);
  });

  it('o destino vai e volta pelo valor do seletor', () => {
    for (const to of [
      { kind: 'undecided' },
      { kind: 'discard' },
      { kind: 'before' },
      { kind: 'pack' },
      { kind: 'stop_note', stop: 'd0s2' },
      { kind: 'day_note', date: '2026-12-12' },
    ] as const) {
      expect(parseLooseValue(looseValue(to))).toEqual(to);
    }
    expect(parseLooseValue('qualquer coisa')).toEqual({ kind: 'undecided' });
  });
});
