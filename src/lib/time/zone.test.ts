import { describe, expect, it } from 'vitest';
import {
  instantToZonedISO,
  isoToWall,
  localStampToISO,
  offsetMinutes,
  wallToISO,
  wallToInstant,
} from './zone.ts';

describe('hora de parede de São Paulo para timestamptz', () => {
  it('sem horário de verão (desde 2019): −03:00', () => {
    expect(wallToISO('2026-12-13', '14:00')).toBe('2026-12-13T14:00:00-03:00');
    expect(new Date(wallToISO('2026-12-13', '14:00')).toISOString()).toBe(
      '2026-12-13T17:00:00.000Z',
    );
    expect(wallToISO('2026-12-31', '23:30')).toBe('2026-12-31T23:30:00-03:00');
  });

  it('não depende do fuso do aparelho', () => {
    // a conta é toda em UTC + Intl; o mesmo resultado em qualquer TZ do processo
    expect(wallToInstant('2026-12-11', '16:30')).toBe(Date.UTC(2026, 11, 11, 19, 30));
  });

  it('com horário de verão (2018): −02:00, e a hora que não existe anda para a frente', () => {
    expect(wallToISO('2019-01-15', '12:00')).toBe('2019-01-15T12:00:00-02:00');
    expect(offsetMinutes(Date.UTC(2019, 0, 15, 15))).toBe(-120);
    // 04/11/2018: à meia-noite os relógios pularam para 01:00
    expect(wallToISO('2018-11-04', '00:30')).toBe('2018-11-04T01:30:00-02:00');
  });

  it('de volta para data e hora de parede', () => {
    expect(isoToWall('2026-12-13T17:00:00.000Z')).toEqual({ date: '2026-12-13', time: '14:00' });
    // depois das 21h de Brasília o UTC já é amanhã; a parede não
    expect(isoToWall('2026-12-14T01:30:00Z')).toEqual({ date: '2026-12-13', time: '22:30' });
    expect(isoToWall(wallToISO('2026-12-11', '07:05'))).toEqual({
      date: '2026-12-11',
      time: '07:05',
    });
  });

  it('o formato do seed, sem fuso', () => {
    expect(localStampToISO('2026-12-11T16:30')).toBe('2026-12-11T16:30:00-03:00');
    expect(instantToZonedISO(Date.UTC(2026, 11, 13, 10))).toBe('2026-12-13T07:00:00-03:00');
  });
});
