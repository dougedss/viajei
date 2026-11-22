import { describe, expect, it } from 'vitest';
import type { Place } from '../../supabase/functions/_shared/places-schema.ts';
import type { Outing } from '../../supabase/functions/_shared/plan-search-protocol.ts';
import {
  cidadePeloRotulo,
  cidadesDaRodada,
  cidadesDoSul,
  cobrar,
  cobrarPassoAPasso,
  embaralhar,
  PADROES,
  padroesDaRodada,
  roteiroParaJuiz,
  semente,
  TIPOS_CONTRARIOS,
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
  it('tudo certo: as seis verdes (e as do passo a passo, sem nada a conferir, também)', () => {
    const out = cobrar(saida());
    expect(out.slice(0, 6).map((c) => [c.nome, c.ok])).toEqual([
      ['alcance', true],
      ['nada_some', true],
      ['ordem', true],
      ['cidade', true],
      ['brasil', true],
      ['escrita', true],
    ]);
    expect(out.slice(6).every((c) => c.ok)).toBe(true);
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

/** As cobranças do passo a passo (fase 26, a 3.5), caso a caso, sobre saídas fixas. */
describe('as cobranças do passo a passo (fase 26)', () => {
  const WIEGAND = place('g-w', 'Cachoeira Alta', 'José Boiteux', -26.95, -49.65);
  const PERTO = place('g-p', 'Café da Serra', 'José Boiteux', -26.9, -49.6);
  const LONGE = place('g-l', 'Café do Vale', 'Canoinhas', -26.2, -50.4);
  const passoApp = (candidatos = [PERTO]) => ({
    ordem: 2,
    o_que: 'café',
    relacao: 'perto_do_anterior' as const,
    cidade: '',
    anterior: { name: 'Cachoeira Alta', lat: -26.95, lng: -49.65 },
    circulos: [{ lat: -26.95, lng: -49.65, radius_m: 15_000 }],
    candidatos,
    fora_da_cidade: false,
  });
  const stepwise = (over: Partial<Saida> = {}): Saida =>
    saida({
      lugares: [{ ref: 'p1', place: WIEGAND }],
      passeio: outing({
        passos: [
          {
            ordem: 1,
            o_que: 'cachoeira',
            relacao: 'perto_de_casa',
            cidade: '',
            hora_do_dia: '',
            candidatos: ['p1'],
            achou: true,
            fora_da_cidade: false,
          },
          {
            ordem: 2,
            o_que: 'café',
            relacao: 'perto_do_anterior',
            cidade: '',
            hora_do_dia: '',
            candidatos: [],
            achou: false,
            fora_da_cidade: false,
          },
        ],
        pendentes: [{ o_que: 'a feirinha', pergunta: 'Onde fica a feirinha?' }],
      }),
      passos_app: [passoApp()],
      escolhas: [
        { ordem: 1, nomes: ['Cachoeira Alta'] },
        { ordem: 2, nomes: ['Café da Serra'] },
      ],
      paradas: [
        { nome: 'Cachoeira Alta', sem_local: false },
        { nome: 'Café da Serra', sem_local: false },
        { nome: 'A feirinha', sem_local: true },
      ],
      conta: {
        total_min: 250,
        tempo_min: 300,
        estoura: false,
        chegadas: [
          { nome: 'Cachoeira Alta', hora: '09:10', aviso: null, fechada: false },
          { nome: 'Café da Serra', hora: '10:55', aviso: null, fechada: false },
        ],
      },
      ...over,
    });
  const by = (c: ReturnType<typeof cobrar>, nome: string) => c.find((x) => x.nome === nome);

  it('tudo certo: as doze verdes (as seis da D293 e as seis desta fase)', () => {
    const out = cobrar(stepwise());
    expect(out.map((c) => c.nome)).toEqual([
      'alcance',
      'nada_some',
      'ordem',
      'cidade',
      'brasil',
      'escrita',
      'passo_seguinte',
      'ordem_mantida',
      'tempo',
      'horario',
      'pendente_vira_parada',
      'tipo',
    ]);
    expect(out.every((c) => c.ok)).toBe(true);
  });

  it('passo_seguinte: o candidato fora do círculo da relação falha; na cidade, o de fora da cidade falha, salvo dito como vizinho', () => {
    const fora = by(
      cobrarPassoAPasso(stepwise({ passos_app: [passoApp([PERTO, LONGE])] })),
      'passo_seguinte',
    );
    expect(fora?.ok).toBe(false);
    expect(fora?.detalhe).toContain('Café do Vale');
    const cidade = {
      ...passoApp([LONGE]),
      relacao: 'na_cidade' as const,
      cidade: 'Canoinhas',
      circulos: [{ lat: -26.18, lng: -50.39, radius_m: 25_000 }],
    };
    expect(by(cobrarPassoAPasso(stepwise({ passos_app: [cidade] })), 'passo_seguinte')?.ok).toBe(
      true,
    );
    const errada = { ...cidade, candidatos: [PERTO] };
    expect(by(cobrarPassoAPasso(stepwise({ passos_app: [errada] })), 'passo_seguinte')?.ok).toBe(
      false,
    );
    expect(
      by(
        cobrarPassoAPasso(stepwise({ passos_app: [{ ...errada, fora_da_cidade: true }] })),
        'passo_seguinte',
      )?.ok,
    ).toBe(true);
  });

  it('passo_seguinte: a busca do app recusada (a cota) não mede nada e falha; a que rodou e não achou passa', () => {
    const recusada = { ...passoApp([]), estado: 'limit' };
    const c = by(cobrarPassoAPasso(stepwise({ passos_app: [recusada] })), 'passo_seguinte');
    expect(c?.ok).toBe(false);
    expect(c?.detalhe).toBe('a busca do app não rodou: passo 2 (limit)');
    expect(
      by(
        cobrarPassoAPasso(stepwise({ passos_app: [{ ...passoApp([]), estado: 'none' }] })),
        'passo_seguinte',
      )?.ok,
    ).toBe(true);
  });

  it('ordem_mantida: a viagem montada fora da ordem dos passos, ou sem uma escolha, falha; sem montagem, nada a conferir', () => {
    const invertida = stepwise({
      paradas: [
        { nome: 'Café da Serra', sem_local: false },
        { nome: 'Cachoeira Alta', sem_local: false },
        { nome: 'A feirinha', sem_local: true },
      ],
    });
    expect(by(cobrarPassoAPasso(invertida), 'ordem_mantida')?.ok).toBe(false);
    const perdida = stepwise({ paradas: [{ nome: 'Cachoeira Alta', sem_local: false }] });
    expect(by(cobrarPassoAPasso(perdida), 'ordem_mantida')?.detalhe).toContain('Café da Serra');
    const semMontagem: Saida = { ...stepwise() };
    delete semMontagem.paradas;
    expect(by(cobrarPassoAPasso(semMontagem), 'ordem_mantida')?.ok).toBe(true);
  });

  it('tempo: cabe; estoura com a marca passa; estoura sem a marca falha; sem tempo dito, nada a cobrar', () => {
    const cabe = stepwise();
    expect(by(cobrarPassoAPasso(cabe), 'tempo')?.detalhe).toContain('cabe em 5 h');
    const marcado = stepwise({ conta: { ...cabe.conta!, total_min: 400, estoura: true } });
    expect(by(cobrarPassoAPasso(marcado), 'tempo')).toMatchObject({ ok: true });
    expect(by(cobrarPassoAPasso(marcado), 'tempo')?.detalhe).toContain('marcado');
    const semMarca = stepwise({ conta: { ...cabe.conta!, total_min: 400, estoura: false } });
    expect(by(cobrarPassoAPasso(semMarca), 'tempo')?.ok).toBe(false);
    const semTempo = stepwise({ conta: { ...cabe.conta!, tempo_min: null } });
    expect(by(cobrarPassoAPasso(semTempo), 'tempo')?.ok).toBe(true);
  });

  it('horario: a parada fechada na hora prevista precisa do aviso', () => {
    const base = stepwise();
    const fechada = (aviso: string | null) =>
      stepwise({
        conta: {
          ...base.conta!,
          chegadas: [{ nome: 'Café da Serra', hora: '20:10', aviso, fechada: true }],
        },
      });
    expect(by(cobrarPassoAPasso(fechada(null)), 'horario')?.ok).toBe(false);
    expect(
      by(cobrarPassoAPasso(fechada('Fechado às 20:10: abre 08:00–19:00')), 'horario')?.ok,
    ).toBe(true);
  });

  it('pendente_vira_parada: o pendente tem de estar na viagem montada sem local', () => {
    const semPendente = stepwise({
      paradas: [
        { nome: 'Cachoeira Alta', sem_local: false },
        { nome: 'Café da Serra', sem_local: false },
      ],
    });
    const c = by(cobrarPassoAPasso(semPendente), 'pendente_vira_parada');
    expect(c?.ok).toBe(false);
    expect(c?.detalhe).toContain('A feirinha');
    expect(by(cobrarPassoAPasso(stepwise()), 'pendente_vira_parada')?.ok).toBe(true);
  });

  it('tipo: uma banca de produtos coloniais como café, ou um açaí como sorvete, falha; o resto é do juiz', () => {
    const banca = { ...LONGE, name: 'Banca da Colônia', categories: ['grocery_store', 'food'] };
    const out = cobrarPassoAPasso(stepwise({ passos_app: [passoApp([PERTO, banca])] }));
    expect(by(out, 'tipo')?.ok).toBe(false);
    expect(by(out, 'tipo')?.detalhe).toContain('Banca da Colônia (grocery_store ≠ café)');
    const acai = stepwise({
      lugares: [
        { ref: 'p1', place: { ...PERTO, name: 'Açaí da Praça', categories: ['acai_shop'] } },
      ],
      passeio: outing({
        passos: [
          {
            ordem: 1,
            o_que: 'tomar um sorvete',
            relacao: 'perto_de_casa',
            cidade: '',
            hora_do_dia: '',
            candidatos: ['p1'],
            achou: true,
            fora_da_cidade: false,
          },
        ],
      }),
      passos_app: [],
    });
    expect(by(cobrarPassoAPasso(acai), 'tipo')?.ok).toBe(false);
    // um restaurante como "comida caseira" não está na lista curta: fica para o juiz
    const caseira = stepwise({
      passos_app: [passoApp([{ ...PERTO, categories: ['restaurant'] }])],
    });
    expect(by(cobrarPassoAPasso(caseira), 'tipo')?.ok).toBe(true);
    expect(TIPOS_CONTRARIOS.some((t) => t.pedido.test('o melhor cafe que tiver'))).toBe(true);
  });

  it('o roteiro para o juiz leva os passos do app, a conta do tempo, as chegadas e os avisos', () => {
    const texto = roteiroParaJuiz(
      stepwise({
        conta: {
          total_min: 400,
          tempo_min: 300,
          estoura: true,
          chegadas: [
            {
              nome: 'Café da Serra',
              hora: '13:25',
              aviso: 'Pedido de manhã; o roteiro chega às 13:25',
              fechada: false,
            },
          ],
        },
      }),
      ['Cachoeira Alta', 'Café da Serra'],
    );
    expect(texto).toContain(
      'passo 2 procurado pelo app em volta de Cachoeira Alta (perto_do_anterior): Café da Serra (José Boiteux)',
    );
    expect(texto).toContain(
      'a conta do tempo: o passeio dá 6 h 40 e a pessoa tem 5 h: ESTOURA, marcado na tela',
    );
    expect(texto).toContain(
      'chegada prevista: Café da Serra às 13:25 · aviso: Pedido de manhã; o roteiro chega às 13:25',
    );
  });
});
