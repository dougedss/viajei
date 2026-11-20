import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { describe, expect, it } from 'vitest';
import { anthropicRecording } from '@/test/fixtures/import-recording.ts';
import type { ImportClose, ImportStore, OpenStream } from './import-handler.ts';
import {
  handleInbound,
  htmlToText,
  mimeOf,
  reservationColumns,
  RESEND_API,
  type InboundDeps,
  type InboundOwner,
  type ReceiveInput,
} from './inbound-handler.ts';
import { toAiConfirmation, type ReadConfirmation } from './read-protocol.ts';
import { signSvix } from './svix.ts';

/**
 * O handler com tudo de mentira: o webhook assinado com um segredo de teste, a API do Resend (o
 * conteúdo e os anexos, um PDF e um PNG pequenos), as três RPCs, o Storage e a IA com a resposta
 * gravada. Nada do e-mail pode aparecer no log.
 */
const SECRET = 'whsec_plJ3nmyCDGBKInavdOK15jsl';
const API = 're_chave_de_teste';
const USER = 'a8111111-1111-4111-8111-111111111111';
const TRIP = 'e8111111-1111-4111-8111-111111111111';
const EMAIL_ID = '56761188-7520-42d8-8898-ff6fc54ce618';
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x04,
  0x92, 0, 0, 0x09, 0xe4, 8, 2, 0, 0, 0, 0, 0, 0, 0,
]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

const CONFIRMATION: ReadConfirmation = {
  type: 'hotel',
  name: 'Vila Suzana Parque Hotel',
  start_at: '2026-12-13T14:00',
  end_at: '2026-12-14T12:00',
  confirmation_code: '4821-339',
  amount: 463,
  cancel_policy: null,
  cancel_until: '2026-12-08',
  phone: '(54) 3282-1234',
  address: null,
  booked_via: 'Booking',
  notes: null,
};

function event(over: Record<string, unknown> = {}, attachments = true) {
  return {
    type: 'email.received',
    created_at: '2026-11-20T12:00:00.000Z',
    data: {
      email_id: EMAIL_ID,
      created_at: '2026-11-20T11:59:59.000Z',
      from: 'Douglas <G1@teste.local>',
      to: ['r-7f3k9m@reservas.reitechia.com.br'],
      bcc: [],
      cc: [],
      received_for: ['r-7f3k9m@reservas.reitechia.com.br'],
      message_id: '<111@email.example.com>',
      subject: 'Fwd: Sua reserva está confirmada',
      attachments: attachments
        ? [
            {
              id: 'att-1',
              filename: 'voucher.pdf',
              content_type: 'application/pdf',
              content_disposition: 'attachment',
              content_id: null,
            },
            {
              id: 'att-2',
              filename: 'print.png',
              content_type: 'image/png',
              content_disposition: 'inline',
              content_id: 'img1',
            },
            {
              id: 'att-3',
              filename: 'assinatura.gif',
              content_type: 'image/gif',
              content_disposition: 'inline',
              content_id: 'img2',
            },
          ]
        : [],
      ...over,
    },
  };
}

async function signed(body: string, secret = SECRET, now = Date.now()) {
  const ts = String(Math.floor(now / 1000));
  return new Request('https://x.supabase.co/functions/v1/inbound-mail', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': 'msg_1',
      'svix-timestamp': ts,
      'svix-signature': await signSvix(body, 'msg_1', ts, secret),
    },
    body,
  });
}

function fakeAnthropic(json: string) {
  const recording = anthropicRecording(json);
  const calls: BetaMessageStreamParams[] = [];
  const open: OpenStream = (params, { signal }) => {
    calls.push(params);
    async function* events() {
      for (const e of recording.events) {
        await Promise.resolve();
        if (signal.aborted) throw new Anthropic.APIUserAbortError();
        yield e;
      }
    }
    return {
      [Symbol.asyncIterator]: () => events(),
      finalMessage: () => Promise.resolve(recording.message),
    };
  };
  return { open, calls };
}

