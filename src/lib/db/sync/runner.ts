/**
 * O laço de ciclos do motor de sync, sem rede nem Supabase (testável): um único laço por aba, até
 * não sobrar pedido. Pedido que chega no meio só marca e o laço que está rodando o atende. Lock
 * ocupado (um pull do Realtime, outra aba, o service worker) não descarta o pedido: o laço espera
 * soltar e roda.
 *
 * Os dois defeitos que esta forma evita (D86): o pedido feito enquanto o lock estava ocupado (o
 * Partiu! logo depois de abrir o app) ficava parado até o próximo gatilho, até 60 s; e dois laços na
 * mesma aba se alternavam esperando o lock que o outro pegava, sem nunca rodar um ciclo.
 */
export type RunnerDeps = {
  /** pode rodar agora? (sessão e rede) */
  canRun: () => boolean;
  /** roda o ciclo com o lock; devolve false se o lock estava ocupado */
  withLock: (cycle: () => Promise<void>) => Promise<boolean>;
  /** resolve quando quem estava com o lock soltar */
  lockReleased: () => Promise<void>;
  cycle: () => Promise<void>;
};

export class CycleRunner {
  #deps: RunnerDeps;
  #queued = false;
  #loop: Promise<void> | null = null;

  constructor(deps: RunnerDeps) {
    this.#deps = deps;
  }

  /** Marca que é preciso mais um ciclo (escrita, rede de volta, foco, abrir o app). */
  request(): void {
    this.#queued = true;
  }

  /** Esquece o pedido (o motor parou). */
  clear(): void {
    this.#queued = false;
  }

  get pending(): boolean {
    return this.#queued;
  }

  /** Atende os pedidos; quem chamar no meio recebe o mesmo laço. */
  run(): Promise<void> {
    // o `.finally` roda sempre depois desta atribuição, mesmo quando o laço termina sem esperar nada
    // (sem rede, sem pedido): fazer o laço zerar a si mesmo por dentro o deixaria preso como resolvido
    this.#loop ??= this.#runLoop().finally(() => {
      this.#loop = null;
    });
    return this.#loop;
  }

  async #runLoop(): Promise<void> {
    const { canRun, withLock, lockReleased, cycle } = this.#deps;
    while (this.#queued) {
      this.#queued = false;
      if (!canRun()) return;
      if (!(await withLock(cycle))) {
        this.#queued = true;
        await lockReleased();
      }
    }
  }
}
