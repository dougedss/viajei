import type { BrowserContext, Page, Request } from '@playwright/test';

/**
 * O relógio de mentira do Playwright andando como o de verdade anda para a rede (fase 16, 3.0).
 *
 * O `runFor` avança o relógio da página em poucos milissegundos de verdade: um minuto do aparelho
 * passa em 40 a 200 ms. Uma chamada à rede que já tinha saído (o ciclo do sync, a rota, o OSM) leva o
 * tempo dela de verdade, e o prazo dela é um `setTimeout` no relógio de mentira: com a produção a
 * 150–300 ms do GitHub, o `runFor` passava do prazo de 45 s do sync antes de a resposta chegar, o app
 * se marcava sem conexão e a parada seguinte nascia sem o nome do OSM (o `app_parada_auto` vermelho de
 * 10 e 13/11). Num aparelho de verdade isso não acontece: um minuto dá tempo a qualquer resposta.
 *
 * Por isso o relógio anda em passos de 5 s (menos que o menor prazo do app, os 6 s do OSM) e, antes de
 * cada passo, espera os pedidos do próprio app voltarem (`pedidoDoApp`; um pedido de fora que nunca
 * fecha não segura nada, e um do app aberto há mais de 30 s conta como travado e também não). E a
 * posição só conta quando o app a leu: depois de
 * `setGeolocation`, espera o `data-fix-at` mudar, para a leitura ter a hora certa (entregue no meio de
 * um `runFor`, ela levaria uma hora qualquer do minuto).
 */

/** O maior passo do relógio: menor que o prazo mais curto do app (o OSM, 6 s). */
export const PASSO_MS = 5_000;

/**
 * Quanto um pedido do app pode ficar aberto antes de contar como travado: daí em diante ele não
 * segura mais o relógio (o prazo do próprio app, no relógio de mentira, cuida dele).
 */
const TRAVADO_MS = 30_000;

/**
 * Os pedidos que importam: os do próprio app, que têm prazo no relógio de mentira (o sync e as
 * funções do Supabase, o OSM, o Open-Meteo). Um pedido de fora que nunca fecha não diz nada do app:
 * esperar por todos os pedidos da página travou o laboratório do preview da fase 16 por 50 min (no
 * preview da Vercel, a barra de ferramentas que ela injeta é o candidato; D200).
 */
export function pedidoDoApp(url: string): boolean {
  return (
    /\/(rest|auth|functions|storage)\/v1\//.test(url) ||
    url.startsWith('https://nominatim.openstreetmap.org/') ||
    url.startsWith('https://api.open-meteo.com/')
  );
}

export type Rede = {
  /** os pedidos do app ainda sem resposta (os travados também) */
  emVoo: () => number;
  /** os pedidos do app abertos há mais de 30 s, que já não seguram o relógio */
  travados: () => number;
  /** espera não haver pedido do app recente sem resposta; devolve quanto esperou, em ms */
  quieta: () => Promise<number>;
};

const pausa = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Conta os pedidos do app que ainda não voltaram, com a hora em que saíram (o Realtime não entra). */
export function redeDa(page: Page): Rede {
  const abertos = new Map<Request, number>();
  const fecha = (r: Request) => abertos.delete(r);
  page.on('request', (r) => {
    if (pedidoDoApp(r.url())) abertos.set(r, Date.now());
  });
  page.on('requestfinished', fecha);
  page.on('requestfailed', fecha);
  const recentes = () => [...abertos.values()].filter((t) => Date.now() - t < TRAVADO_MS).length;
  return {
    emVoo: () => abertos.size,
    travados: () => abertos.size - recentes(),
    quieta: async () => {
      const t0 = Date.now();
      while (recentes() > 0) await pausa(20);
      return Date.now() - t0;
    },
  };
}

/** Avança o relógio do aparelho `ms`, em passos de no máximo 5 s, cada um com a rede quieta. */
export async function andar(page: Page, rede: Rede, ms: number): Promise<void> {
  for (let feito = 0; feito < ms; feito += PASSO_MS) {
    await rede.quieta();
    await page.clock.runFor(Math.min(PASSO_MS, ms - feito));
  }
  await rede.quieta();
}

/** A hora da última leitura que o app recebeu (`data-fix-at` no "Agora"). */
async function ultimaLeitura(page: Page): Promise<string | null> {
  return page
    .locator('[data-gps][data-fix-at]')
    .first()
    .getAttribute('data-fix-at', { timeout: 5_000 })
    .catch(() => null);
}

/**
 * Põe o aparelho em `ponto` e espera o app receber a leitura (o `data-fix-at` muda), com o relógio
 * andando sozinho: a leitura leva a hora de agora, não uma hora do meio de um `runFor`. No GPS
 * econômico (parado há 10 min, D47) o app pede a posição uma vez por minuto, pelo relógio dele: aí a
 * leitura chega no próximo `andar`, como num aparelho de verdade.
 */
export async function posicionar(
  context: BrowserContext,
  page: Page,
  ponto: { latitude: number; longitude: number },
): Promise<void> {
  const antes = await ultimaLeitura(page);
  await context.setGeolocation(ponto);
  const gps = (await page.locator('[data-gps]').first().textContent({ timeout: 5_000 })) ?? '';
  if (gps.includes('econômico')) return;
  const t0 = Date.now();
  while (Date.now() - t0 < 10_000) {
    const agora = await ultimaLeitura(page);
    if (agora !== null && agora !== antes) return;
    await pausa(20);
  }
  throw new Error('o app não recebeu a posição em 10 s');
}
