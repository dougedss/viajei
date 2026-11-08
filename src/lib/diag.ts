/**
 * O diagnóstico pelo console do aparelho (fase 13): `viajeiDiag.sync()` devolve o estado do motor de
 * sync com o rastro dos últimos passos, e `viajeiDiag.locks()` quem segura e quem espera os Web
 * Locks. Só leitura, sem dado de linha nenhuma (tabelas, ids curtos, durações); o laboratório lê o
 * mesmo quando o rack não sobe. Cada módulo registra o seu leitor; nada aqui depende do React.
 */
type Reader = () => unknown;
const readers: Record<string, Reader> = {};

export function registerDiag(name: string, read: Reader): void {
  readers[name] = read;
  (globalThis as { viajeiDiag?: Record<string, Reader> }).viajeiDiag = readers;
}

if (typeof navigator !== 'undefined' && 'locks' in navigator) {
  registerDiag('locks', () =>
    navigator.locks.query().then((q) => ({
      held: (q.held ?? []).map((l) => `${l.name ?? '?'} ${l.mode ?? ''}`.trim()),
      pending: (q.pending ?? []).map((l) => l.name ?? '?'),
    })),
  );
}
