import {
  LANDMARK_VARIANTS,
  textOf,
  usageOf,
  verdictParams,
  type AiCall,
  type PhotoInput,
} from './landmark-ai.ts';
import {
  aiVerdictSchema,
  checkRequestSchema,
  LANDMARK_CHECK_FN,
  LANDMARK_CHECK_LIMIT,
  type CheckResponse,
  type LandmarkCheckErrorCode,
} from './landmark-protocol.ts';
import { parseRecipe } from './landmark-recipe.ts';
import {
  commonsImageInfo,
  downloadPhoto,
  pickPhotos,
  type SourceFetch,
} from './landmark-sources.ts';

/**
 * O handler da função `landmarks` (fase 23), ação `check`: a segunda olhada, sem desenhar no servidor.
 * O aparelho de quem pediu a peça (ou de qualquer membro online da viagem) desenhou a receita gerada
 * em duas vistas e manda as capturas; a função confere que a pessoa pode conferir esta peça
 * (`landmark_check_target`, com a chave do servidor), baixa as mesmas fotos de referência do
 * registro, pede à IA o veredito (`ok` publica para todos; `adjust` troca a receita e pede mais uma
 * conferência, uma rodada só; `rejected` rejeita) e grava pela `landmark_verdict`. Cota própria pela
 * `edge_call`. As capturas e as fotos vão à IA e nada mais; nada da pessoa em log.
 */
export type CheckTarget = {
  id: string;
  key: string;
  name: string;
  version: number;
  round: number;
  recipe: unknown;
  modeled: { name?: string } | null;
  sources: { photos?: { title: string }[]; wikidata?: string | null } | null;
  trip_id: string | null;
};

export type CheckDeps = {
  userId: string;
  claim: () => Promise<'ok' | 'limit'>;
  isLab: () => Promise<boolean>;
  target: (landmarkId: string) => Promise<CheckTarget | null>;
  verdict: (
    landmarkId: string,
    version: number,
    verdict: 'ok' | 'adjust' | 'rejected',
    recipe: unknown,
  ) => Promise<'published' | 'adjusted' | 'rejected' | 'stale'>;
  record: (row: {
    trip_id: string | null;
    model: string;
    input_bytes: number;
    status: 'succeeded' | 'invalid' | 'failed' | 'refused';
    error: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
  }) => Promise<void>;
  fetch: SourceFetch;
  ai: AiCall;
  log: (line: string) => void;
  now?: () => number;
};

function fail(status: number, code: LandmarkCheckErrorCode, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function handleLandmarkCheck(req: Request, deps: CheckDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const started = now();
  if (req.method !== 'POST') return fail(405, 'bad_request', 'só POST');
  const body: unknown = await req.json().catch(() => null);
  const parsed = checkRequestSchema.safeParse(body);
  if (!parsed.success) return fail(400, 'bad_request', 'pedido fora do formato');
  const input = parsed.data;

  const target = await deps.target(input.landmark_id);
  if (!target) return fail(404, 'not_found', 'nenhuma peça esperando a sua conferência');
  if (target.version !== input.version) {
    return Response.json({ result: 'stale', version: target.version } satisfies CheckResponse);
  }
  if ((await deps.claim()) === 'limit')
    return fail(429, 'daily_limit', 'o limite de conferências de hoje acabou');

  // as mesmas fotos de referência do registro
  const titles = (target.sources?.photos ?? []).map((p) => p.title).slice(0, 3);
  const photos: PhotoInput[] = [];
  if (titles.length > 0) {
    const info = await commonsImageInfo(deps.fetch, titles).catch(() => []);
    for (const photo of pickPhotos(null, info)) {
      const bytes = await downloadPhoto(deps.fetch, photo);
      if (bytes) photos.push({ media_type: bytes.media_type, data: bytes.data });
    }
  }
  if (photos.length === 0) return fail(502, 'no_photos', 'as fotos de referência não vieram');

  const variant =
    input.variant && (await deps.isLab())
      ? LANDMARK_VARIANTS[input.variant]
      : LANDMARK_VARIANTS.sonnet;
  const renders: PhotoInput[] = input.images.map((i) => ({
    media_type: i.media_type,
    data: i.data,
  }));
  const params = verdictParams(
    variant,
    {
      name: target.name,
      modeled: target.modeled?.name ?? null,
      recipe: target.recipe,
      round: target.round,
    },
    photos,
    renders,
  );
  const inputBytes = [...photos, ...renders].reduce((acc, p) => acc + p.data.length, 0);
  const base = { trip_id: target.trip_id, model: variant.model, input_bytes: inputBytes };
  let message;
  try {
    message = await deps.ai(params, { signal: AbortSignal.timeout(120_000) });
  } catch {
    await deps
      .record({
        ...base,
        status: 'failed',
        error: 'ai_failed',
        input_tokens: null,
        output_tokens: null,
      })
      .catch(() => undefined);
    return fail(502, 'ai_failed', 'a conferência não respondeu');
  }
  const usage = usageOf(message);
  if (message.stop_reason === 'refusal') {
    await deps
      .record({ ...base, status: 'refused', error: 'refusal', ...usage })
      .catch(() => undefined);
    return fail(502, 'ai_failed', 'a conferência recusou');
  }
  let json: unknown;
  try {
    json = JSON.parse(textOf(message) ?? '');
  } catch {
    json = null;
  }
  const verdict = aiVerdictSchema.safeParse(json);
  if (!verdict.success || message.stop_reason === 'max_tokens') {
    await deps
      .record({
        ...base,
        status: 'invalid',
        error: message.stop_reason === 'max_tokens' ? 'max_tokens' : 'invalid_json',
        ...usage,
      })
      .catch(() => undefined);
    return fail(502, 'ai_failed', 'a conferência veio fora do formato');
  }
  await deps.record({ ...base, status: 'succeeded', error: null, ...usage }).catch(() => undefined);

  // o ajuste só vale com uma receita corrigida inteira e válida; senão conta como rejeitada
  let decision: 'ok' | 'adjust' | 'rejected' = verdict.data.verdict;
  let recipe: unknown = null;
  if (decision === 'adjust') {
    const fixed = parseRecipe(verdict.data.recipe);
    if (fixed && target.round === 0) recipe = fixed;
    else decision = 'rejected';
  }
  const result = await deps.verdict(target.id, target.version, decision, recipe);
  deps.log(
    `landmarks check key=${target.key} round=${String(target.round)} verdict=${decision} result=${result} in=${String(usage.input_tokens)} out=${String(usage.output_tokens)} ms=${String(now() - started)}`,
  );
  const response: CheckResponse = {
    result,
    version: result === 'adjusted' ? target.version + 1 : target.version,
    ...(result === 'adjusted' ? { recipe } : {}),
    notes: verdict.data.notes.slice(0, 500),
    usage: { ...usage, model: message.model, ms: now() - started },
  };
  return Response.json(response);
}

export { LANDMARK_CHECK_FN, LANDMARK_CHECK_LIMIT };
