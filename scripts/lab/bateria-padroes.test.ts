import { describe, expect, it } from 'vitest';
import type { Place } from '../../supabase/functions/_shared/places-schema.ts';
import type { Outing } from '../../supabase/functions/_shared/plan-search-protocol.ts';
import {
  cidadePeloRotulo,
  cidadesDaRodada,
  cidadesDoSul,
  cobrar,
  embaralhar,
  PADROES,
  padroesDaRodada,
  roteiroParaJuiz,
  semente,
  type Saida,
} from './bateria-padroes.ts';

/**
 * A parte pura da bateria (fase 27): os padrões giram com a semente (dez diferentes por rodada, a rodada
 * seguinte com outra forma), as cidades são reais e do Sul, e as cobranças objetivas pegam o que tem de
 * pegar sem nada de pessoa.
 */
const place = (id: string, name: string, city: string, lat: number, lng: number): Place => ({
  id,
  name,
  lat,
  lng,
  categories: ['cafe'],
  city,
  address: null,
  opening_hours: null,
  website: null,
  osm: null,
  distance_m: null,
  provider: 'google',
  google_place_id: id,
});
const CANOINHAS = { lat: -26.1765, lng: -50.39 };
const outing = (over: Partial<Outing> = {}): Outing => ({
  passos: [
    {
      ordem: 1,
      o_que: 'café',
      relacao: 'na_cidade',
      cidade: 'Canoinhas',
      hora_do_dia: '',
      candidatos: ['p1'],
      achou: true,
      fora_da_cidade: false,
    },
  ],
  pendentes: [{ o_que: 'a feirinha', pergunta: 'Onde fica a feirinha?' }],
  perguntas: [],
  destino: '',
  origem: '',
  ...over,
});
const saida = (over: Partial<Saida> = {}): Saida => ({
  origem: CANOINHAS,
  lugares: [{ ref: 'p1', place: place('g1', 'Café do Relógio', 'Canoinhas', -26.177, -50.391) }],
  passeio: outing(),
  perguntas: 0,
  write: {
    trip: { name: 'Café em Canoinhas', start_date: '2026-12-05', end_date: '2026-12-05' },
    days: [
      { date: '2026-12-05', title: 'Café', start: '09:00', stops: [{ ref: 'e1', note: 'o café' }] },
    ],
    suggestions: [],
    quests: [],
    checklist_before: ['Escolher onde fica a feirinha'],
    checklist_pack: [],
  },
  pendentes: ['A feirinha'],
  ...over,
});

describe('os padrões e a semente', () => {
  it('dez padrões distintos por rodada, e a rodada seguinte muda a forma (outra ordem, outros de fora)', () => {
    const a = padroesDaRodada(semente('2026-11-22', 1));
    const b = padroesDaRodada(semente('2026-11-22', 2));
    const c = padroesDaRodada(semente('2026-11-22', 1));
    expect(a).toHaveLength(10);
    expect(new Set(a).size).toBe(10);
    expect(a.every((p) => PADROES.includes(p))).toBe(true);
    expect(a).toEqual(c);
    expect(a).not.toEqual(b);
    expect(PADROES.length).toBeGreaterThan(10);
  });

  it('o embaralhamento é determinístico e não perde nem repete item', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const x = embaralhar(items, 'x');
    expect(embaralhar(items, 'x')).toEqual(x);
    expect([...x].sort()).toEqual(items);
    expect(embaralhar(items, 'y')).not.toEqual(x);
  });

  it('os padrões não trazem nome, telefone nem endereço de pessoa', () => {
    expect(PADROES.join('\n')).not.toMatch(/\(\d{2}\)|\d{4}-\d{4}|rua |r\. /i);
  });
});

describe('as cidades reais do Sul', () => {
  it('vêm do dado embutido do app: SC, PR e RS, com mais de 20 mil habitantes, e a rodada varia as 30 oferecidas', () => {
    const cidades = cidadesDoSul();
    expect(cidades.length).toBeGreaterThan(100);
    expect(cidades.every((c) => ['SC', 'PR', 'RS'].includes(c.uf) && c.pop >= 20_000)).toBe(true);
    expect(cidades.some((c) => c.nome === 'Canoinhas' && c.uf === 'SC')).toBe(true);
    const a = cidadesDaRodada(cidades, semente('2026-11-22', 1));
    const b = cidadesDaRodada(cidades, semente('2026-11-22', 2));
    expect(a).toHaveLength(30);
    expect(a.map((c) => c.nome)).not.toEqual(b.map((c) => c.nome));
    expect(cidadePeloRotulo(cidades, 'canoinhas, sc')?.uf).toBe('SC');
    expect(cidadePeloRotulo(cidades, 'Canoinhas')?.nome).toBe('Canoinhas');
    expect(cidadePeloRotulo(cidades, 'Cidade que não existe, XX')).toBeNull();
  });
});

