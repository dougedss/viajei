import { describe, expect, it } from 'vitest';
import type { LngLat } from '@shared/geo.ts';
import {
  minutesOfReach,
  outingAccount,
  startFor,
  startText,
  overBudget,
  timeBudget,
  totalText,
  windowNotice,
  type OutingInput,
  type OutingStop,
} from './outing-time.ts';
import { readReach } from './reach.ts';

/**
 * A conta do passeio todo (fase 26, a 3.3): a estrada, a permanência, a espera pelo horário, o total; a
 * marca do que estoura; as partes do dia em minutos; a janela da hora do dia e o aviso. Desde a correção
 * de 22/11/2026: a estrada é a medida, que quem chama dá (D310; sem medida, não há conta); a hora dita
 * fixa a chegada e a saída é calculada para trás (D311); o tempo em cada lugar pode ser o dito (D312).
 */
// Major Vieira → uma cachoeira → um café perto dela → casa (a 2026-12-05 é um sábado)
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
const at = (stop: OutingStop): LngLat => stop.at ?? [0, 0];
/** A estrada medida, pelos pares: casa → cachoeira 40, cachoeira → café 15, café → casa 45; o resto 40. */
const MEASURED: OutingInput['drive'] = (a, b) => {
  const is = (p: LngLat, q: LngLat) => p[0] === q[0] && p[1] === q[1];
  if (is(a, HOME) && is(b, at(CACHOEIRA))) return 40;
  if (is(a, at(CACHOEIRA)) && is(b, at(CAFE))) return 15;
  if (is(a, at(CAFE)) && is(b, HOME)) return 45;
  return 40;
};

