import { describe, expect, it } from 'vitest';
import { wallTime } from '@/lib/time/index.ts';
import { makeStop } from '@/test/factories.ts';
import { dayState, progress, statusOf } from './rules.ts';

const day = { date: '2026-12-11' };
const at = (t: string) => wallTime('2026-12-11', t);
const origin = () =>
  makeStop({
    id: 'o',
    position: 'a0',
    kind: 'origin',
    name: 'Saída',
    time: '07:00',
    travel_minutes_to_next: 390,
  });
const park = () =>
  makeStop({
    id: 'p',
    position: 'a1',
    kind: 'nature',
    name: 'Parque',
    time: '13:30',
    closes_at: '17:00',
    travel_minutes_to_next: 45,
  });
const hotel = () =>
  makeStop({ id: 'h', position: 'a2', kind: 'hotel', name: 'Hotel', time: '16:30' });

describe('dayState', () => {
  it('início do dia num nó de saída: Partiu! e "sair às" no horário dele', () => {
    const s = dayState(day, [origin(), park(), hotel()], at('06:20'));
    expect(s.at).toBeNull();
    expect(s.next?.id).toBe('o');
    expect(s.primary).toBe('depart');
    expect(s.arriveAvailable).toBe(false);
    expect(s.countdown?.label).toBe('sair às');
    expect(s.countdown?.minutes).toBe(40);
    expect(s.countdown?.state).toBe('ok');
  });

  it('início do dia numa parada comum: só Chegamos!, "próxima às"', () => {
    const s = dayState(day, [park(), hotel()], at('09:00'));
    expect(s.primary).toBe('arrive');
    expect(s.departAvailable).toBe(false);
    expect(s.countdown?.label).toBe('próxima às');
  });

  it('parado numa parada: "sair às" = próxima − deslocamento, Partiu! principal e Chegamos! secundário', () => {
    const stops = [origin(), park(), hotel()];
    stops[0] = {
      ...stops[0]!,
      done_at: '2026-12-11T10:00:00.000Z',
      departed_at: '2026-12-11T10:00:00.000Z',
    };
    stops[1] = { ...stops[1]!, done_at: '2026-12-11T16:40:00.000Z' };
    const s = dayState(day, stops, at('15:30'));
    expect(s.at?.id).toBe('p');
    expect(s.onRoad).toBe(false);
    expect(s.next?.id).toBe('h');
    expect(s.leaveAt?.getHours()).toBe(15);
    expect(s.leaveAt?.getMinutes()).toBe(45);
    expect(s.countdown).toMatchObject({ label: 'sair às', minutes: 15, state: 'ok' });
    expect(s.primary).toBe('depart');
    expect(s.arriveAvailable).toBe(true);
  });

  it('na estrada: Chegamos! principal, anel até a chegada, atrasado em vermelho', () => {
    const o = { ...origin(), done_at: 'x', departed_at: 'x' };
    const s = dayState(day, [o, park(), hotel()], at('13:40'));
    expect(s.onRoad).toBe(true);
    expect(s.primary).toBe('arrive');
    expect(s.departAvailable).toBe(false);
    expect(s.countdown).toMatchObject({ label: 'chega às', minutes: -10, state: 'late' });
  });

  it('âmbar a menos de 15 min', () => {
    const s = dayState(day, [origin(), park()], at('06:50'));
    expect(s.countdown?.state).toBe('tight');
  });

  it('parada pulada não é a próxima e não conta no progresso', () => {
    const o = { ...origin(), done_at: 'x', departed_at: 'x' };
    const p = { ...park(), skipped: true };
    const s = dayState(day, [o, p, hotel()], at('14:00'));
    expect(s.next?.id).toBe('h');
    expect(statusOf(p, s)).toBe('skipped');
    expect(statusOf(o, s)).toBe('done');
    expect(statusOf(hotel(), s)).toBe('next');
    expect(progress([o, p, hotel()])).toEqual({ done: 1, total: 3 });
  });

  it('aviso de fechamento quando a parada atual fecha em menos de 1 h', () => {
    const o = { ...origin(), done_at: 'x', departed_at: 'x' };
    const p = { ...park(), done_at: 'y' };
    const s = dayState(day, [o, p, hotel()], at('16:20'));
    expect(s.closingSoon?.stop.id).toBe('p');
    expect(s.closingSoon?.minutes).toBe(40);
    expect(dayState(day, [o, p, hotel()], at('15:00')).closingSoon).toBeNull();
  });

  it('dia concluído', () => {
    const s = dayState(
      day,
      [
        { ...origin(), done_at: 'x' },
        { ...park(), done_at: 'x' },
      ],
      at('18:00'),
    );
    expect(s.finished).toBe(true);
    expect(s.next).toBeNull();
    expect(s.primary).toBe('none');
    expect(s.countdown).toBeNull();
  });

  it('sem paradas: nada a fazer, sem quebrar', () => {
    const s = dayState(day, [], at('18:00'));
    expect(s.finished).toBe(false);
    expect(s.primary).toBe('none');
  });
});
