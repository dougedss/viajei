import { z } from 'zod';
import { MEDIA } from './constants.ts';
import { imageSize } from './image-size.ts';
import { IMPORT_DEFAULT_VARIANT, IMPORT_VARIANTS } from './import-ai.ts';
import type { ImportStore, OpenStream } from './import-handler.ts';
import { SseDecoder } from './import-protocol.ts';
import { bareEmail, findInboxCode } from './inbox-code.ts';
import { toE164 } from './phone.ts';
import type { ReadFile } from './read-ai.ts';
import { fileFor, readRun } from './read-handler.ts';
import { READ_MAX_CHARS, readConfirmationSchema, type ReadConfirmation } from './read-protocol.ts';
import { svixHeaders, verifySvix } from './svix.ts';

/**
 * O handler da `inbound-mail` (fase 18), sem Deno e sem rede, como os outros: o `index.ts` liga os
 * secrets, o `fetch`, as três RPCs da 0016, o Storage com a chave do servidor, a IA e o `waitUntil`; o
 * Vitest liga tudo de mentira. O fluxo: a assinatura svix sobre o corpo bruto → só `email.received` →
 * o código do endereço nos destinatários → **200 na hora** e o resto em segundo plano: de quem é o
 * código (e-mail confirmado), o remetente igual ao e-mail da conta (a segunda tranca; o que falha é
 * descartado em silêncio), o e-mail já visto (o webhook repete), o conteúdo e os anexos pela API do
 * Resend (baixados nesta mesma chamada: o `download_url` expira), a leitura pela mesma IA da
 * confirmação colada, a viagem pelas datas, os objetos no Storage e a gravação pela RPC. O e-mail em
 * si não fica guardado; só o que a leitura tirou e os anexos. Uma linha de log com códigos e números:
 * nunca o assunto, o remetente, o corpo nem o código do endereço.
 */
export const RESEND_API = 'https://api.resend.com';
/** quantos anexos de um e-mail entram, no máximo */
export const MAX_FILES = 10;
const RESEND_TIMEOUT_MS = 20_000;

export type InboundOwner = { user_id: string; email: string; seen: boolean };
export type ReceivedFile = {
  id: string;
  storage_path: string;
  filename: string;
  mime: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
};
export type ReceiveInput = {
  userId: string;
  tripId: string | null;
  reservation: Record<string, unknown>;
  files: ReceivedFile[];
  sourceId: string;
  aiImportId: string | null;
};
export type ReceiveResult = {
  received_id: string;
  reservation_id: string | null;
  duplicate: boolean;
};

export type InboundRpc = {
  lookup(code: string, sourceId: string): Promise<InboundOwner | null>;
  tripFor(userId: string, startAt: string | null, endAt: string | null): Promise<string | null>;
  receive(input: ReceiveInput): Promise<ReceiveResult>;
};

export type InboundDeps = {
  secrets: { webhook: string | undefined; api: string | undefined };
  fetch: typeof fetch;
  rpc: InboundRpc;
  /** o objeto no bucket, com a chave do servidor; false quando o Storage recusou */
  upload(path: string, bytes: Uint8Array, mime: string): Promise<boolean>;
  ai: { openStream: OpenStream; storeFor(userId: string): ImportStore };
  uuid(): string;
  waitUntil(work: Promise<unknown>): void;
  log(line: string): void;
  now?: () => number;
};

// ---------------------------------------------------------------------- o que o Resend manda
/** O evento `email.received` (só metadados: sem corpo nem anexos), como a documentação o mostra. */
export const inboundEventSchema = z.object({
  type: z.string(),
  data: z.looseObject({
    email_id: z.string().min(1),
    from: z.string(),
    to: z.array(z.string()).default([]),
    received_for: z.array(z.string()).default([]),
    subject: z.string().nullish(),
    attachments: z
      .array(
        z.looseObject({
          id: z.string(),
          filename: z.string().nullish(),
          content_type: z.string().nullish(),
        }),
      )
      .default([]),
  }),
});
type InboundEvent = z.infer<typeof inboundEventSchema>;

const contentSchema = z.looseObject({
  subject: z.string().nullish(),
  text: z.string().nullish(),
  html: z.string().nullish(),
});
const attachmentListSchema = z.looseObject({
  data: z.array(
    z.looseObject({
      id: z.string(),
      filename: z.string().nullish(),
      content_type: z.string().nullish(),
      size: z.number().nullish(),
      download_url: z.string(),
    }),
  ),
});