type Harness = ReturnType<typeof harness>;
function harness(
  options: {
    owner?: InboundOwner | null;
    trip?: string | null;
    json?: string;
    content?: Record<string, unknown>;
    uploadOk?: boolean;
  } = {},
) {
  const owner =
    options.owner === undefined
      ? { user_id: USER, email: 'g1@teste.local', seen: false, lab: false }
      : options.owner;
  const opened: Parameters<ImportStore['open']>[0][] = [];
  const closed: ImportClose[] = [];
  const openedFor: string[] = [];
  const uploads: { path: string; bytes: number; mime: string }[] = [];
  const received: ReceiveInput[] = [];
  const lookups: [string, string][] = [];
  const trips: [string, string | null, string | null][] = [];
  const fetched: string[] = [];
  const logs: string[] = [];
  const pending: Promise<unknown>[] = [];
  const ai = fakeAnthropic(options.json ?? JSON.stringify(toAiConfirmation(CONFIRMATION)));
  let seq = 0;
  const content = options.content ?? {
    object: 'email',
    id: EMAIL_ID,
    subject: 'Fwd: Sua reserva está confirmada',
    text: null,
    html: '<html><body><p>Olá!</p><p>Reserva <b>4821-339</b> confirmada &amp; paga.</p></body></html>',
  };
  const deps: InboundDeps = {
    secrets: { webhook: SECRET, api: API },
    fetch: (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      fetched.push(url);
      const auth = new Headers(init?.headers).get('authorization');
      if (url.startsWith(RESEND_API) && auth !== `Bearer ${API}`) {
        return Promise.resolve(new Response('{"message":"unauthorized"}', { status: 401 }));
      }
      if (url === `${RESEND_API}/emails/receiving/${EMAIL_ID}`) {
        return Promise.resolve(Response.json(content));
      }
      if (url === `${RESEND_API}/emails/receiving/${EMAIL_ID}/attachments?limit=100`) {
        return Promise.resolve(
          Response.json({
            object: 'list',
            has_more: false,
            data: [
              {
                id: 'att-1',
                filename: 'voucher.pdf',
                size: PDF.byteLength,
                content_type: 'application/pdf',
                content_disposition: 'attachment',
                content_id: null,
                download_url: 'https://inbound-cdn.resend.com/att-1',
                expires_at: '2026-11-20T13:00:00Z',
              },
              {
                id: 'att-2',
                filename: 'print.png',
                size: PNG.byteLength,
                content_type: 'image/png',
                content_disposition: 'inline',
                content_id: 'img1',
                download_url: 'https://inbound-cdn.resend.com/att-2',
                expires_at: '2026-11-20T13:00:00Z',
              },
              {
                id: 'att-3',
                filename: 'assinatura.gif',
                size: 100,
                content_type: 'image/gif',
                content_disposition: 'inline',
                content_id: 'img2',
                download_url: 'https://inbound-cdn.resend.com/att-3',
                expires_at: '2026-11-20T13:00:00Z',
              },
              {
                id: 'att-4',
                filename: 'grande.pdf',
                size: 11 * 1024 * 1024,
                content_type: 'application/pdf',
                content_disposition: 'attachment',
                content_id: null,
                download_url: 'https://inbound-cdn.resend.com/att-4',
                expires_at: '2026-11-20T13:00:00Z',
              },
            ],
          }),
        );
      }
      if (url === 'https://inbound-cdn.resend.com/att-1') return Promise.resolve(new Response(PDF));
      if (url === 'https://inbound-cdn.resend.com/att-2') return Promise.resolve(new Response(PNG));
      return Promise.resolve(new Response('não achado', { status: 404 }));
    },
    rpc: {
      lookup: (code, sourceId) => {
        lookups.push([code, sourceId]);
        return Promise.resolve(owner);
      },
      tripFor: (userId, start, end) => {
        trips.push([userId, start, end]);
        return Promise.resolve(options.trip === undefined ? TRIP : options.trip);
      },
      receive: (input) => {
        received.push(input);
        return Promise.resolve({
          received_id: 'rr-1',
          reservation_id: input.tripId ? 'res-1' : null,
          duplicate: false,
        });
      },
    },
    upload: (path, bytes, mime) => {
      uploads.push({ path, bytes: bytes.byteLength, mime });
      return Promise.resolve(options.uploadOk ?? true);
    },
    ai: {
      openStream: ai.open,
      storeFor: (userId) => {
        openedFor.push(userId);
        return {
          claim: () => Promise.resolve({ ok: true }),
          isLab: () => Promise.resolve(false),
          tripOnServer: () => Promise.resolve(false),
          open: (row) => {
            opened.push(row);
            return Promise.resolve('0b8f5f8e-2f2a-4d55-9f3b-6f0a1c2d3e4f');
          },
          close: (_id, row) => {
            closed.push(row);
            return Promise.resolve();
          },
        };
      },
    },
    uuid: () => `c0ffee00-0000-4000-8000-00000000000${String(++seq)}`,
    waitUntil: (work) => pending.push(work),
    log: (line) => logs.push(line),
  };
  const settle = async () => {
    // a leitura em segundo plano (o waitUntil) pode enfileirar mais trabalho (o registro que fecha)
    for (let i = 0; i < 5; i++) await Promise.all([...pending]);
  };
  return {
    deps,
    ai,
    opened,
    closed,
    openedFor,
    uploads,
    received,
    lookups,
    trips,
    fetched,
    logs,
    settle,
  };
}

