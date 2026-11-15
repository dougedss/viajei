/**
 * Copiar um texto que ainda está sendo montado (um import dinâmico no toque), sem perder o gesto. O
 * Safari do iPhone só deixa gravar na área de transferência dentro do gesto da pessoa: um `writeText`
 * depois de um `await` é recusado. Um `ClipboardItem` com a promessa do texto é gravado no gesto e
 * preenchido quando o texto fica pronto; onde ele não existe ou falha, o `writeText` depois do
 * `await` (o Chrome dá uns segundos de folga depois do toque). `false` quando nenhum dos dois deu: a
 * tela mostra o texto para copiar à mão.
 */
export async function copyText(text: string | Promise<string>): Promise<boolean> {
  const ready = Promise.resolve(text);
  // fora de um contexto seguro o navegador nem tem a área de transferência (os tipos dizem que sim)
  const board = navigator.clipboard as Clipboard | undefined;
  if (!board) return false;
  if (typeof ClipboardItem !== 'undefined' && typeof board.write === 'function') {
    try {
      const blob = ready.then((t) => new Blob([t], { type: 'text/plain' }));
      await board.write([new ClipboardItem({ 'text/plain': blob })]);
      return true;
    } catch {
      // segue para o writeText
    }
  }
  try {
    await board.writeText(await ready);
    return true;
  } catch {
    return false;
  }
}
