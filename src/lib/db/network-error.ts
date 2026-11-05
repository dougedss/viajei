/**
 * Erro de rede do fetch (sem resposta do servidor), em qualquer navegador. Puro e sem DOM: o
 * service worker usa na hora de enviar a fila, o motor do app usa para marcar offline.
 */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return /fetch|network|load failed/i.test(err.message);
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const m: unknown = err.message;
    return typeof m === 'string' && /failed to fetch|network|load failed/i.test(m);
  }
  return false;
}
