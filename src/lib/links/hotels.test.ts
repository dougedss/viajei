import { describe, expect, it } from 'vitest';
import { bookingSearchUrl, nextDay } from './hotels.ts';

describe('bookingSearchUrl', () => {
  it('o lugar e as datas, com 2 adultos e 1 quarto por padrão, em pt-br', () => {
    const url = new URL(
      bookingSearchUrl({
        place: 'Canela, Rio Grande do Sul',
        checkin: '2026-12-12',
        checkout: '2026-12-13',
      }) ?? '',
    );
    expect(url.origin + url.pathname).toBe('https://www.booking.com/searchresults.pt-br.html');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      ss: 'Canela, Rio Grande do Sul',
      checkin: '2026-12-12',
      checkout: '2026-12-13',
      group_adults: '2',
      no_rooms: '1',
      lang: 'pt-br',
    });
  });

  it('sem check-out, o dia seguinte; o time inteiro como adultos, entre 1 e 30', () => {
    const url = new URL(
      bookingSearchUrl({ place: 'Gramado', checkin: '2026-12-31', adults: 4 }) ?? '',
    );
    expect(url.searchParams.get('checkout')).toBe('2027-01-01');
    expect(url.searchParams.get('group_adults')).toBe('4');
    expect(
      new URL(
        bookingSearchUrl({ place: 'x', checkin: '2026-12-12', adults: 0 }) ?? '',
      ).searchParams.get('group_adults'),
    ).toBe('1');
  });

  it('sem lugar, com data fora do formato ou com saída antes da chegada, nada', () => {
    expect(bookingSearchUrl({ place: '  ', checkin: '2026-12-12' })).toBeNull();
    expect(bookingSearchUrl({ place: 'Canela', checkin: '12/12/2026' })).toBeNull();
    expect(
      bookingSearchUrl({ place: 'Canela', checkin: '2026-12-12', checkout: '2026-12-12' }),
    ).toBeNull();
  });

  it('nextDay vira o mês e o ano', () => {
    expect(nextDay('2026-11-30')).toBe('2026-12-01');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
  });
});
