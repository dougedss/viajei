import { describe, expect, it } from 'vitest';
import { dayBar, dayLabel, formatDayBar, overlayCard } from './screen.ts';

const days = [
  { id: 'd1', date: '2026-12-11' },
  { id: 'd2', date: '2026-12-12' },
  { id: 'd3', date: '2026-12-13' },
];

describe('a barra do dia', () => {
  it('escreve a data curta em pt-BR, sem pontos, e o número do dia', () => {
    expect(formatDayBar('2026-12-12')).toBe('sáb, 12 dez');
    expect(dayLabel('2026-12-12', 1)).toBe('sáb, 12 dez · Dia 2');
    expect(dayLabel('2026-12-11', 0)).toBe('sex, 11 dez · Dia 1');
  });

  it('durante a viagem mostra hoje, e "Hoje" só aparece quando a pessoa saiu dele', () => {
    const hoje = dayBar({ days, today: '2026-12-12', overrideId: null });
    expect(hoje.day?.id).toBe('d2');
    expect(hoje.index).toBe(1);
    expect(hoje.isToday).toBe(true);
    expect(hoje.showToday).toBe(false);
    expect(hoje.canPrev).toBe(true);
    expect(hoje.canNext).toBe(true);

    const outro = dayBar({ days, today: '2026-12-12', overrideId: 'd3' });
    expect(outro.day?.id).toBe('d3');
    expect(outro.isToday).toBe(false);
    expect(outro.showToday).toBe(true);
    expect(outro.canNext).toBe(false);
    expect(outro.label).toBe('dom, 13 dez · Dia 3');
  });

  it('antes da viagem é o Dia 1 e depois dela o último, sem "Hoje" (não existe hoje)', () => {
    const antes = dayBar({ days, today: '2026-12-01', overrideId: null });
    expect(antes.day?.id).toBe('d1');
    expect(antes.showToday).toBe(false);
    expect(antes.canPrev).toBe(false);
    const depois = dayBar({ days, today: '2026-12-20', overrideId: 'd1' });
    expect(depois.day?.id).toBe('d1');
    expect(depois.showToday).toBe(false);
  });

  it('um id que não existe cai no dia automático; sem dias, nada', () => {
    expect(dayBar({ days, today: '2026-12-12', overrideId: 'x' }).day?.id).toBe('d2');
    const vazio = dayBar({ days: [], today: '2026-12-12', overrideId: null });
    expect(vazio.day).toBeNull();
    expect(vazio.index).toBe(-1);
    expect(vazio.label).toBe('');
    expect(vazio.canPrev).toBe(false);
    expect(vazio.canNext).toBe(false);
  });
});

describe('um cartão por vez sobre a maquete', () => {
  const none = { since: false, passed: false, position: false, memory: false, retro: false };

  it('o que aconteceu vem antes da pergunta, da posição, do "Como foi?" e da retrospectiva', () => {
    expect(overlayCard({ ...none, since: true, passed: true, memory: true })).toBe('since');
    expect(overlayCard({ ...none, passed: true, position: true, retro: true })).toBe('passed');
    expect(overlayCard({ ...none, position: true, memory: true })).toBe('position');
    expect(overlayCard({ ...none, memory: true, retro: true })).toBe('memory');
    expect(overlayCard({ ...none, retro: true })).toBe('retro');
  });

  it('sem candidato, nada', () => {
    expect(overlayCard(none)).toBeNull();
  });
});
