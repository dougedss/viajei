/**
 * A frase é a saída de hoje (fase 17, `decide.ts`): curta, com "hoje" ou parecido, sem outra data. Num
 * módulo só com caminhos relativos porque a bateria do laboratório (fase 27) a usa em Node, para
 * mandar ao planejador o mesmo `kind` que o app mandaria.
 */
const plain = (s: string) =>
  s
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

/**
 * "hoje" (e "hj", como um leigo escreve: a rodada da bateria da fase 26 teve "um café bom hj", lido
 * como uma viagem para amanhã), "agora", "bate e volta", "bate-volta", "já" no fim ("vamos sair já")
 */
export const TODAY = /\b(?:hoje|hj|agora|bate[ -]e[ -]volta|bate[ -]volta|sair ja|ja ja)\b/;
/** O que tira a frase de hoje: outra data, outro dia, vários dias ou um mês. */
export const ELSEWHEN =
  /\b(?:amanha|depois de amanha|fim de semana|feriado|semana que vem|proxim[ao]s?|\d+ dias|\d+ noites|dias|noites|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b|\d{1,2}\/\d{1,2}/;

export function isToday(text: string): boolean {
  const s = plain(text.trim());
  const lines = s.split('\n').filter((l) => l.trim() !== '');
  return lines.length <= 3 && s.length <= 160 && TODAY.test(s) && !ELSEWHEN.test(s);
}
