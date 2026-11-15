/**
 * Os pedidos do app em voo, como o condutor do relógio os conta (`e2e/helpers/relogio.ts`, no e2e e
 * no laboratório). Puro: quem liga aos eventos do Playwright é o condutor.
 *
 * Um pedido sai da conta quando termina, quando falha ou quando **o documento que o fez acabou**
 * (fase 17, 3.0). Numa navegação de documento (o `page.goto` da tela da viagem logo depois de entrar,
 * a recarga), o navegador corta os pedidos da página que saiu sem que o Playwright avise o fim deles:
 * o próprio Playwright os descarta da conta de "rede ociosa" quando o documento novo começa. O
 * condutor os guardava para sempre: eles envelheciam até "travados" (os 8 do laboratório da produção
 * da fase 16) e o primeiro passo do relógio esperava uns 20 s por eles.
 *
 * Um pedido do documento de agora aberto há mais de 30 s conta como travado e deixa de segurar o
 * relógio (o prazo do próprio app, no relógio de mentira, cuida dele); o caminho dele fica registrado,
 * para o laboratório dizer qual é.
 */
export const STUCK_MS = 30_000;

type Open = { since: number; document: number; path: string };

/** O método e o caminho, sem a query (nada de id nem de texto no registro). */
export function requestPath(method: string, url: string): string {
  try {
    const u = new URL(url);
    return `${method} ${u.host}${u.pathname}`;
  } catch {
    return `${method} ?`;
  }
}

export class PendingRequests<R> {
  readonly #open = new Map<R, Open>();
  #document = 0;

  /** Um pedido do app saiu, no documento de agora. */
  started(request: R, path: string, now: number): void {
    this.#open.set(request, { since: now, document: this.#document, path });
  }

  /** Terminou ou falhou. */
  ended(request: R): void {
    this.#open.delete(request);
  }

  /**
   * A página começou a navegar para outro documento (o pedido de navegação do quadro principal).
   * Os pedidos feitos daqui em diante são do documento novo.
   */
  navigating(): void {
    this.#document += 1;
  }

  /** O documento novo começou a carregar: os pedidos do anterior acabaram com ele. */
  documentLoaded(): void {
    for (const [request, open] of this.#open) {
      if (open.document < this.#document) this.#open.delete(request);
    }
  }

  /** Em voo, os travados também. */
  inFlight(): number {
    return this.#open.size;
  }

  /** Em voo há menos de 30 s: são os que seguram o relógio. */
  recent(now: number): number {
    let n = 0;
    for (const open of this.#open.values()) if (now - open.since < STUCK_MS) n += 1;
    return n;
  }

  /** Os caminhos dos que estão abertos há 30 s ou mais, com há quantos segundos. */
  stuck(now: number): string[] {
    const out: string[] = [];
    for (const open of this.#open.values()) {
      if (now - open.since >= STUCK_MS) {
        out.push(`${open.path} (${String(Math.round((now - open.since) / 1000))} s)`);
      }
    }
    return out.sort();
  }
}
