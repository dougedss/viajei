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
 * O documento acaba no **commit** do novo (o `framenavigated` do quadro principal), não no pedido de
 * navegação: entre um e outro, o documento de antes continua vivo e pedindo. A primeira versão trocava
 * de documento no pedido, e os três pedidos que o app faz logo depois de entrar (`profiles`,
 * `claim_invites`, `my_pending_invites`), saídos nesse intervalo, ficavam como do documento novo: os
 * 6 travados do laboratório do preview da fase 17, nos dois aparelhos. Antes do commit o documento
 * novo não existe, e não pede nada; no commit, tudo o que está em voo é do que acabou.
 *
 * Um pedido do documento de agora aberto há mais de 30 s conta como travado e deixa de segurar o
 * relógio (o prazo do próprio app, no relógio de mentira, cuida dele); o caminho dele fica registrado,
 * para o laboratório dizer qual é.
 */
export const STUCK_MS = 30_000;

type Open = { since: number; path: string };

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
  /** o quadro principal pediu outro documento, que ainda não se firmou */
  #navigating = false;

  /** Um pedido do app saiu, no documento de agora. */
  started(request: R, path: string, now: number): void {
    this.#open.set(request, { since: now, path });
  }

  /** Terminou ou falhou. */
  ended(request: R): void {
    this.#open.delete(request);
  }

  /**
   * O quadro principal pediu outro documento (o pedido de navegação). O de agora continua vivo, e
   * pedindo, até o novo se firmar (`committed`). O fim do pedido de navegação não desliga isso: o
   * `requestfinished` de um `index.html` pequeno chega às vezes antes do `framenavigated` (os dois vêm
   * de processos diferentes do Chromium). Uma navegação que nunca se firma (um 204, um download) só
   * faria a próxima navegação dentro do documento esquecer o que estava em voo: o relógio deixaria de
   * esperar por esses pedidos, sem nunca segurá-lo.
   */
  navigating(): void {
    this.#navigating = true;
  }

  /**
   * O quadro principal navegou (o `framenavigated`). Com um pedido de navegação antes, é o documento
   * novo que se firmou: os pedidos em voo eram todos do anterior e acabaram com ele. Sem pedido de
   * navegação, é a navegação dentro do mesmo documento (o `pushState` do React Router), e nada muda.
   */
  committed(): void {
    if (!this.#navigating) return;
    this.#navigating = false;
    this.#open.clear();
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
