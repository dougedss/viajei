import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { describe, expect, it } from 'vitest';
import { anthropicRecording } from '@/test/fixtures/import-recording.ts';
import { type ImportClose, type ImportStore, type OpenStream } from './import-handler.ts';
import { SseDecoder, type ImportEvent } from './import-protocol.ts';
import { handleRead, type FetchedFile } from './read-handler.ts';
import {
  toAiConfirmation,
  toAiReceipt,
  type ReadConfirmation,
  type ReadReceipt,
} from './read-protocol.ts';

/**
 * O handler com entrada fixa: um client da Anthropic de mentira que devolve a gravação, um Storage de
 * mentira com um PDF e uma imagem pequenos, e um banco de mentira que guarda o que recebeu. Sem rede,
 * sem chave; nada do texto nem do anexo vai para o log.
 */
const TRIP_ID = '0faf1ff2-99ca-482a-a110-44dbb03df182';
const IMPORT_ID = '0b8f5f8e-2f2a-4d55-9f3b-6f0a1c2d3e4f';
const PDF_PATH = `${TRIP_ID}/0b8f5f8e-2f2a-4d55-9f3b-6f0a1c2d3e4f.pdf`;
const JPG_PATH = `${TRIP_ID}/1c9f5f8e-2f2a-4d55-9f3b-6f0a1c2d3e4f.jpg`;
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const JPG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const CONFIRMATION: ReadConfirmation = {
  type: 'hotel',
  name: 'Vila Suzana Parque Hotel',
  start_at: '2026-12-13T14:00',
  end_at: '2026-12-14T12:00',
  confirmation_code: '4821-339',
  amount: 463,
  cancel_policy: null,
  cancel_until: '2026-12-08',
  phone: null,
  address: null,
  booked_via: 'Booking',
  notes: null,
};
const RECEIPT: ReadReceipt = {
  total: 187.4,
  merchant: 'Posto da Serra',
  cnpj: '12345678000195',
  date: '2026-12-12',
  time: '15:42',
  category: 'fuel',
  access_key: null,
};

const post = (json: unknown) =>
  new Request('https://x.supabase.co/functions/v1/read-document', {
    method: 'POST',
    body: JSON.stringify(json),
  });

type Recording = ReturnType<typeof anthropicRecording>;

function fakeAnthropic(recording: Recording) {
  const calls: BetaMessageStreamParams[] = [];
  const open: OpenStream = (params, { signal }) => {
    calls.push(params);
    const abortError = () => new Anthropic.APIUserAbortError();
    async function* events() {
      for (const event of recording.events) {
        await Promise.resolve();
        if (signal.aborted) throw abortError();
        yield event;
      }
    }
    return {
      [Symbol.asyncIterator]: () => events(),
      finalMessage: () =>
        signal.aborted ? Promise.reject(abortError()) : Promise.resolve(recording.message),
    };
  };
  return { open, calls };
}

function fakeStore(over: Partial<ImportStore> = {}) {
  const opened: Parameters<ImportStore['open']>[0][] = [];
  const closed: ImportClose[] = [];
  const claims: [string, number][] = [];
  const store: ImportStore = {
    claim: (fn, limit) => {
      claims.push([fn, limit]);
      return Promise.resolve({ ok: true });
    },
    isLab: () => Promise.resolve(false),
    tripOnServer: () => Promise.resolve(true),
    open: (row) => {
      opened.push(row);
      return Promise.resolve(IMPORT_ID);
    },
    close: (_id, row) => {
      closed.push(row);
      return Promise.resolve();
    },
    ...over,
  };
  return { store, opened, closed, claims };
}

const FILES: Record<string, FetchedFile> = {
  [PDF_PATH]: { bytes: PDF_BYTES, mime: 'application/pdf' },
  [JPG_PATH]: { bytes: JPG_BYTES, mime: 'image/jpeg' },
};

