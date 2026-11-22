/**
 * Uma chamada repetida quando falha (fase 27): a gravação da bateria no banco caiu num 522 do
 * Cloudflare uma vez e perdeu os dez pedidos de uma rodada inteira. A rede do laboratório falha de
 * vez em quando, e uma escrita que vale 4 minutos de IA e Google merece tentar de novo. Puro: o
 * `sleep` é injetável para o teste.
 */
export async function comRetentativa<T>(
  fn: (tentativa: number) => Promise<T>,
  options: {
    tentativas: number;
    /** quanto esperar depois da tentativa n (1, 2, …) que falhou */
    esperaMs: (tentativa: number) => number;
    sleep?: (ms: number) => Promise<void>;
    onFalha?: (tentativa: number, erro: unknown) => void;
  },
): Promise<T> {
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let ultimo: unknown = new Error('nenhuma tentativa');
  for (let n = 1; n <= Math.max(1, options.tentativas); n += 1) {
    try {
      return await fn(n);
    } catch (err) {
      ultimo = err;
      options.onFalha?.(n, err);
      if (n < options.tentativas) await sleep(options.esperaMs(n));
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error(String(ultimo));
}
