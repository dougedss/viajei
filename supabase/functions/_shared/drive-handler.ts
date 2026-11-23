import {
  DRIVE_DAILY_LIMIT,
  DRIVE_FN,
  driveRequestSchema,
  type DriveErrorCode,
  type DriveResponse,
} from './drive-schema.ts';
import { ProviderError } from './google-places.ts';
import { driveTimes } from './google-routes.ts';

/**
 * O handler da `drive-times` (a correção de 22/11/2026, D310), sem Deno e sem rede, como o da
 * `find-places`: o `index.ts` liga a chave do Google, o banco da pessoa (a cota pela `edge_call`) e o
 * `fetch`; o Vitest liga um `fetch` de mentira. Recebe pares de pontos e devolve o tempo de carro que o
 * Google mediu em cada um (`_shared/google-routes.ts`), na ordem do pedido. Sem a chave, `no_source`
 * antes de gastar cota: a tela diz que não deu para medir e **não mostra tempo nenhum** (nunca a
 * estimativa em linha reta no lugar). O log é uma linha de números e o código, nada da pessoa (nem os
 * pontos).
 */
export type DriveDeps = {
  /** a chave do Google (a mesma da `find-places`, com a Routes API na restrição dela) */
  googleKey: string | undefined;
  /** a cota da pessoa: `ok`, ou `limit` quando passou do limite em 24 h */
  claim: () => Promise<'ok' | 'limit'>;
  fetch: typeof fetch;
  log: (line: string) => void;
  now?: () => number;
};

const MESSAGES: Readonly<Record<DriveErrorCode, string>> = {
  invalid_input: 'Pedido fora do formato esperado.',
  no_source: 'A medição do tempo de carro ainda não está ligada.',
  daily_limit: `Você já fez ${String(DRIVE_DAILY_LIMIT)} medições de tempo de carro hoje. Amanhã libera de novo.`,
  provider_quota: 'A medição do tempo de carro chegou ao limite de hoje. Tente mais tarde.',
  provider_failed: 'O Google não respondeu agora. Tente de novo em instantes.',
  internal: 'Não deu para conferir o limite.',
};

function fail(status: number, code: DriveErrorCode): Response {
  return Response.json({ error: { code, message: MESSAGES[code] } }, { status });
}

export async function handleDrive(req: Request, deps: DriveDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  if (req.method !== 'POST') return fail(405, 'invalid_input');
  const parsed = driveRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, 'invalid_input');
  const { pairs } = parsed.data;
  const line = (status: string, requests: number, elements: number, found: number) =>
    deps.log(
      `${DRIVE_FN} status=${status} pairs=${String(pairs.length)} requests=${String(requests)} elements=${String(elements)} found=${String(found)} ms=${String(Math.round(now() - startedAt))}`,
    );

  if (!deps.googleKey) {
    line('no_source', 0, 0, 0);
    return fail(503, 'no_source');
  }
  let claim: 'ok' | 'limit';
  try {
    claim = await deps.claim();
  } catch {
    line('internal', 0, 0, 0);
    return fail(500, 'internal');
  }
  if (claim === 'limit') {
    line('daily_limit', 0, 0, 0);
    return fail(429, 'daily_limit');
  }

  try {
    const measured = await driveTimes(deps, deps.googleKey, pairs);
    line(
      'ok',
      measured.requests,
      measured.elements,
      measured.times.filter((t) => t !== null).length,
    );
    const body: DriveResponse = {
      provider: 'google',
      fetched_at: new Date(now()).toISOString(),
      times: measured.times,
    };
    return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const e =
      err instanceof ProviderError ? err : new ProviderError('provider_failed', 502, 'internal');
    line(
      `${e.code}${e.code === 'provider_failed' ? `:${e.message.replace(/\s+/g, '_')}` : ''}`,
      0,
      0,
      0,
    );
    return fail(e.status, e.code);
  }
}