const text = (logs: string[]) => logs.join('\n');

describe('inbound-mail', () => {
  it('um e-mail encaminhado vira a reserva na viagem pelas datas, com os anexos na pasta dela; 200 na hora', async () => {
    const h: Harness = harness();
    const body = JSON.stringify(event());
    const res = await handleInbound(await signed(body), h.deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepted: true });
    await h.settle();

    expect(h.lookups).toEqual([['r-7f3k9m', EMAIL_ID]]);
    expect(h.fetched).toEqual([
      `${RESEND_API}/emails/receiving/${EMAIL_ID}`,
      `${RESEND_API}/emails/receiving/${EMAIL_ID}/attachments?limit=100`,
      'https://inbound-cdn.resend.com/att-1',
      'https://inbound-cdn.resend.com/att-2',
    ]);
    // a IA recebeu o PDF e a imagem antes do texto, e o texto com o assunto e o corpo em texto corrido
    const content = h.ai.calls[0]?.messages[0]?.content;
    if (!Array.isArray(content)) throw new Error('conteúdo não é lista');
    expect(content.map((b) => b.type)).toEqual(['document', 'image', 'text']);
    const prompt = content[2];
    if (prompt?.type !== 'text') throw new Error('sem texto');
    expect(prompt.text).toContain('Assunto: Fwd: Sua reserva está confirmada');
    expect(prompt.text).toContain('Reserva 4821-339 confirmada & paga.');
    expect(prompt.text).not.toContain('<b>');
    // o registro em ai_imports é da dona do código, com os bytes dos anexos
    expect(h.openedFor).toEqual([USER]);
    expect(h.opened[0]).toMatchObject({
      kind: 'confirmation',
      input_bytes: PDF.byteLength + PNG.byteLength,
      trip_id: null,
    });
    expect(h.closed[0]).toMatchObject({ status: 'succeeded' });
    // a viagem pelas datas (em São Paulo), os objetos na pasta dela, e a RPC com as colunas
    expect(h.trips).toEqual([[USER, '2026-12-13T14:00:00-03:00', '2026-12-14T12:00:00-03:00']]);
    expect(h.uploads).toEqual([
      {
        path: `${TRIP}/c0ffee00-0000-4000-8000-000000000001.pdf`,
        bytes: PDF.byteLength,
        mime: 'application/pdf',
      },
      {
        path: `${TRIP}/c0ffee00-0000-4000-8000-000000000002.png`,
        bytes: PNG.byteLength,
        mime: 'image/png',
      },
    ]);
    expect(h.received).toHaveLength(1);
    const r = h.received[0];
    expect(r).toMatchObject({
      userId: USER,
      tripId: TRIP,
      sourceId: EMAIL_ID,
      aiImportId: '0b8f5f8e-2f2a-4d55-9f3b-6f0a1c2d3e4f',
    });
    expect(r?.reservation).toEqual({
      type: 'hotel',
      name: 'Vila Suzana Parque Hotel',
      start_at: '2026-12-13T14:00:00-03:00',
      end_at: '2026-12-14T12:00:00-03:00',
      confirmation_code: '4821-339',
      amount: 463,
      cancel_policy: null,
      cancel_until: '2026-12-08',
      phone: '+555432821234',
      address: null,
      booked_via: 'Booking',
      notes: null,
    });
    expect(r?.files).toEqual([
      {
        id: 'c0ffee00-0000-4000-8000-000000000001',
        storage_path: `${TRIP}/c0ffee00-0000-4000-8000-000000000001.pdf`,
        filename: 'voucher.pdf',
        mime: 'application/pdf',
        size_bytes: PDF.byteLength,
        width: null,
        height: null,
      },
      {
        id: 'c0ffee00-0000-4000-8000-000000000002',
        storage_path: `${TRIP}/c0ffee00-0000-4000-8000-000000000002.png`,
        filename: 'print.png',
        mime: 'image/png',
        size_bytes: PNG.byteLength,
        width: 1170,
        height: 2532,
      },
    ]);
    // o log: códigos e números, nunca o assunto, o remetente, o corpo ou o código do endereço
    expect(text(h.logs)).toContain('status=read_ok trip=yes files=2 skipped=2');
    for (const secret of ['teste.local', 'Vila Suzana', 'r-7f3k9m', 'confirmada', '4821']) {
      expect(text(h.logs)).not.toContain(secret);
    }
  });

  it('sem viagem pelas datas, a recebida com os anexos na caixa de entrada da pessoa', async () => {
    const h = harness({ trip: null });
    await handleInbound(await signed(JSON.stringify(event())), h.deps);
    await h.settle();
    expect(h.uploads.map((u) => u.path)).toEqual([
      `inbox/${USER}/c0ffee00-0000-4000-8000-000000000001.pdf`,
      `inbox/${USER}/c0ffee00-0000-4000-8000-000000000002.png`,
    ]);
    expect(h.received[0]?.tripId).toBeNull();
    expect(text(h.logs)).toContain('status=read_ok trip=no files=2');
  });

  it('a assinatura errada é 401; sem as chaves, 503 no_source (o Resend tenta de novo); outro evento, 200 e nada', async () => {
    const body = JSON.stringify(event());
    const bad = harness();
    const forged = await signed(body, 'whsec_b3V0cm8tc2VncmVkbw==');
    expect((await handleInbound(forged, bad.deps)).status).toBe(401);
    const noSecret = harness();
    noSecret.deps.secrets = { webhook: undefined, api: API };
    const res = await handleInbound(await signed(body), noSecret.deps);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('no_source');
    const noApi = harness();
    noApi.deps.secrets = { webhook: SECRET, api: undefined };
    expect((await handleInbound(await signed(body), noApi.deps)).status).toBe(503);
    const other = harness();
    const sent = await handleInbound(
      await signed(JSON.stringify({ ...event(), type: 'email.sent' })),
      other.deps,
    );
    expect(await sent.json()).toEqual({ ignored: true });
    await other.settle();
    expect(other.lookups).toEqual([]);
    expect(bad.fetched).toEqual([]);
    expect(text(bad.logs)).toContain('status=unauthorized');
  });

  it('sem código nos destinatários, ou com um código de ninguém: nada é buscado', async () => {
    const h = harness();
    const res = await handleInbound(
      await signed(
        JSON.stringify(event({ to: ['alguem@exemplo.com'], received_for: ['alguem@exemplo.com'] })),
      ),
      h.deps,
    );
    expect(await res.json()).toEqual({ ignored: true });
    await h.settle();
    expect(h.lookups).toEqual([]);
    const nobody = harness({ owner: null });
    await handleInbound(await signed(JSON.stringify(event())), nobody.deps);
    await nobody.settle();
    expect(nobody.fetched).toEqual([]);
    expect(text(nobody.logs)).toContain('status=no_code');
  });

  it('o remetente que não é o e-mail da conta é descartado em silêncio, antes de buscar qualquer coisa', async () => {
    const h = harness();
    await handleInbound(await signed(JSON.stringify(event({ from: 'spam@outro.com' }))), h.deps);
    await h.settle();
    expect(h.fetched).toEqual([]);
    expect(h.received).toEqual([]);
    expect(text(h.logs)).toContain('status=sender_mismatch');
    expect(text(h.logs)).not.toContain('outro.com');
  });

  it('a conta do laboratório aceita também o remetente do app (o e-mail de teste); as outras, não', async () => {
    const lab = harness({
      owner: { user_id: USER, email: 'lab-a@viajei.invalid', seen: false, lab: true },
    });
    await handleInbound(
      await signed(JSON.stringify(event({ from: 'Viajei <viajei@reitechia.com.br>' }))),
      lab.deps,
    );
    await lab.settle();
    expect(lab.received).toHaveLength(1);
    const person = harness();
    await handleInbound(
      await signed(JSON.stringify(event({ from: 'Viajei <viajei@reitechia.com.br>' }))),
      person.deps,
    );
    await person.settle();
    expect(person.received).toEqual([]);
    expect(text(person.logs)).toContain('status=sender_mismatch');
  });

  it('o mesmo e-mail de novo (o webhook repetiu) não é lido outra vez', async () => {
    const h = harness({
      owner: { user_id: USER, email: 'g1@teste.local', seen: true, lab: false },
    });
    await handleInbound(await signed(JSON.stringify(event())), h.deps);
    await h.settle();
    expect(h.fetched).toEqual([]);
    expect(h.opened).toEqual([]);
    expect(text(h.logs)).toContain('status=duplicate');
  });

  it('a leitura que falha não grava nada (o e-mail não fica guardado)', async () => {
    const h = harness({ json: JSON.stringify({ type: 'flight' }) });
    await handleInbound(await signed(JSON.stringify(event())), h.deps);
    await h.settle();
    expect(h.received).toEqual([]);
    expect(h.uploads).toEqual([]);
    expect(h.closed[0]).toMatchObject({ status: 'invalid' });
    expect(text(h.logs)).toContain('status=read_failed');
  });

  it('um e-mail só com texto, sem anexos, não pede a lista de anexos; sem nome na leitura, o assunto vale', async () => {
    const h = harness({
      json: JSON.stringify(toAiConfirmation({ ...CONFIRMATION, name: '' })),
      content: {
        subject: 'Reserva Pousada Nova',
        text: 'Reserva confirmada para 13/12.',
        html: null,
      },
    });
    await handleInbound(await signed(JSON.stringify(event({}, false))), h.deps);
    await h.settle();
    expect(h.fetched).toEqual([`${RESEND_API}/emails/receiving/${EMAIL_ID}`]);
    expect(h.received[0]?.reservation.name).toBe('Reserva Pousada Nova');
    expect(h.received[0]?.files).toEqual([]);
  });
});

