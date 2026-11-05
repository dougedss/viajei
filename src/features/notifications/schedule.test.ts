import { describe, expect, it } from 'vitest';
import { NOTIFICATION_DEFAULTS } from '@shared/constants.ts';
import { CLOSING_SOON_MINUTES, dayState } from '@/features/travel-mode/rules.ts';
import { formatClock, wallTime } from '@/lib/time/index.ts';
import { GEMEO_DATE, GEMEO_EXPECTED, GEMEO_IDS, gemeoStops } from '@/test/fixtures/dia-gemeo.ts';

/**
 * A fixture gêmea: o que o `dayState` (TS) calcula para o dia 1 tem de ser o que o
 * `due_notifications` (SQL) calcula no pgTAP 07, minuto a minuto.
 */
const day = { date: GEMEO_DATE };
const at = (t: string) => wallTime(GEMEO_DATE, t);

describe('fixture gêmea do pgTAP', () => {
  it('início do dia: "sair às" é o horário da origem (07:00) e o aviso de 15 min cai às 06:45', () => {
    const s = dayState(day, gemeoStops(), at('06:00'));
    expect(s.next?.id).toBe(GEMEO_IDS.origin);
    expect(s.countdown?.label).toBe('sair às');
    expect(formatClock(s.countdown!.target)).toBe(GEMEO_EXPECTED.startLeaveAt);
    const soon = new Date(
      s.countdown!.target.getTime() - NOTIFICATION_DEFAULTS.lead_minutes * 60_000,
    );
    expect(formatClock(soon)).toBe('06:45');
  });

  it('na estrada depois da origem: nenhum "sair às"', () => {
    const stops = gemeoStops();
    stops[0] = { ...stops[0]!, done_at: 'x', departed_at: 'x' };
    const s = dayState(day, stops, at('10:00'));
    expect(s.onRoad).toBe(true);
    expect(s.leaveAt).toBeNull();
  });

  it('parado no parque: sair às 15:45 (16:30 − 45), aviso de 15 min às 15:30', () => {
    const stops = gemeoStops();
    stops[0] = { ...stops[0]!, done_at: 'x', departed_at: 'x' };
    stops[1] = { ...stops[1]!, done_at: 'y' };
    const s = dayState(day, stops, at('15:00'));
    expect(s.at?.id).toBe(GEMEO_IDS.park);
    expect(s.next?.id).toBe(GEMEO_IDS.hotel);
    expect(formatClock(s.leaveAt!)).toBe(GEMEO_EXPECTED.afterParkLeaveAt);
    expect(formatClock(new Date(s.leaveAt!.getTime() - 15 * 60_000))).toBe('15:30');
  });

  it('o parque fecha às 17:00: aviso de fechamento 60 min antes, igual ao SQL', () => {
    expect(CLOSING_SOON_MINUTES).toBe(GEMEO_EXPECTED.closesSoonMinutes);
    const stops = gemeoStops();
    stops[0] = { ...stops[0]!, done_at: 'x', departed_at: 'x' };
    const s = dayState(day, stops, at(GEMEO_EXPECTED.parkClosesSoonAt));
    expect(s.closingSoon?.stop.id).toBe(GEMEO_IDS.park);
    expect(s.closingSoon?.minutes).toBe(60);
  });
});