const EXT: Record<string, 'jpg' | 'png' | 'webp' | 'pdf'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** "text/html; charset=utf-8" → "text/html"; "image/jpg" → "image/jpeg". */
export function mimeOf(contentType: string | null | undefined): string {
  const base = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  return base === 'image/jpg' ? 'image/jpeg' : base;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** O HTML de um e-mail como texto corrido, sem scripts, estilos e tags; quebras onde o layout quebra. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|td|th|table|section|article|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
      const c = code.toLowerCase();
      if (c.startsWith('#x')) return String.fromCodePoint(Number.parseInt(c.slice(2), 16));
      if (c.startsWith('#')) return String.fromCodePoint(Number(c.slice(1)));
      return ENTITIES[c] ?? m;
    })
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** "AAAA-MM-DDTHH:MM" de parede em São Paulo como instante (o Brasil não tem horário de verão desde 2019). */
export function wallToIso(stamp: string | null): string | null {
  return stamp ? `${stamp}:00-03:00` : null;
}

const cut = (s: string | null, max: number) => (s === null ? null : s.slice(0, max));

/** As colunas de `reservations` a partir da leitura, dentro dos `check` do banco. */
export function reservationColumns(
  c: ReadConfirmation,
  subject: string | null | undefined,
): Record<string, unknown> {
  const phone = c.phone ? toE164(c.phone) : null;
  const read = c.name.trim();
  const fromSubject = subject?.trim().slice(0, 120) ?? '';
  const name = read !== '' ? read : fromSubject !== '' ? fromSubject : 'Reserva recebida';
  return {
    type: c.type,
    name: name.slice(0, 120),
    start_at: wallToIso(c.start_at),
    end_at: wallToIso(c.end_at),
    confirmation_code: cut(c.confirmation_code, 80),
    amount: c.amount,
    cancel_policy: cut(c.cancel_policy, 500),
    cancel_until: c.cancel_until,
    phone: phone?.ok ? phone.e164 : null,
    address: cut(c.address, 300),
    booked_via: cut(c.booked_via, 80),
    notes: cut(c.notes, 2000),
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** O `done` de uma leitura em SSE: a confirmação, ou null quando a leitura falhou. */
export async function confirmationOf(res: Response): Promise<ReadConfirmation | null> {
  const decoder = new SseDecoder();
  const events = [...decoder.push(await res.text()), ...decoder.end()];
  const done = events.find((e) => e.type === 'done');
  if (!done) return null;
  const parsed = readConfirmationSchema.safeParse(done.data);
  return parsed.success ? parsed.data : null;
}

type Fetched = {
  bytes: Uint8Array;
  mime: string;
  filename: string;
  size: ReturnType<typeof imageSize>;
};

export async function handleInbound(req: Request, deps: InboundDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const line = (status: string, extra = '') =>
    deps.log(`inbound-mail status=${status}${extra} ms=${String(Math.round(now() - startedAt))}`);
  if (req.method !== 'POST') return json(405, { error: { code: 'method' } });
  const body = await req.text();
  if (!deps.secrets.webhook || !deps.secrets.api) {
    // sem as chaves ainda: 503, e o Resend tenta de novo (até um dia): o e-mail não se perde
    line('no_source');
    return json(503, {
      error: { code: 'no_source', message: 'O recebimento ainda não está ligado.' },
    });
  }
  const verdict = await verifySvix(body, svixHeaders(req), deps.secrets.webhook, now());
  if (!verdict.ok) {
    line('unauthorized', ` reason=${verdict.reason}`);
    return json(401, { error: { code: 'unauthorized' } });
  }
  const parsed = inboundEventSchema.safeParse(parseJson(body));
  if (!parsed.success) {
    line('bad_payload');
    return json(400, { error: { code: 'invalid_input' } });
  }
  const event = parsed.data;
  if (event.type !== 'email.received') {
    line('ignored', ` type=${event.type.replace(/[^a-z._]/g, '')}`);
    return json(200, { ignored: true });
  }
  const code = findInboxCode([...event.data.received_for, ...event.data.to]);
  if (!code) {
    line('no_code');
    return json(200, { ignored: true });
  }
  // o webhook tem prazo: a resposta vai agora, e a leitura segue no worker (D132: o waitUntil o segura)
  deps.waitUntil(
    process(deps, event, code, startedAt).catch((err: unknown) => {
      line('failed', ` error=${err instanceof Error ? err.name : 'erro'}`);
    }),
  );
  return json(200, { accepted: true });
}

async function resendGet(deps: InboundDeps, path: string): Promise<unknown> {
  const res = await deps.fetch(`${RESEND_API}${path}`, {
    headers: { Authorization: `Bearer ${deps.secrets.api ?? ''}`, accept: 'application/json' },
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`resend ${String(res.status)}`);
  return res.json();
}

async function download(deps: InboundDeps, url: string): Promise<Uint8Array | null> {
  const res = await deps.fetch(url, { signal: AbortSignal.timeout(RESEND_TIMEOUT_MS) });
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

async function fetchFiles(
  deps: InboundDeps,
  emailId: string,
  declared: number,
): Promise<{ files: Fetched[]; skipped: number }> {
  if (declared === 0) return { files: [], skipped: 0 };
  const list = attachmentListSchema.parse(
    await resendGet(deps, `/emails/receiving/${encodeURIComponent(emailId)}/attachments?limit=100`),
  );
  const files: Fetched[] = [];
  let skipped = 0;
  for (const item of list.data) {
    if (files.length >= MAX_FILES) {
      skipped++;
      continue;
    }
    const mime = mimeOf(item.content_type);
    if (!(MEDIA.mimes as readonly string[]).includes(mime) || (item.size ?? 0) > MEDIA.maxBytes) {
      skipped++;
      continue;
    }
    const bytes = await download(deps, item.download_url);
    if (!bytes || bytes.byteLength === 0 || bytes.byteLength > MEDIA.maxBytes) {
      skipped++;
      continue;
    }
    const size = mime === 'application/pdf' ? null : imageSize(bytes, mime);
    if (mime !== 'application/pdf' && !size) {
      skipped++;
      continue;
    }
    const ext = EXT[mime] ?? 'pdf';
    const given = item.filename?.trim() ?? '';
    const filename = (given !== '' ? given : `anexo.${ext}`).slice(0, 200);
    files.push({ bytes, mime, filename, size });
  }
  return { files, skipped };
}

async function process(
  deps: InboundDeps,
  event: InboundEvent,
  code: string,
  startedAt: number,
): Promise<void> {
  const now = deps.now ?? Date.now;
  const line = (status: string, extra = '') =>
    deps.log(`inbound-mail status=${status}${extra} ms=${String(Math.round(now() - startedAt))}`);
  const { data } = event;
  const owner = await deps.rpc.lookup(code, data.email_id);
  if (!owner) {
    line('no_code');
    return;
  }
  // a segunda tranca: o remetente é o e-mail da conta; o que falha é descartado em silêncio
  if (bareEmail(data.from) !== owner.email.toLowerCase()) {
    line('sender_mismatch');
    return;
  }
  if (owner.seen) {
    line('duplicate');
    return;
  }

  const content = contentSchema.parse(
    await resendGet(deps, `/emails/receiving/${encodeURIComponent(data.email_id)}`),
  );
  const subject = content.subject ?? data.subject ?? null;
  const bodyText = content.text?.trim() ? content.text.trim() : htmlToText(content.html ?? '');
  const text = [subject ? `Assunto: ${subject.trim()}` : '', bodyText]
    .filter((s) => s !== '')
    .join('\n\n')
    .slice(0, READ_MAX_CHARS);
  const { files, skipped } = await fetchFiles(deps, data.email_id, data.attachments.length);
  const bytes = files.reduce((n, f) => n + f.bytes.byteLength, 0);
  if (text.trim() === '' && files.length === 0) {
    line('empty', ` skipped=${String(skipped)}`);
    return;
  }

  // a leitura, pela mesma IA da confirmação colada; o registro em ai_imports é da dona do código
  const store = deps.ai.storeFor(owner.user_id);
  const config = IMPORT_VARIANTS[IMPORT_DEFAULT_VARIANT];
  const importId = await store.open({
    trip_id: null,
    input_chars: text.length,
    input_bytes: bytes,
    model: config.model,
    kind: 'confirmation',
  });
  const readFiles = files
    .map((f) => fileFor({ bytes: f.bytes, mime: f.mime }))
    .filter((f): f is ReadFile => f !== null);
  const confirmation = await confirmationOf(
    readRun(
      {
        store,
        openStream: deps.ai.openStream,
        waitUntil: (work) => deps.waitUntil(work),
        log: (l) => deps.log(l),
        ...(deps.now ? { now: deps.now } : {}),
      },
      {
        kind: 'confirmation',
        text: text === '' ? null : text,
        files: readFiles,
        id: importId,
        startedAt: now(),
      },
    ),
  );
  if (!confirmation) {
    line('read_failed', ` files=${String(files.length)} chars=${String(text.length)}`);
    return;
  }

  const reservation = reservationColumns(confirmation, subject);
  const tripId = await deps.rpc.tripFor(
    owner.user_id,
    reservation.start_at as string | null,
    reservation.end_at as string | null,
  );
  const stored: ReceivedFile[] = [];
  for (const f of files) {
    const id = deps.uuid();
    const ext = EXT[f.mime] ?? 'pdf';
    const path = tripId ? `${tripId}/${id}.${ext}` : `inbox/${owner.user_id}/${id}.${ext}`;
    if (!(await deps.upload(path, f.bytes, f.mime))) continue;
    stored.push({
      id,
      storage_path: path,
      filename: f.filename,
      mime: f.mime,
      size_bytes: f.bytes.byteLength,
      width: f.size?.width ?? null,
      height: f.size?.height ?? null,
    });
  }
  const out = await deps.rpc.receive({
    userId: owner.user_id,
    tripId,
    reservation,
    files: stored,
    sourceId: data.email_id,
    aiImportId: importId,
  });
  line(
    out.duplicate ? 'duplicate' : 'read_ok',
    ` trip=${tripId ? 'yes' : 'no'} files=${String(stored.length)} skipped=${String(skipped)} chars=${String(text.length)} bytes=${String(bytes)}`,
  );
}
