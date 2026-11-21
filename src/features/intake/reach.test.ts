import { describe, expect, it } from 'vitest';
import {
  hoursOf,
  radiusFor,
  reachOf,
  reachOptions,
  reachQuestion,
  readReach,
  spanOf,
  unreadReach,
} from './reach.ts';

describe('o tempo lido inteiro (fase 25, D273): a tabela da ideia de 20/11, linha a linha', () => {
  it.each([
    // o que a versão de antes não lia
    ['1:30', 1.5],
    ['1:30 no máximo', 1.5],
    ['hora e meia', 1.5],
    // o que a versão de antes lia como 1 h (perdia a meia hora)
    ['1 hora e meia', 1.5],
    ['uma hora e meia', 1.5],
    ['1 hora e 30 minutos', 1.5],
    ['no máximo 1 hora e 30', 1.5],
    // o que já estava certo
    ['1h30', 1.5],
    ['1,5 hora', 1.5],
    ['1.5h', 1.5],
    ['90 min', 1.5],
    ['2 horas', 2],
    ['umas 2h', 2],
    ['duas horas', 2],
    ['meia hora', 0.5],
    ['uns 40 minutos', 0.67],
    // os ruídos
    ['até 2 horas', 2],
    ['uns 45 min, no máximo', 0.75],
    ['duas horas e meia', 2.5],
    ['1h e meia', 1.5],
    ['3 h', 3],
  ])('%s → %s h', (answer, hours) => {
    expect(hoursOf(answer)).toBe(hours);
  });

  it.each(['o dia', 'A manhã', 'aqui perto mesmo, na cidade', '1:3O no maximo', 'tanto faz', ''])(
    '"%s" não é um tempo',
    (answer) => {
      expect(hoursOf(answer)).toBeNull();
    },
  );
});

describe('a regra única do alcance (D273): a parte do dia, a Reach da IA e o raio', () => {
  it('as opções do app e as palavras da pessoa viram a parte do dia', () => {
    expect(
      ['A manhã', 'O dia', 'Até amanhã', 'A tarde', 'Até a noite', 'Hoje à noite'].map(spanOf),
    ).toEqual(['morning', 'day', 'overnight', 'afternoon', 'day', 'evening']);
    expect(spanOf('só até o almoço')).toBe('morning');
    expect(spanOf('voltar antes do almoço')).toBe('morning');
    expect(spanOf('queremos dormir fora')).toBe('overnight');
    expect(spanOf('a tarde toda')).toBe('afternoon');
    expect(spanOf('so a tarde, umas 3 horas')).toBe('afternoon');
    expect(spanOf('2h')).toBeNull();
  });

  it('"2h" e "duas horas" não são "a manhã": são 2 h (o defeito de today.ts)', () => {
    expect(readReach('2h')).toEqual({ span: null, hours: 2 });
    expect(readReach('duas horas')).toEqual({ span: null, hours: 2 });
    expect(readReach('tres horas')).toEqual({ span: null, hours: 3 });
    expect(reachOf(readReach('2h'))).toBe('day');
  });

  it('a Reach para a IA: a manhã e a noite fora como são; a tarde, a noite e as horas são "o dia"', () => {
    expect(reachOf(readReach('A manhã'))).toBe('morning');
    expect(reachOf(readReach('Até amanhã'))).toBe('overnight');
    expect(reachOf(readReach('A tarde'))).toBe('day');
    expect(reachOf(readReach('Hoje à noite'))).toBe('day');
    expect(reachOf(readReach('1h30'))).toBe('day');
    expect(reachOf(null)).toBe('day');
  });

  it('um raio só: as horas pela estimativa dos cartões; a parte do dia; o padrão', () => {
    expect(radiusFor('today', readReach('1h30'))).toBe(63);
    expect(radiusFor('today', readReach('1 hora e meia'))).toBe(63);
    expect(radiusFor('plan', readReach('2 horas'))).toBe(92);
    expect(radiusFor('today', readReach('A manhã'))).toBe(50);
    expect(radiusFor('today', readReach('A tarde'))).toBe(50);
    expect(radiusFor('today', readReach('Hoje à noite'))).toBe(50);
    expect(radiusFor('today', readReach('O dia'))).toBe(120);
    expect(radiusFor('today', readReach('Até amanhã'))).toBe(220);
    // sem resposta entendida não há raio padrão em silêncio na conversa (D274); o padrão fica para a
    // IA que não perguntou o alcance (uma viagem com área ou sem vontade)
    expect(radiusFor('plan', null)).toBe(200);
    expect(radiusFor('today', null)).toBe(120);
    // "so a tarde, umas 3 horas": as horas ditas valem (3 h de ida, como a D228)
    expect(radiusFor('today', readReach('so a tarde, umas 3 horas'))).toBe(150);
  });
});

describe('a pergunta de alcance do app pela hora (D275), e a resposta não entendida (D274)', () => {
  it('oferece o que ainda cabe no dia', () => {
    expect(reachOptions('08:30')).toEqual(['A manhã', 'O dia', 'Até amanhã']);
    expect(reachOptions('10:59')).toEqual(['A manhã', 'O dia', 'Até amanhã']);
    expect(reachOptions('11:00')).toEqual(['A tarde', 'Até a noite', 'Até amanhã']);
    expect(reachOptions('16:59')).toEqual(['A tarde', 'Até a noite', 'Até amanhã']);
    expect(reachOptions('17:00')).toEqual(['Hoje à noite', 'Até amanhã']);
    expect(reachOptions('23:30')).toEqual(['Hoje à noite', 'Até amanhã']);
    expect(reachQuestion('09:00')).toEqual({
      text: 'Quanto tempo vocês têm?',
      options: ['A manhã', 'O dia', 'Até amanhã'],
      topic: 'reach',
    });
    // e a regra de leitura entende cada opção que o app oferece
    for (const time of ['08:00', '14:00', '20:00']) {
      for (const option of reachOptions(time)) expect(readReach(option)).not.toBeNull();
    }
  });

  it('a resposta livre que não vira tempo nem parte do dia é "não entendi"; a opção é sempre entendida', () => {
    const ask = [
      {
        text: 'Até quanto tempo de carro?',
        options: ['1 hora', '2 horas'],
        topic: 'reach' as const,
      },
    ];
    expect(unreadReach(ask, ['1:3O no maximo'])).toBe(0);
    expect(unreadReach(ask, ['aqui perto mesmo, na cidade'])).toBe(0);
    expect(unreadReach(ask, ['1h30'])).toBeNull();
    expect(unreadReach(ask, ['1 hora'])).toBeNull();
    // em branco não é resposta (canPlan cobra); outra pergunta não é de alcance
    expect(unreadReach(ask, [''])).toBeNull();
    expect(
      unreadReach([{ text: 'Quando vocês vão?', options: ['sábado'], topic: 'when' }], ['sei lá']),
    ).toBeNull();
    // a pergunta do app, sem topic numa conversa guardada por uma versão de antes, também é de alcance
    expect(unreadReach([{ text: 'Quanto tempo vocês têm?', options: ['O dia'] }], ['nenhum'])).toBe(
      0,
    );
    expect(
      unreadReach([{ text: 'Quanto tempo vocês têm?', options: ['O dia'] }], ['so a tarde']),
    ).toBeNull();
  });
});
