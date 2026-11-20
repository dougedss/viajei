import { describe, expect, it } from 'vitest';
import { consoleReport, failureDetail } from './page-errors.ts';

/**
 * Fase 23, 3.0: o `app_maquete` da produção caiu na tela de erro do app e o laboratório não guardou
 * o que a página disse. O detalhe do passo passa a dizer que a tela caiu e qual erro, e o artefato
 * `<cenário>-console.txt` leva os erros que a página soltou.
 */
describe('o que a página disse quando um passo falhou', () => {
  it('o detalhe diz a tela de erro e o nome do erro antes da espera que estourou', () => {
    expect(
      failureDetail('locator.waitFor: Timeout 20000ms exceeded.\nCall log: …', 'TypeError'),
    ).toBe('a tela caiu no RouteError (TypeError); locator.waitFor: Timeout 20000ms exceeded.');
  });

  it('sem a tela de erro, só a primeira linha da mensagem', () => {
    expect(failureDetail('pílulas fora de cena (de 2)\nmais', null)).toBe(
      'pílulas fora de cena (de 2)',
    );
  });

  it('o arquivo do artefato traz o cenário, o passo, a tela e cada erro numa linha', () => {
    const text = consoleReport({
      scenario: 'app_maquete',
      step: 'a noite pela chave da URL, com todas as pílulas em cena',
      routeError: 'DatabaseClosedError',
      errors: ['console: DatabaseClosedError: Database has been closed', 'erro: boom'],
    });
    expect(text).toBe(
      [
        'cenário: app_maquete',
        'passo: a noite pela chave da URL, com todas as pílulas em cena',
        'tela de erro: DatabaseClosedError',
        'erros da página (2, os mais recentes por último):',
        '- console: DatabaseClosedError: Database has been closed',
        '- erro: boom',
        '',
      ].join('\n'),
    );
  });

  it('sem erros, diz que não houve nenhum', () => {
    expect(consoleReport({ scenario: 'x', step: 'y', routeError: null, errors: [] })).toContain(
      '- nenhum',
    );
  });
});
