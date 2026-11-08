/**
 * O prazo de cada chamada do sync (fase 12). O ciclo roda com o lock `viajei:sync`: uma chamada que
 * nunca responde (a rede que troca de antena no meio, ou a sessão presa renovando o token antes de o
 * fetch sair) segurava o lock para sempre, e nada mais subia até o app ser reaberto. Com o prazo, o
 * fetch é cancelado e a espera acaba mesmo que ele nem tenha saído; o erro sobe como erro de rede, o
 * motor marca sem conexão, solta o lock e tenta de novo como sempre.
 *
 * 45 s: folga para o retrato inteiro de uma viagem (o `resync`) numa rede ruim, e curto perto de
 * quem espera o "1 pendente" sumir. Puro e sem DOM: o service worker usa o mesmo.
 */
export const SYNC_DEADLINE_MS = 45_000;

/** O erro do prazo: um `TypeError` de rede, como o do fetch sem resposta (`isNetworkError`). */
export class SyncDeadlineError extends TypeError {
  constructor(ms: number) {
    super(`network timeout: o servidor não respondeu em ${String(Math.round(ms / 1000))} s`);
    this.name = 'SyncDeadlineError';
  }
}

export async function withDeadline<T>(
  call: (signal: AbortSignal) => PromiseLike<T>,
  ms: number = SYNC_DEADLINE_MS,
): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new SyncDeadlineError(ms));
    }, ms);
  });
  try {
    return await Promise.race([call(ctrl.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
