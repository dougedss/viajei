/**
 * Datas dos testes no fuso do app (America/Sao_Paulo), o mesmo do navegador do Playwright. Em UTC,
 * depois das 21h de Brasília "hoje" já é amanhã: a viagem nasceria no dia seguinte e o Modo Viagem
 * não abriria (D33). Por isso nenhum teste calcula data com toISOString.
 */
const format = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 'yyyy-MM-dd' em São Paulo, `daysAhead` dias a partir de hoje. */
export function dateInSaoPaulo(daysAhead = 0): string {
  return format.format(new Date(Date.now() + daysAhead * 86_400_000));
}