async function run(
  request: Request,
  recording: Recording,
  options: { store?: Partial<ImportStore>; files?: Record<string, FetchedFile> } = {},
) {
  const anthropic = fakeAnthropic(recording);
  const db = fakeStore(options.store);
  const pending: Promise<unknown>[] = [];
  const logs: string[] = [];
  const fetched: string[] = [];
  const files = options.files ?? FILES;
  const res = await handleRead(request, {
    store: db.store,
    openStream: anthropic.open,
    waitUntil: (work) => pending.push(work),
    log: (line) => logs.push(line),
    fetchFile: (path) => {
      fetched.push(path);
      return Promise.resolve(files[path] ?? null);
    },
  });
  return { res, anthropic, db, pending, logs, fetched };
}

async function events(res: Response): Promise<ImportEvent[]> {
  const decoder = new SseDecoder();
  return [...decoder.push(await res.text()), ...decoder.end()];
}

describe('read-document com a resposta gravada', () => {
  it('o texto colado vira a reserva: a cota da confirmação, o kind no registro, nada da pessoa no log', async () => {
    const json = JSON.stringify(toAiConfirmation(CONFIRMATION));
    const { res, pending, db, anthropic, logs } = await run(
      post({
        kind: 'confirmation',
        trip_id: TRIP_ID,
        text: 'Reserva confirmada! Vila Suzana…',
        attachment: null,
      }),
      anthropicRecording(json),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const list = await events(res);
    await Promise.all(pending);
    expect(list[0]).toEqual({ type: 'start', id: IMPORT_ID, model: 'claude-sonnet-5-5' });
    const done = list.at(-1);
    expect(done?.type).toBe('done');
    if (done?.type !== 'done') throw new Error('sem done');
    expect(done.data).toEqual(CONFIRMATION);
    expect(db.claims).toEqual([['read-confirmation', 20]]);
    expect(db.opened).toEqual([
      {
        trip_id: TRIP_ID,
        input_chars: 32,
        input_bytes: 0,
        model: 'claude-sonnet-5-5',
        kind: 'confirmation',
      },
    ]);
    expect(db.closed[0]).toMatchObject({ status: 'succeeded', error: null });
    const params = anthropic.calls[0];
    expect(params?.output_config?.effort).toBe('low');
    const content = params?.messages[0]?.content;
    expect(Array.isArray(content) && content.length).toBe(1);
    expect(logs.join('\n')).not.toContain('Vila Suzana');
    expect(logs.at(-1)).toContain('read-confirmation id=');
    expect(logs.at(-1)).toContain('status=succeeded');
  });

  it('o anexo é lido do Storage pelo caminho e vai à IA antes do texto, em base64; os bytes ficam no registro', async () => {
    const json = JSON.stringify(toAiConfirmation(CONFIRMATION));
    const { res, pending, db, anthropic, fetched } = await run(
      post({ kind: 'confirmation', trip_id: TRIP_ID, text: null, attachment: { path: PDF_PATH } }),
      anthropicRecording(json),
    );
    expect(res.status).toBe(200);
    await events(res);
    await Promise.all(pending);
    expect(fetched).toEqual([PDF_PATH]);
    const content = anthropic.calls[0]?.messages[0]?.content;
    if (!Array.isArray(content)) throw new Error('conteúdo não é lista');
    expect(content.map((b) => b.type)).toEqual(['document', 'text']);
    expect(content[0]).toEqual({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0xLjQ=' },
    });
    expect(db.opened[0]).toMatchObject({
      input_chars: 0,
      input_bytes: PDF_BYTES.byteLength,
      kind: 'confirmation',
    });
  });

  it('a nota: a foto vira o gasto, pela cota da nota', async () => {
    const json = JSON.stringify(toAiReceipt(RECEIPT));
    const { res, pending, db, anthropic } = await run(
      post({ kind: 'receipt', trip_id: TRIP_ID, text: null, attachment: { path: JPG_PATH } }),
      anthropicRecording(json),
    );
    const list = await events(res);
    await Promise.all(pending);
    const done = list.at(-1);
    if (done?.type !== 'done') throw new Error('sem done');
    expect(done.data).toEqual(RECEIPT);
    expect(db.claims).toEqual([['read-receipt', 30]]);
    expect(db.opened[0]).toMatchObject({ kind: 'receipt', input_bytes: JPG_BYTES.byteLength });
    const content = anthropic.calls[0]?.messages[0]?.content;
    if (!Array.isArray(content)) throw new Error('conteúdo não é lista');
    expect(content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/4AAQ' },
    });
  });

  it('a nota só se lê pela foto; a confirmação pede texto ou anexo', async () => {
    const recording = anthropicRecording('{}');
    const noFile = await run(
      post({ kind: 'receipt', trip_id: TRIP_ID, text: 'nota', attachment: null }),
      recording,
    );
    expect(noFile.res.status).toBe(400);
    const nothing = await run(
      post({ kind: 'confirmation', trip_id: null, text: '  ', attachment: null }),
      recording,
    );
    expect(nothing.res.status).toBe(400);
    expect(noFile.db.claims).toEqual([]);
    expect(nothing.db.opened).toEqual([]);
  });

  it('um anexo que não está no Storage (ou que a pessoa não pode ler) é 404, depois da cota e antes da IA', async () => {
    const { res, db, anthropic } = await run(
      post({
        kind: 'confirmation',
        trip_id: TRIP_ID,
        text: null,
        attachment: { path: `${TRIP_ID}/2c9f5f8e-2f2a-4d55-9f3b-6f0a1c2d3e4f.pdf` },
      }),
      anthropicRecording('{}'),
    );
    expect(res.status).toBe(404);
    expect(db.claims).toHaveLength(1);
    expect(db.opened).toEqual([]);
    expect(anthropic.calls).toEqual([]);
  });

  it('um anexo acima de 10 MB ou de outro tipo é recusado sem gastar leitura', async () => {
    const big = { bytes: new Uint8Array(10 * 1024 * 1024 + 1), mime: 'image/jpeg' };
    const tooBig = await run(
      post({ kind: 'confirmation', trip_id: TRIP_ID, text: null, attachment: { path: JPG_PATH } }),
      anthropicRecording('{}'),
      { files: { [JPG_PATH]: big } },
    );
    expect(tooBig.res.status).toBe(413);
    const other = await run(
      post({ kind: 'confirmation', trip_id: TRIP_ID, text: null, attachment: { path: JPG_PATH } }),
      anthropicRecording('{}'),
      { files: { [JPG_PATH]: { bytes: JPG_BYTES, mime: 'image/heic' } } },
    );
    expect(other.res.status).toBe(400);
    expect(other.db.opened).toEqual([]);
  });

  it('a cota esgotada responde 429 com a hora da volta, antes de buscar o anexo', async () => {
    const { res, fetched } = await run(
      post({ kind: 'confirmation', trip_id: TRIP_ID, text: null, attachment: { path: PDF_PATH } }),
      anthropicRecording('{}'),
      { store: { claim: () => Promise.resolve({ ok: false, retryAt: '2026-11-21T10:00:00Z' }) } },
    );
    expect(res.status).toBe(429);
    expect(fetched).toEqual([]);
    const body = (await res.json()) as { error: { code: string; retry_at: string } };
    expect(body.error.code).toBe('rate_limited');
    expect(body.error.retry_at).toBe('2026-11-21T10:00:00Z');
  });

  it('uma resposta fora do schema fecha o registro como invalid, sem quebrar', async () => {
    const { res, pending, db } = await run(
      post({ kind: 'confirmation', trip_id: TRIP_ID, text: 'x', attachment: null }),
      anthropicRecording(JSON.stringify({ type: 'flight', name: 'x' })),
    );
    const list = await events(res);
    await Promise.all(pending);
    expect(list.at(-1)).toMatchObject({ type: 'error', code: 'invalid', reason: 'schema' });
    expect(db.closed[0]).toMatchObject({ status: 'invalid', error: 'schema' });
  });

  it('a viagem que ainda não subiu fica fora do registro', async () => {
    const { db, pending, res } = await run(
      post({ kind: 'confirmation', trip_id: TRIP_ID, text: 'x', attachment: null }),
      anthropicRecording(JSON.stringify(toAiConfirmation(CONFIRMATION))),
      { store: { tripOnServer: () => Promise.resolve(false) } },
    );
    await events(res);
    await Promise.all(pending);
    expect(db.opened[0]?.trip_id).toBeNull();
  });
});