describe('as peças puras', () => {
  it('htmlToText tira scripts e tags, quebra onde o layout quebra e decodifica as entidades', () => {
    expect(
      htmlToText(
        '<html><head><style>p{}</style></head><body><script>x()</script><h1>Olá</h1><p>Reserva&nbsp;<b>4821</b> &amp; paga &#x1F600; &#169;</p><br><div>Fim</div></body></html>',
      ),
    ).toBe('Olá\nReserva 4821 & paga 😀 ©\n\nFim');
  });

  it('mimeOf tira os parâmetros e normaliza image/jpg', () => {
    expect(mimeOf('image/JPEG; charset=binary')).toBe('image/jpeg');
    expect(mimeOf('image/jpg')).toBe('image/jpeg');
    expect(mimeOf(null)).toBe('');
  });

  it('reservationColumns: os limites do banco e o telefone em E.164; sem nome, o assunto; sem assunto, "Reserva recebida"', () => {
    const long = 'x'.repeat(200);
    const cols = reservationColumns(
      { ...CONFIRMATION, name: long, confirmation_code: long, phone: '3282-1234' },
      'Assunto',
    );
    expect((cols.name as string).length).toBe(120);
    expect((cols.confirmation_code as string).length).toBe(80);
    expect(cols.phone).toBeNull();
    expect(reservationColumns({ ...CONFIRMATION, name: '  ' }, null).name).toBe('Reserva recebida');
    expect(
      reservationColumns({ ...CONFIRMATION, start_at: null, end_at: null }, null),
    ).toMatchObject({ start_at: null, end_at: null });
  });
});