describe('a conta do passeio', () => {
  it('a estrada medida de casa ao primeiro, entre os passos e de volta, mais a permanência de cada tipo', () => {
    const acc = outingAccount({
      home: HOME,
      stops: [CACHOEIRA, { ...CAFE, hours: null }],
      start: '08:00',
      date: '2026-12-05',
      drive: MEASURED,
    });
    // natureza 90 + comida 75; a estrada 40 + 15 + 45
    expect(acc).toMatchObject({ road: 100, dwell: 165, wait: 0, total: 265, back: '12:25' });
    expect(acc?.arrivals.map((a) => [a.name, a.at])).toEqual([
      ['Cachoeira Alta', '08:40'],
      ['Café do Relógio', '10:25'],
    ]);
    expect(acc && totalText(acc)).toBe(
      'O passeio dá cerca de 4 h 25: 1 h 40 de estrada e 2 h 45 nos lugares',
    );
    expect(acc && startText(acc)).toBe('Saída às 08:00');
  });

  it('um trecho sem medida (ou sem estrada) não tem conta: nenhum total de chute', () => {
    const noBack: OutingInput['drive'] = (a, b) => (b === HOME ? null : MEASURED(a, b));
    expect(
      outingAccount({
        home: HOME,
        stops: [CACHOEIRA],
        start: '08:00',
        date: null,
        drive: noBack,
      }),
    ).toBeNull();
    expect(
      outingAccount({
        home: HOME,
        stops: [CACHOEIRA],
        start: '08:00',
        date: null,
        drive: () => null,
      }),
    ).toBeNull();
  });

  it('o tempo dito num lugar vale acima do padrão do tipo', () => {
    const acc = outingAccount({
      home: HOME,
      stops: [{ ...CACHOEIRA, dwell: 30 }],
      start: '08:00',
      date: null,
      drive: () => 25,
    });
    expect(acc).toMatchObject({ road: 50, dwell: 30, total: 80, back: '09:20' });
  });

  it('a hora dita fixa a chegada: a saída é calculada para trás pela estrada e pelo tempo nos lugares de antes', () => {
    const acc = outingAccount({
      home: HOME,
      stops: [CACHOEIRA, { ...CAFE, hours: null, atTime: '14:00' }],
      start: '08:00',
      date: null,
      drive: MEASURED,
    });
    // 14:00 − 15 (a estrada da cachoeira ao café) − 90 (a cachoeira) − 40 (de casa) = 11:35
    expect(acc).toMatchObject({ start: '11:35', anchor: { name: 'Café do Relógio', at: '14:00' } });
    expect(acc?.arrivals.map((a) => [a.at, a.early, a.late])).toEqual([
      ['12:15', 0, null],
      ['14:00', 0, null],
    ]);
    expect(acc && startText(acc)).toBe('Saída às 11:35, para estar em Café do Relógio às 14:00');
  });

  it('a hora de sair dita fica: chegar antes da hora dita é esperar; chegar depois é o aviso', () => {
    const early = outingAccount({
      home: HOME,
      stops: [{ ...CAFE, hours: null, atTime: '14:00' }],
      start: '12:00',
      startRule: 'said',
      date: null,
      drive: () => 40,
    });
    expect(early).toMatchObject({ start: '12:00', anchor: null, wait: 80 });
    expect(early?.arrivals[0]).toMatchObject({ at: '12:40', early: 80, late: null });
    expect(early && totalText(early)).toBe(
      'O passeio dá cerca de 3 h 55: 1 h 20 de estrada, 1 h 15 nos lugares e 1 h 20 de espera',
    );
    const late = outingAccount({
      home: HOME,
      stops: [{ ...CAFE, hours: null, atTime: '12:00' }],
      start: '12:00',
      startRule: 'said',
      date: null,
      drive: () => 40,
    });
    expect(late?.arrivals[0]).toMatchObject({
      at: '12:40',
      early: 0,
      late: 'Chega às 12:40, e vocês queriam às 12:00',
    });
  });

  it('o horário do lugar impõe: chegar antes de abrir espera até abrir; sem abrir mais nesse dia, não cabe', () => {
    // o café só abre às 13:00 no sábado: saindo às 08:00, chega às 08:40, e a espera entra na conta
    const waits = outingAccount({
      home: HOME,
      stops: [CAFE],
      start: '08:00',
      date: '2026-12-05',
      drive: () => 40,
    });
    expect(waits?.arrivals[0]).toMatchObject({ at: '08:40', closed: false, waited: 260 });
    expect(waits?.wait).toBe(260);
    expect(waits && totalText(waits)).toContain('de espera');
    // chegando depois das 19:00, não abre mais: marcado, e sem espera
    const late = outingAccount({
      home: HOME,
      stops: [CAFE],
      start: '19:30',
      date: '2026-12-05',
      drive: () => 40,
    });
    expect(late?.arrivals[0]).toMatchObject({ closed: true, waited: 0 });
    // sem períodos, nada se afirma
    const open = outingAccount({
      home: HOME,
      stops: [{ ...CAFE, hours: null }],
      start: '08:00',
      date: '2026-12-05',
      drive: () => 40,
    });
    expect(open?.arrivals[0]).toMatchObject({ closed: false, waited: 0 });
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
      drive: MEASURED,
    });
    expect(acc?.arrivals[0]?.outsideWindow).toBe('Chega às 08:40, e vocês queriam à noite');
    // com a hora exata dita, a janela da parte do dia não diz mais nada
    const said = outingAccount({
      home: HOME,
      stops: [{ ...CACHOEIRA, dayTime: 'noite', atTime: '18:00' }],
      start: '08:00',
      date: '2026-12-05',
      drive: MEASURED,
    });
    expect(said?.arrivals[0]).toMatchObject({ at: '18:00', outsideWindow: null });
  });

  it('o pendente sem lugar não entra na estrada nem no horário, só na permanência; sem casa, sem a volta', () => {
    const acc = outingAccount({
      home: null,
      stops: [{ name: 'A feirinha', kind: 'event', at: null }, CACHOEIRA],
      start: '09:00',
      date: '2026-12-05',
      drive: MEASURED,
    });
    expect(acc?.road).toBe(0);
    expect(acc?.dwell).toBe(120 + 90);
    expect(acc?.back).toBeNull();
    expect(acc?.arrivals[0]).toMatchObject({ name: 'A feirinha', at: '09:00' });
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
    const base = { home: HOME, stops: [CAFE], start: '08:00', drive: () => 40 };
    const semDia = outingAccount({ ...base, date: null });
    expect(semDia?.wait).toBe(0);
    expect(semDia?.arrivals[0]).toMatchObject({ waited: 0, closed: false });
    // com o dia (a saída de hoje, ou depois da escrita), entra
    expect(outingAccount({ ...base, date: '2026-12-05' })?.wait).toBeGreaterThan(0);
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