describe('as cobranças', () => {
  it('tudo certo: as seis verdes', () => {
    const out = cobrar(saida());
    expect(out.map((c) => [c.nome, c.ok])).toEqual([
      ['alcance', true],
      ['nada_some', true],
      ['ordem', true],
      ['cidade', true],
      ['brasil', true],
      ['escrita', true],
    ]);
  });

  it('um candidato longe (Mafra de Portugal) cai no alcance e no Brasil; a cidade errada cai na cidade', () => {
    const out = cobrar(
      saida({
        lugares: [{ ref: 'p1', place: place('g1', 'Café Lisboeta', 'Mafra', 38.93, -9.33) }],
      }),
    );
    const by = Object.fromEntries(out.map((c) => [c.nome, c]));
    expect(by.alcance?.ok).toBe(false);
    expect(by.brasil?.ok).toBe(false);
    expect(by.cidade?.ok).toBe(false);
    expect(by.cidade?.detalhe).toContain('Mafra ≠ Canoinhas');
  });

  it('o passo dito como achado sem candidato, e a ordem com buraco, falham; os vizinhos ditos passam na cidade', () => {
    const out = cobrar(
      saida({
        passeio: outing({
          passos: [
            {
              ordem: 1,
              o_que: 'café',
              relacao: 'na_cidade',
              cidade: 'Canoinhas',
              hora_do_dia: '',
              candidatos: [],
              achou: true,
              fora_da_cidade: false,
            },
            {
              ordem: 3,
              o_que: 'salão',
              relacao: 'na_cidade',
              cidade: 'Três Barras',
              hora_do_dia: '',
              candidatos: ['p1'],
              achou: true,
              fora_da_cidade: true,
            },
          ],
        }),
      }),
    );
    const by = Object.fromEntries(out.map((c) => [c.nome, c]));
    expect(by.nada_some?.ok).toBe(false);
    expect(by.ordem?.ok).toBe(false);
    expect(by.cidade?.ok).toBe(true);
  });

  it('nenhum passo e nenhuma pergunta é sumir em silêncio; com pergunta, não', () => {
    const vazio = outing({ passos: [], pendentes: [] });
    expect(cobrar(saida({ passeio: vazio })).find((c) => c.nome === 'nada_some')?.ok).toBe(false);
    expect(
      cobrar(saida({ passeio: vazio, perguntas: 1 })).find((c) => c.nome === 'nada_some')?.ok,
    ).toBe(true);
  });

  it('a escrita que fala do pendente falha (o título, a missão, a mala), e a lista que ajuda a resolver passa', () => {
    const write = saida().write!;
    const falha = cobrar(
      saida({
        write: {
          ...write,
          trip: { ...write.trip, name: 'Café e feirinha' },
          quests: [{ text: 'Achar algo na feirinha', ref: null }],
          checklist_pack: ['Sacola para a feirinha'],
        },
      }),
    ).find((c) => c.nome === 'escrita');
    expect(falha?.ok).toBe(false);
    expect(falha?.detalhe).toContain('nome da viagem');
    expect(falha?.detalhe).toContain('missão');
    expect(falha?.detalhe).toContain('mala');
    expect(cobrar(saida({ write: null })).find((c) => c.nome === 'escrita')?.detalhe).toBe(
      'a escrita não rodou',
    );
  });

  it('o roteiro para o juiz: os passos com os candidatos, os pendentes, as perguntas e a escrita, só nomes públicos', () => {
    const texto = roteiroParaJuiz(saida(), ['Café do Relógio']);
    expect(texto).toContain(
      'passo 1: café · na_cidade · Canoinhas · candidatos: Café do Relógio (Canoinhas)',
    );
    expect(texto).toContain('pendente: a feirinha · pergunta: Onde fica a feirinha?');
    expect(texto).toContain('viagem escrita: "Café em Canoinhas"');
    expect(texto).toContain('antes de viajar: Escolher onde fica a feirinha');
  });

  it('o juiz lê o que a pessoa respondeu, e sabe quando a escrita não rodou apesar dos escolhidos', () => {
    const texto = roteiroParaJuiz(
      saida({ respostas: ['O que vocês querem fazer? → um café'], write: null }),
      ['Café do Relógio'],
    );
    expect(texto).toContain('a pessoa respondeu: O que vocês querem fazer? → um café');
    expect(texto).toContain(
      'viagem escrita: não houve (a escrita não rodou; julgue os lugares escolhidos)',
    );
    expect(roteiroParaJuiz(saida({ write: null }), [])).toContain(
      'viagem escrita: não houve (nada escolhido)',
    );
  });
});
