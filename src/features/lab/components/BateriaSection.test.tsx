import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { BateriaRunRow } from '../queries.ts';
import { BateriaSection } from './BateriaSection.tsx';

afterEach(cleanup);

/**
 * A seção da bateria no painel (fase 27): a rodada com a nota média e o custo, cada pedido com o texto,
 * o padrão, os passos lidos, os candidatos, o pendente, as cobranças e a nota do juiz; a rodada que
 * falhou diz qual cobrança.
 */
const run = (over: Partial<BateriaRunRow> = {}): BateriaRunRow => ({
  id: 'r1',
  target: 'production',
  source: 'bateria',
  commit_sha: 'abc1234',
  status: 'fail',
  summary:
    'bateria 1 de 2026-11-22: 9 de 10 pedidos verdes (falharam: pedido_02); juiz 8,1/10; US$ 0,42',
  started_at: '2026-11-22T13:00:00.000Z',
  finished_at: '2026-11-22T13:06:00.000Z',
  diagnostics: { rodada: 1, semente: '2026-11-22#1', custo_total_usd: 0.42, juiz_media: 8.1 },
  lab_checks: [
    {
      scenario: 'pedido_01',
      status: 'pass',
      latency_ms: 20_000,
      detail: 'ok',
      data: {
        texto: 'amanha quero tomar um cafe e cortar o cabelo em canoinhas',
        padrao: 'uma cidade dita com dois ou três tipos de lugar',
        cidade_saida: 'Major Vieira, SC',
        planejador: {
          numeros: { fonte: 'google', buscas: 2 },
          passos: [
            {
              ordem: 1,
              o_que: 'café',
              relacao: 'na_cidade',
              cidade: 'Canoinhas',
              achou: true,
              fora_da_cidade: false,
              candidatos: ['Café do Relógio (Canoinhas) 4.6'],
            },
            {
              ordem: 2,
              o_que: 'cortar o cabelo',
              relacao: 'na_cidade',
              cidade: 'Canoinhas',
              achou: true,
              fora_da_cidade: false,
              candidatos: ['Salão Luz (Canoinhas) 4.8'],
            },
          ],
          pendentes: [],
          perguntas: [],
        },
        roteiro: { nome: 'Café em Canoinhas', dias: [{ titulo: 'Café', paradas: 4 }] },
        cobrancas: [
          { nome: 'alcance', ok: true, detalhe: 'x' },
          { nome: 'escrita', ok: true, detalhe: 'y' },
        ],
        juiz: { nota: 9, motivos: ['os dois tipos entraram'], problemas: [] },
        custo: { total_usd: 0.05 },
      },
    },
    {
      scenario: 'pedido_02',
      status: 'fail',
      latency_ms: 25_000,
      detail:
        '"vou pra joinville, parar pra um cafe no caminho" · FALHOU: brasil (fora do Brasil: Café Lisboeta)',
      data: {
        texto: 'vou pra joinville, parar pra um cafe no caminho',
        padrao: 'ir para uma cidade de destino com uma parada no caminho',
        cidade_saida: 'Papanduva, SC',
        planejador: {
          passos: [
            {
              ordem: 1,
              o_que: 'café',
              relacao: 'no_caminho',
              cidade: '',
              achou: true,
              fora_da_cidade: false,
              candidatos: ['Café Lisboeta (Mafra)'],
            },
          ],
          pendentes: [{ o_que: 'a feirinha', pergunta: 'Onde fica a feirinha?' }],
          perguntas: ['Para qual cidade vocês vão?'],
        },
        roteiro: 'nada escolhido: a escrita não rodou',
        cobrancas: [{ nome: 'brasil', ok: false, detalhe: 'fora do Brasil: Café Lisboeta' }],
        juiz: { nota: 3, motivos: [], problemas: ['o café ficou em Portugal'] },
        custo: { total_usd: 0.04 },
      },
    },
  ],
  ...over,
});

describe('BateriaSection', () => {
  it('a rodada com a média do juiz e o custo; cada pedido com o texto, os passos, as cobranças e a nota', () => {
    render(<BateriaSection runs={[run()]} />);
    const rodada = screen.getByText(/rodada 1/).closest('details');
    expect(rodada?.textContent).toContain('8.1/10');
    expect(rodada?.textContent).toContain('US$ 0.42');
    const p1 = screen.getByText(/amanha quero tomar um cafe/, { selector: 'b' }).closest('li');
    expect(p1?.textContent).toContain('saindo de Major Vieira, SC');
    expect(p1?.textContent).toContain('padrão: uma cidade dita com dois ou três tipos de lugar');
    expect(p1?.textContent).toContain(
      '1. café (na_cidade, Canoinhas) · Café do Relógio (Canoinhas) 4.6',
    );
    expect(p1?.textContent).toContain('viagem “Café em Canoinhas”: Café (4 paradas)');
    expect(p1?.textContent).toContain('9/10');
    expect(p1?.textContent).toContain('✓ alcance');
    const p2 = screen.getByText(/vou pra joinville/, { selector: 'b' }).closest('li');
    expect(p2?.textContent).toContain('✗ brasil');
    expect(p2?.textContent).toContain('pendente: a feirinha · “Onde fica a feirinha?”');
    expect(p2?.textContent).toContain('perguntou: “Para qual cidade vocês vão?”');
    expect(p2?.textContent).toContain('juiz: o café ficou em Portugal');
    expect(p2?.textContent).toContain('FALHOU: brasil');
  });

  it('sem rodada, diz', () => {
    render(<BateriaSection runs={[]} />);
    expect(screen.getByText('Nenhuma rodada ainda.')).toBeTruthy();
  });
});
