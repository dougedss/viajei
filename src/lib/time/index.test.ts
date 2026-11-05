import { describe, expect, it } from 'vitest';
import {
  countdownState,
  currentDay,
  formatDayShort,
  formatDuration,
  hhmm,
  isNight,
  leaveAt,
  wallTime,
} from './index.ts';

describe('lib/time', () => {
  it('hhmm aceita os formatos do banco e do formulário', () => {
    expect(hhmm('07:00')).toBe('07:00');
    expect(hhmm('07:00:00')).toBe('07:00');
    expect(hhmm('13:30:00.000')).toBe('13:30');
  });

  it('wallTime é hora de parede local, não UTC', () => {
    const d = wallTime('2026-12-11', '07:00:00');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(11);
    expect(d.getDate()).toBe(11);
    expect(d.getHours()).toBe(7);
    expect(d.getMinutes()).toBe(0);
  });

  it('leaveAt é o horário da próxima menos o deslocamento', () => {
    const d = leaveAt('2026-12-11', '13:30', 390);
    expect(d.getHours()).toBe(7);
    expect(d.getMinutes()).toBe(0);
    const cross = leaveAt('2026-12-12', '00:30', 60);
    expect(cross.getDate()).toBe(11);
    expect(cross.getHours()).toBe(23);
  });

  it('countdownState: verde com folga, âmbar abaixo de 15 min, vermelho atrasado', () => {
    const target = wallTime('2026-12-11', '07:00');
    expect(countdownState(target, wallTime('2026-12-11', '06:20'))).toEqual({
      minutes: 40,
      state: 'ok',
    });
    expect(countdownState(target, wallTime('2026-12-11', '06:45'))).toEqual({
      minutes: 15,
      state: 'ok',
    });
    expect(countdownState(target, wallTime('2026-12-11', '06:46'))).toEqual({
      minutes: 14,
      state: 'tight',
    });
    expect(countdownState(target, wallTime('2026-12-11', '07:00'))).toEqual({
      minutes: 0,
      state: 'tight',
    });
    expect(countdownState(target, new Date(target.getTime() + 30_000)).state).toBe('late');
    expect(countdownState(target, wallTime('2026-12-11', '07:10')).minutes).toBe(-10);
  });

  it('currentDay: hoje, senão o próximo, senão o último', () => {
    const days = [{ date: '2026-12-13' }, { date: '2026-12-11' }, { date: '2026-12-12' }];
    expect(currentDay(days, '2026-12-12')?.date).toBe('2026-12-12');
    expect(currentDay(days, '2026-11-04')?.date).toBe('2026-12-11');
    expect(currentDay(days, '2026-12-20')?.date).toBe('2026-12-13');
    expect(currentDay([], '2026-12-20')).toBeNull();
  });

  it('isNight das 18:30 às 6:00', () => {
    expect(isNight(wallTime('2026-12-11', '18:29'))).toBe(false);
    expect(isNight(wallTime('2026-12-11', '18:30'))).toBe(true);
    expect(isNight(wallTime('2026-12-11', '05:59'))).toBe(true);
    expect(isNight(wallTime('2026-12-11', '06:00'))).toBe(false);
  });

  it('formatDuration', () => {
    expect(formatDuration(390)).toBe('6h30');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(35)).toBe('35 min');
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(-5)).toBe('-5 min');
    expect(formatDuration(65)).toBe('1h05');
  });

  it('formatDayShort em pt-BR sem o ponto da abreviação', () => {
    expect(formatDayShort('2026-12-11')).toBe('sex 11/12');
  });
});
