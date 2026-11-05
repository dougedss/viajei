import { describe, expect, it } from 'vitest';
import { shouldOfferPush, tripWithinAskWindow } from './ask.ts';

const trip = { start_date: '2026-12-11', end_date: '2026-12-14' };
const base = {
  today: '2026-12-05',
  trip,
  asked: false,
  firstOpen: false,
  status: 'default' as const,
};

describe('quando oferecer os avisos', () => {
  it('em até 7 dias do início, até o fim da viagem', () => {
    expect(tripWithinAskWindow(trip, '2026-12-03')).toBe(false);
    expect(tripWithinAskWindow(trip, '2026-12-04')).toBe(true);
    expect(tripWithinAskWindow(trip, '2026-12-12')).toBe(true);
    expect(tripWithinAskWindow(trip, '2026-12-14')).toBe(true);
    expect(tripWithinAskWindow(trip, '2026-12-15')).toBe(false);
  });

  it('oferece uma vez, nunca na primeira abertura do app, só com permissão por decidir', () => {
    expect(shouldOfferPush(base)).toBe(true);
    expect(shouldOfferPush({ ...base, status: 'not-installed' })).toBe(true);
    expect(shouldOfferPush({ ...base, asked: true })).toBe(false);
    expect(shouldOfferPush({ ...base, firstOpen: true })).toBe(false);
    expect(shouldOfferPush({ ...base, status: 'denied' })).toBe(false);
    expect(shouldOfferPush({ ...base, status: 'subscribed' })).toBe(false);
    expect(shouldOfferPush({ ...base, status: 'unsupported' })).toBe(false);
    expect(shouldOfferPush({ ...base, today: '2026-11-20' })).toBe(false);
  });
});
