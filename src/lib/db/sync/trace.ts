/**
 * O rastro do motor de sync (fase 13): os últimos passos com a hora e a duração, num anel de tamanho
 * fixo. Puro: quem escreve é o motor, quem lê é o diagnóstico (`viajeiDiag.sync()` no console do
 * aparelho e o laboratório na falha do rack). Nasceu do defeito do rack que não subia: a fila dizia o
 * que estava pendente, mas não onde o ciclo estava nem quanto cada passo demorou.
 */
export type TraceEntry = {
  /** época em ms */
  t: number;
  /** o passo: "ciclo", "push 1/0", "pull 3f2a9c1e", "lock ocupado"… */
  e: string;
  /** quanto durou, quando é um passo com fim */
  ms?: number;
};

export class SyncTrace {
  #entries: TraceEntry[] = [];
  readonly #size: number;

  constructor(size = 80) {
    this.#size = size;
  }

  add(e: string, ms?: number, now = Date.now()): void {
    this.#entries.push(ms === undefined ? { t: now, e } : { t: now, e, ms: Math.round(ms) });
    if (this.#entries.length > this.#size)
      this.#entries.splice(0, this.#entries.length - this.#size);
  }

  /** Uma cópia, do mais antigo ao mais novo. */
  list(): TraceEntry[] {
    return this.#entries.map((x) => ({ ...x }));
  }
}

/** Uma linha por passo, com a hora relativa a `since` em segundos: "+12.3s push 1/0 (430 ms)". */
export function formatTrace(entries: readonly TraceEntry[], since: number): string[] {
  return entries.map((x) => {
    const at = ((x.t - since) / 1000).toFixed(1);
    return `${at.startsWith('-') ? '' : '+'}${at}s ${x.e}${x.ms === undefined ? '' : ` (${String(x.ms)} ms)`}`;
  });
}
