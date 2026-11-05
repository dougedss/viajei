import { describe, expect, it } from 'vitest';
import { makeTrip } from '@/test/factories.ts';
import { GEMEO_DATE, gemeoStops } from '@/test/fixtures/dia-gemeo.ts';
import { dayToIcs, escapeText, foldLine, icsFilename, negativeDuration, tripToIcs } from './ics.ts';

const NOW = new Date('2026-11-05T12:00:00.000Z');

describe('.ics', () => {
  it('o dia 1 do seed, inteiro (snapshot)', () => {
    const ics = dayToIcs(
      makeTrip(),
      { date: GEMEO_DATE, title: 'Papanduva → Serra Gaúcha' },
      gemeoStops(),
      NOW,
    );
    expect(ics).toMatchSnapshot();
  });

  it('CRLF, VTIMEZONE de um bloco, um VEVENT por parada com horário', () => {
    const ics = dayToIcs(makeTrip(), { date: GEMEO_DATE, title: null }, gemeoStops(), NOW);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(4);
    expect(ics.match(/BEGIN:STANDARD/g)).toHaveLength(1);
    expect(ics).not.toContain('DAYLIGHT');
    expect(ics).toContain('DTSTART;TZID=America/Sao_Paulo:20261211T133000');
    // DTEND = horário da próxima; na última, +1 h
    expect(ics).toContain('DTEND;TZID=America/Sao_Paulo:20261211T163000');
    expect(ics).toContain('DTEND;TZID=America/Sao_Paulo:20261211T200000');
    expect(ics).toContain('DTSTAMP:20261105T120000Z');
  });

  it('alarme 15 min antes do "sair às": deslocamento da anterior + 15', () => {
    const ics = dayToIcs(makeTrip(), { date: GEMEO_DATE, title: null }, gemeoStops(), NOW);
    const triggers = [...ics.matchAll(/TRIGGER:(\S+)/g)].map((m) => m[1]);
    expect(triggers).toEqual(['-PT15M', '-PT6H45M', '-PT1H', '-PT25M']);
    expect(negativeDuration(60)).toBe('-PT1H');
    expect(negativeDuration(0)).toBe('-PT0M');
  });

  it('endereço, GEO, fecha às, observações e link do Maps na descrição', () => {
    const ics = dayToIcs(makeTrip(), { date: GEMEO_DATE, title: null }, gemeoStops(), NOW);
    expect(ics).toContain('LOCATION:Nova Sardenha\\, Farroupilha\\, RS');
    expect(ics).toContain('GEO:-29.28522;-51.41185');
    expect(ics).toMatch(/DESCRIPTION:Fecha às 17:00\\nMapa: https:\/\/www\.google\.com/);
    expect(ics).toContain('UID:e2222222-2222-4222-8222-222222222222@viajei');
  });

  it('parada sem horário fica fora; a viagem inteira junta os dias na ordem', () => {
    const stops = gemeoStops();
    stops[3] = { ...stops[3]!, time: null };
    const trip = tripToIcs(
      makeTrip(),
      [
        { day: { date: '2026-12-12' }, stops: [{ ...stops[0]!, id: 'x', time: '09:00' }] },
        { day: { date: GEMEO_DATE }, stops },
      ],
      NOW,
    );
    expect(trip.match(/BEGIN:VEVENT/g)).toHaveLength(4);
    expect(trip.indexOf('20261211T070000')).toBeLessThan(trip.indexOf('20261212T090000'));
    expect(trip).toContain('X-WR-CALNAME:RS — concurso em Montenegro\r\n');
  });

  it('escapes da RFC 5545 e dobra em 75 octetos sem partir caractere', () => {
    expect(escapeText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
    const long = `DESCRIPTION:${'çã'.repeat(60)}`;
    const folded = foldLine(long);
    const lines = folded.split('\r\n');
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    for (const l of lines.slice(1)) expect(l.startsWith(' ')).toBe(true);
    expect(lines.map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(long);
    expect(foldLine('curta')).toBe('curta');
  });

  it('nome do arquivo', () => {
    expect(icsFilename(makeTrip(), { date: GEMEO_DATE })).toBe(
      'viajei-rs-concurso-em-montenegro-2026-12-11.ics',
    );
    expect(icsFilename({ name: '!!!' })).toBe('viajei-viagem.ics');
  });
});
