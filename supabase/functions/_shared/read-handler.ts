import { Buffer } from 'node:buffer';
import { IMPORT_DEFAULT_VARIANT, IMPORT_VARIANTS } from './import-ai.ts';
import type { ImportVariant } from './import-protocol.ts';
import {
  httpError,
  streamRun,
  type ImportDeps,
  type ParseDone,
  type RunInit,
} from './import-handler.ts';
import { buildReadContent, isReadMediaType, readParamsFor, type ReadFile } from './read-ai.ts';
import {
  fromAiConfirmation,
  fromAiReceipt,
  READ_MAX_BYTES,
  READ_MAX_CHARS,
  READ_QUOTAS,
  readRequestSchema,
  type ReadKind,
} from './read-protocol.ts';

/**
 * O handler da `read-document` (fase 18), sem Deno e sem rede, como o da importação: o `index.ts`
 * liga o client da Anthropic, o banco da pessoa, o Storage com o JWT dela e o `waitUntil`; o Vitest
 * liga um client de mentira e um Storage de mentira. A leitura é a mesma para o texto colado, o
 * anexo que a fila já subiu (lido do bucket pelo caminho, com as policies valendo) e, pela
 * `inbound-mail`, o e-mail encaminhado (que monta o pedido com `readRun`, sem HTTP). O mesmo motor:
 * o stream, o prazo, o cancelamento e o registro em `ai_imports` que sempre fecha. Nada do texto, do
 * anexo nem da resposta vai para log.
 */
export type FetchedFile = { bytes: Uint8Array; mime: string };

export type ReadDeps = ImportDeps & {
  /** o anexo no Storage, pelo caminho; null quando não existe (ou a pessoa não pode lê-lo) */
  fetchFile: (path: string) => Promise<FetchedFile | null>;
};

/** O `done` leva a reserva ou a nota, já com os vazios em null. */
export const PARSE: Record<ReadKind, ParseDone> = {
  confirmation: (json) => ({ data: fromAiConfirmation(json) }),
  receipt: (json) => ({ data: fromAiReceipt(json) }),
};

/** Os bytes de um anexo como a IA os recebe: base64, no bloco do tipo dele. */
export function fileFor(file: FetchedFile): ReadFile | null {
  if (!isReadMediaType(file.mime)) return null;
  return { media_type: file.mime, data: Buffer.from(file.bytes).toString('base64') };
}

export type ReadRunInput = {
  kind: ReadKind;
  text: string | null;
  files: readonly ReadFile[];
  /** o id do registro já aberto em `ai_imports` */
  id: string;
  variant?: ImportVariant;
  startedAt: number;
};

/**
 * Uma leitura em andamento como resposta SSE, dado o registro já aberto: a `read-document` chega aqui
 * pelo pedido HTTP; a `inbound-mail`, com o e-mail e os anexos que ela mesma baixou.
 */
export function readRun(deps: ImportDeps, input: ReadRunInput): Response {
  const variant = input.variant ?? IMPORT_DEFAULT_VARIANT;
  const config = IMPORT_VARIANTS[variant];
  const init: RunInit = {
    deps,
    id: input.id,
    variant,
    config,
    params: readParamsFor(
      config,
      input.kind,
      buildReadContent(input.kind, input.text, input.files, new Date(input.startedAt)),
    ),
    startedAt: input.startedAt,
    textChars: input.text?.length ?? 0,
    parse: PARSE[input.kind],
    label: READ_QUOTAS[input.kind].fn,
  };
  return streamRun(init);
}

export async function handleRead(req: Request, deps: ReadDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  if (req.method !== 'POST') return httpError(405, 'invalid_input', 'Use POST.');
  const parsed = readRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return httpError(400, 'invalid_input', 'Pedido fora do formato esperado.');
  const input = parsed.data;
  const text = input.text?.trim() ? input.text : null;
  if (text !== null && text.length > READ_MAX_CHARS) {
    return httpError(413, 'too_long', `O texto passa de ${String(READ_MAX_CHARS)} caracteres.`);
  }
  if (text === null && input.attachment === null) {
    return httpError(400, 'invalid_input', 'Cole o texto ou anexe a confirmação.');
  }
  if (input.kind === 'receipt' && input.attachment === null) {
    return httpError(400, 'invalid_input', 'A nota é lida pela foto.');
  }

  const quota = READ_QUOTAS[input.kind];
  const claim = await deps.store.claim(quota.fn, quota.limit);
  if (!claim.ok) {
    return httpError(
      429,
      'rate_limited',
      `Limite de ${String(quota.limit)} leituras em 24 horas.`,
      claim.retryAt,
      now(),
    );
  }

  const files: ReadFile[] = [];
  let bytes = 0;
  if (input.attachment) {
    const fetched = await deps.fetchFile(input.attachment.path);
    if (!fetched) return httpError(404, 'invalid_input', 'O anexo ainda não chegou ao servidor.');
    if (fetched.bytes.byteLength > READ_MAX_BYTES) {
      return httpError(413, 'too_long', 'O anexo passa de 10 MB.');
    }
    const file = fileFor(fetched);
    if (!file) return httpError(400, 'invalid_input', 'O anexo não é uma imagem nem um PDF.');
    files.push(file);
    bytes = fetched.bytes.byteLength;
  }

  const variant =
    input.variant && input.variant !== IMPORT_DEFAULT_VARIANT && (await deps.store.isLab())
      ? input.variant
      : IMPORT_DEFAULT_VARIANT;
  const config = IMPORT_VARIANTS[variant];
  // a viagem criada sem sinal pode ainda não ter subido
  const tripId =
    input.trip_id !== null && (await deps.store.tripOnServer(input.trip_id)) ? input.trip_id : null;
  const id = await deps.store.open({
    trip_id: tripId,
    input_chars: text?.length ?? 0,
    input_bytes: bytes,
    model: config.model,
    kind: input.kind,
  });
  return readRun(deps, { kind: input.kind, text, files, id, variant, startedAt });
}
