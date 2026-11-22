import { describe, expect, it } from 'vitest';
import {
  minutesOfReach,
  outingAccount,
  startFor,
  overBudget,
  timeBudget,
  totalText,
  windowNotice,
  type OutingStop,
} from './outing-time.ts';
import { readReach } from './reach.ts';

/**
 * A conta do passeio todo (fase 26, a 3.3): a estrada, a permanência, a espera pelo horário, o total; a
 * marca do que estoura; as partes do dia em minutos; a janela da hora do dia e o aviso.
 */
// Major Vieira → uma cachoeira a ~35 km → um café a ~10 km dela → casa (a 2026-12-05 é um sábado)
const HOME: [number, number] = [-50.33, -26.37];
const CACHOEIRA: OutingStop = { name: 'Cachoeira Alta', kind: 'nature', at: [-50.05, -26.2] };
const CAFE: OutingStop = {
  name: 'Café do Relógio',
  kind: 'food',
  at: [-50.0, -26.15],
  hours: [
    { day: 6, open: '13:00', close: '19:00' },
    { day: 1, open: '08:00', close: '19:00' },
  ],
};

describe('a conta do passeio', () => {
  it('a estrada de casa ao primeiro, entre os passos e de volta, mais a permanência de cada tipo', () => {
    const acc = outingAccount({
      home: HOME,
      stops: [CACHOEIRA, { ...CAFE, hours: null }],
      start: '08:00',
      date: '2026-12-05',
    });
    // natureza 90 + comida 75
    expect(acc.dwell).toBe(165);
    expect(acc.wait).toBe(0);
    expect(acc.road).toBeGreaterThan(60);
    expect(acc.total).toBe(acc.road + acc.dwell);
    expect(acc.arrivals.map((a) => a.name)).toEqual(['Cachoeira Alta', 'Café do Relógio']);
    expect((acc.arrivals[0]?.at ?? '') > '08:00').toBe(true);
    expect(acc.back).not.toBeNull();
    expect(totalText(acc)).toMatch(
      /^O passeio dá cerca de \d+ h( \d\d)?: \d+ h( \d\d)? de estrada e 2 h 45 nos lugares$/,
    );
  });

  it('o horário do lugar impõe: chegar antes de abrir espera até abrir; sem abrir mais nesse dia, não cabe', () => {
    // o café só abre às 13:00 no sábado: saindo às 08:00, a chegada é antes, e a espera entra na conta
    const waits = outingAccount({ home: HOME, stops: [CAFE], start: '08:00', date: '2026-12-05' });
    const cafe = waits.arrivals[0];
    expect(cafe?.closed).toBe(false);
    expect(cafe?.waited).toBeGreaterThan(0);
    expect(waits.wait).toBe(cafe?.waited);
    expect(totalText(waits)).toContain('esperando abrir');
    // chegando depois das 19:00, não abre mais: marcado, e sem espera
    const late = outingAccount({ home: HOME, stops: [CAFE], start: '19:30', date: '2026-12-05' });
    expect(late.arrivals[0]).toMatchObject({ closed: true, waited: 0 });
    // sem períodos, nada se afirma
    const open = outingAccount({
      home: HOME,
      stops: [{ ...CAFE, hours: null }],
      start: '08:00',
      date: '2026-12-05',
    });
    expect(open.arrivals[0]).toMatchObject({ closed: false, waited: 0 });
  });

  it('a hora do dia dita vira a janela: "voltar antes do almoço" com a padaria às 13:25 avisa; dentro, nada', () => {
    expect(windowNotice('manha', '13:25')).toBe('Chega às 13:25, e vocês queriam de manhã');
    expect(windowNotice('manha', '10:00')).toBeNull();
    expect(windowNotice('noite', '15:00')).toBe('Chega às 15:00, e vocês queriam à noite');
    expect(windowNotice('almoco', '12:30')).toBeNull();
    expect(windowNotice('tarde', '12:00')).toBeNull();
    expect(windowNotice('tarde', '18:00')).toBe('Chega às 18:00, e vocês queriam à tarde');
    expect(windowNotice(undefined, '15:00')).toBeNull();
    expect(windowNotice('', '15:00')).toBeNull();
    const acc = outingAccount({
      home: HOME,
      stops: [{ ...CACHOEIRA, dayTime: 'noite' }],
      start: '08:00',
      date: '2026-12-05',
    });
    expect(acc.arrivals[0]?.outsideWindow).toMatch(/^Chega às 0\d:\d\d, e vocês queriam à noite$/);
  });

  it('o pendente sem lugar não entra na estrada nem no horário, só na permanência; sem casa, sem a volta', () => {
    const acc = outingAccount({
      home: null,
      stops: [{ name: 'A feirinha', kind: 'event', at: null }, CACHOEIRA],
      start: '09:00',
      date: '2026-12-05',
    });
    expect(acc.road).toBe(0);
    expect(acc.dwell).toBe(120 + 90);
    expect(acc.back).toBeNull();
    expect(acc.arrivals[0]).toMatchObject({ name: 'A feirinha', at: '09:00' });
  });
});

