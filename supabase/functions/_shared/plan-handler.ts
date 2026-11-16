import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import {
  IMPORT_DEFAULT_VARIANT,
  IMPORT_FALLBACK_BETA,
  IMPORT_MAX_TOKENS,
  IMPORT_VARIANTS,
  type VariantConfig,
} from './import-ai.ts';
import {
  httpError,
  parseImport,
  streamRun,
  type ImportDeps,
  type ParseDone,
} from './import-handler.ts';
import {
  AI_ASK_FORMAT,
  AI_PLAN_FORMAT,
  AI_WRITE_FORMAT,
  buildPlanMessage,
  fromAiAsk,
  fromAiWrite,
  PLAN_ASK_SYSTEM_PROMPT,
  PLAN_SYSTEM_PROMPT,
  PLAN_WRITE_SYSTEM_PROMPT,
} from './plan-ai.ts';
import {
  PLAN_ASK_DAILY_LIMIT,
  PLAN_ASK_QUOTA,
  PLAN_DAILY_LIMIT,
  PLAN_FN,
  PLAN_MAX_CHARS,
  planChars,
  planRequestSchema,
  type PlanInput,
} from './plan-protocol.ts';

/**
 * O handler da `plan-trip` (fase 17), sem Deno e sem rede, como o da importação: o `index.ts` liga o
 * client da Anthropic, o banco da pessoa e o `waitUntil`; o Vitest liga um client de mentira. Dois
 * passos, cada um com a cota dele pela `edge_call` (o `plan` é a leitura que conta, 10 em 24 h; as
 * perguntas, 20), e o registro em `ai_imports` com o `kind` (`plan` ou `today`). O mesmo motor de
 * leitura da importação: o stream, o prazo, o cancelamento e o registro que sempre fecha. Nada do
 * pedido, das respostas nem da resposta vai para log.
 */

/** As perguntas pedem pouco texto e nenhum pensamento longo. */
const ASK_MAX_TOKENS = 4_000;
/** As perguntas e a intenção (fase 24): o `done` leva `{ questions, intent }`. */
const parseAsk: ParseDone = (json) => ({ data: fromAiAsk(json) });
/** A viagem escrita sobre as escolhas (fase 24): o `done` leva os textos e as referências. */
const parseWrite: ParseDone = (json) => ({ data: fromAiWrite(json) });

/**
 * Os três jeitos de ler (fase 24): as perguntas com a intenção; a viagem escrita sobre os lugares
 * que a pessoa escolheu no mapa (o `plan` com `places`); e o roteiro inteiro pela IA (o `plan` sem
 * `places`), que o app da produção ainda manda até o merge desta fase.
 */
type PlanMode = 'ask' | 'write' | 'legacy';
const modeOf = (input: PlanInput): PlanMode =>
  input.step === 'ask' ? 'ask' : input.places ? 'write' : 'legacy';

const SYSTEM: Record<PlanMode, string> = {
  ask: PLAN_ASK_SYSTEM_PROMPT,
  write: PLAN_WRITE_SYSTEM_PROMPT,
  legacy: PLAN_SYSTEM_PROMPT,
};
const FORMAT = { ask: AI_ASK_FORMAT, write: AI_WRITE_FORMAT, legacy: AI_PLAN_FORMAT };
const PARSE: Record<PlanMode, ParseDone> = {
  ask: parseAsk,
  write: parseWrite,
  legacy: parseImport,
};

/**
 * O pedido à Anthropic. Nas perguntas, a variante leve (o esforço baixo: são poucas frases); na
 * escrita e no roteiro, a mesma da importação (D133).
 */
export function planParamsFor(config: VariantConfig, input: PlanInput): BetaMessageStreamParams {
  const mode = modeOf(input);
  const ask = mode === 'ask';
  return {
    model: config.model,
    max_tokens: ask ? ASK_MAX_TOKENS : IMPORT_MAX_TOKENS,
    thinking: config.thinking,
    output_config: { effort: ask ? 'low' : config.effort, format: FORMAT[mode] },
    betas: [IMPORT_FALLBACK_BETA],
    fallbacks: 'default',
    system: SYSTEM[mode],
    messages: [{ role: 'user', content: buildPlanMessage(input) }],
  };
}

export async function handlePlan(req: Request, deps: ImportDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  if (req.method !== 'POST') return httpError(405, 'invalid_input', 'Use POST.');
  const parsed = planRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return httpError(400, 'invalid_input', 'Pedido fora do formato esperado.');
  const input = parsed.data;
  const chars = planChars(input);
  if (chars > PLAN_MAX_CHARS) {
    return httpError(413, 'too_long', 'A conversa passa de 4.000 caracteres.');
  }
  if (input.text.trim() === '') return httpError(400, 'invalid_input', 'O pedido está vazio.');

  const ask = input.step === 'ask';
  const claim = await deps.store.claim(
    ask ? PLAN_ASK_QUOTA : PLAN_FN,
    ask ? PLAN_ASK_DAILY_LIMIT : PLAN_DAILY_LIMIT,
  );
  if (!claim.ok) {
    return httpError(
      429,
      'rate_limited',
      ask
        ? `Limite de ${String(PLAN_ASK_DAILY_LIMIT)} conversas começadas em 24 horas.`
        : `Limite de ${String(PLAN_DAILY_LIMIT)} viagens montadas em 24 horas.`,
      claim.retryAt,
      now(),
    );
  }
  const variant =
    input.variant && input.variant !== IMPORT_DEFAULT_VARIANT && (await deps.store.isLab())
      ? input.variant
      : IMPORT_DEFAULT_VARIANT;
  const config = IMPORT_VARIANTS[variant];
  const id = await deps.store.open({
    trip_id: null,
    input_chars: chars,
    model: config.model,
    kind: input.kind,
  });
  return streamRun({
    deps,
    id,
    variant,
    config,
    params: planParamsFor(config, input),
    startedAt,
    textChars: chars,
    parse: PARSE[modeOf(input)],
    label: ask ? PLAN_ASK_QUOTA : PLAN_FN,
  });
}
