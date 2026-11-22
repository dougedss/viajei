import { describe, expect, it } from 'vitest';
import { hoursNotice, weekdayOf } from './hours.ts';

/** O horário na conta do passeio (fase 27): o aviso só quando o roteiro chega com o lugar fechado. */
const HOURS = [
  { day: 1, open: '08:00', close: '19:00' },
  { day: 2, open: '08:00', close: '19:00' },
  { day: 6, open: '08:30', close: '13:00' },
];

describe('hoursNotice', () => {
  it('o dia da semana da data, em hora de parede (7/12/2026 é uma segunda)', () => {
    expect(weekdayOf('2026-12-07')).toBe(1);
    expect(weekdayOf('2026-12-06')).toBe(0);
  });

  it('aberto na hora prevista: nenhum aviso; chegando antes de abrir ou depois de fechar, o aviso diz o horário do dia', () => {
    expect(hoursNotice(HOURS, '2026-12-07', '10:00')).toBeNull();
    expect(hoursNotice(HOURS, '2026-12-07', '07:30')).toBe('Fechado às 07:30: abre 08:00–19:00');
    expect(hoursNotice(HOURS, '2026-12-12', '14:00')).toBe('Fechado às 14:00: abre 08:30–13:00');
  });

  it('o dia sem período é "fechado na quinta"; sem períodos ou sem horário previsto, nada se afirma', () => {
    expect(hoursNotice(HOURS, '2026-12-10', '10:00')).toBe('Fechado na quinta');
    expect(hoursNotice(null, '2026-12-10', '10:00')).toBeNull();
    expect(hoursNotice([], '2026-12-10', '10:00')).toBeNull();
    expect(hoursNotice(HOURS, '2026-12-10', null)).toBeNull();
  });
});