describe('o tempo que a pessoa tem', () => {
  it('as partes do dia em minutos (a manhã 4 h, a tarde 5 h, até a noite e o dia 10 h, até amanhã sem teto); as horas como ditas', () => {
    expect(minutesOfReach(readReach('A manhã'))).toBe(240);
    expect(minutesOfReach(readReach('Até o almoço'))).toBe(240);
    expect(minutesOfReach(readReach('a tarde'))).toBe(300);
    expect(minutesOfReach(readReach('Até a noite'))).toBe(600);
    expect(minutesOfReach(readReach('O dia'))).toBe(600);
    expect(minutesOfReach(readReach('Até amanhã'))).toBeNull();
    expect(minutesOfReach(readReach('1:30 no máximo'))).toBe(90);
    expect(minutesOfReach(readReach('umas 3 horas'))).toBe(180);
    expect(minutesOfReach(readReach('1 hora e meia'))).toBe(90);
    expect(minutesOfReach(null)).toBeNull();
  });

  it('a resposta vale acima do que a IA leu; sem nenhuma, null (a conta sem comparação); a não entendida cai no que a IA leu', () => {
    expect(timeBudget({ answer: 'a tarde', tempo_min: 90 })).toEqual({
      minutes: 300,
      label: 'a tarde',
    });
    expect(timeBudget({ answer: null, tempo_min: 90 })).toEqual({ minutes: 90, label: '1 h 30' });
    expect(timeBudget({ answer: 'Até amanhã', tempo_min: 0 })).toEqual({
      minutes: null,
      label: 'até amanhã',
    });
    expect(timeBudget({ answer: '', tempo_min: 0 })).toBeNull();
    expect(timeBudget({ answer: 'sei lá', tempo_min: 120 })).toEqual({
      minutes: 120,
      label: '2 h',
    });
  });

  it('o que estoura: o total maior que o tempo; sem teto, nada estoura', () => {
    expect(overBudget(310, 300)).toBe(true);
    expect(overBudget(300, 300)).toBe(false);
    expect(overBudget(900, null)).toBe(false);
  });
});

describe('a conta antes da escrita (D307)', () => {
  it('sem o dia (uma viagem antes da escrita), o horário dos lugares não entra: nada de esperar abrir num dia suposto', () => {
    const semDia = outingAccount({ home: HOME, stops: [CAFE], start: '08:00', date: null });
    expect(semDia.wait).toBe(0);
    expect(semDia.arrivals[0]).toMatchObject({ waited: 0, closed: false });
    // com o dia (a saída de hoje, ou depois da escrita), entra
    expect(
      outingAccount({ home: HOME, stops: [CAFE], start: '08:00', date: '2026-12-05' }).wait,
    ).toBeGreaterThan(0);
  });

  it('a hora de sair pela hora do dia do primeiro passo: o almoço às 11:30, a tarde ao meio-dia, a noite às 18:00; de manhã ou sem, as 08:00', () => {
    expect(startFor('almoco')).toBe('11:30');
    expect(startFor('tarde')).toBe('12:00');
    expect(startFor('noite')).toBe('18:00');
    expect(startFor('manha')).toBe('08:00');
    expect(startFor(undefined)).toBe('08:00');
    expect(startFor('', '09:15')).toBe('09:15');
  });
});
