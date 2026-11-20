/**
 * O que a página do app disse quando um passo do laboratório falhou (fase 23, 3.0). O `app_maquete`
 * da produção de 20/11 (run 44753738805) caiu na tela de erro do app ("Algo deu errado por aqui", o
 * `RouteError`) e o artefato só tinha o print: os erros que a página soltou (exceções e
 * `console.error`, que o React de produção usa para o erro que um limite de erro capturou) já eram
 * ouvidos por `watchErrors`, mas não iam a lugar nenhum. Agora vão ao `data` do passo e a um arquivo
 * `<cenário>-console.txt` nos artefatos, e a tela de erro diz o nome do erro (`data-route-error`).
 *
 * Os artefatos são públicos (o repositório é): só a primeira linha de cada erro, curta, como o
 * `watchErrors` já corta. Os cenários usam contas e viagens de laboratório.
 */
export type FailureReport = {
  scenario: string;
  step: string;
  /** o nome do erro que a tela de erro do app mostrou (`data-route-error`), ou null */
  routeError: string | null;
  errors: readonly string[];
};

/** O detalhe do passo que falhou, com a tela de erro na frente quando ela apareceu. */
export function failureDetail(message: string, routeError: string | null): string {
  const first = (message.split('\n')[0] ?? '').trim();
  return routeError ? `a tela caiu no RouteError (${routeError}); ${first}` : first;
}

/** O arquivo de texto do artefato: o cenário, o passo, a tela de erro e os erros em ordem. */
export function consoleReport(r: FailureReport): string {
  const lines = [
    `cenário: ${r.scenario}`,
    `passo: ${r.step}`,
    `tela de erro: ${r.routeError ?? 'não'}`,
    `erros da página (${String(r.errors.length)}, os mais recentes por último):`,
    ...(r.errors.length > 0 ? r.errors.map((e) => `- ${e}`) : ['- nenhum']),
  ];
  return `${lines.join('\n')}\n`;
}
