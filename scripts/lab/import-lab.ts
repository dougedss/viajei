import { Allow, parse as parsePartial } from 'partial-json';
import {
  IMPORT_FN,
  IMPORT_MAX_CHARS,
  SseDecoder,
  type ImportEvent,
  type ImportRequest,
  type ImportUsage,
  type ImportVariant,
} from '../../supabase/functions/_shared/import-protocol.ts';
import type { ImportData } from '../../supabase/functions/_shared/import-schema.ts';
import type { LabConfig } from './env.ts';
import type { Session } from './session.ts';

/**
 * A importação no laboratório (D139): o texto fixo do cenário diário, o texto longo da medição, a
 * chamada à função publicada medida pelo stream, a nota da extração contra o esperado e o custo.
 * Nada do texto nem da resposta vai para o log; para `lab_checks.data` vão só números e nomes de
 * campo. O texto do laboratório é inventado: nenhum código, telefone ou valor real.
 */

// ------------------------------------------------------------------ o texto do cenário diário
/**
 * Uma versão curta do seed, com dois dias: um hotel com código e telefone, um contato e uma parada
 * sem horário ("de manhã"). As datas vêm por "primeiro dia" e "segundo dia": o texto é o mesmo todo
 * dia, e a viagem do laboratório muda de data.
 */
export const LAB_IMPORT_TEXT = `*Laboratório · serra em dois dias* 🚗
Saindo de Papanduva/SC.

*Primeiro dia · Papanduva → Serra*
7h saída de Papanduva, SC. Umas 6h de estrada.
13h30 Park Salto Ventoso, Farroupilha, RS. Fecha 17h. De lá são 40 min até o hotel.
16h30 check-in na Pousada Laboratório da Serra, Gramado, RS. Código da reserva LAB-7Q2X, R$ 480 as duas noites. Telefone da pousada (54) 99123-4567.

*Segundo dia · Cascatas*
De manhã, Cascata do Caracol, Canela, RS.
12h almoço no centro de Canela.

*Levar*
casaco, protetor solar
`;

/** O que o cenário confere no servidor depois de salvar. */
export const LAB_IMPORT_EXPECT = {
  untimedStop: /caracol/i,
  code: 'LAB-7Q2X',
  phone: '+5554991234567',
  minStops: 4,
} as const;

// ------------------------------------------------------------------ o texto longo da medição
const LONG_PLACES = [
  ['Mirante do Morro Azul', 'Urubici, SC', 'nature'],
  ['Serra do Corvo Branco', 'Urubici, SC', 'nature'],
  ['Cascata do Avencal', 'Urubici, SC', 'nature'],
  ['Restaurante da Serra', 'Urubici, SC', 'food'],
  ['Pousada dos Pinheiros', 'Urubici, SC', 'hotel'],
  ['Morro da Igreja', 'Urubici, SC', 'nature'],
  ['Centro de São Joaquim', 'São Joaquim, SC', 'city'],
  ['Vinícola Villa Francioni', 'São Joaquim, SC', 'winery'],
] as const;

/**
 * Um roteiro longo, perto de 30.000 caracteres: doze dias de seis paradas e a conversa do grupo
 * entre eles, como alguém cola do WhatsApp. Inventado; serve para provar o prazo da função.
 */
export function longTripText(limit = IMPORT_MAX_CHARS - 200): string {
  const lines: string[] = [
    '*Viagem longa do laboratório* 🚗',
    'Doze dias pela serra catarinense.',
    '',
  ];
  const chat = [
    '[09:12] Ana: gente, alguém confirmou o horário do café da pousada?',
    '[09:14] Beto: confirmei ontem, é das 7h às 10h',
    '[09:15] Ana: e o estacionamento? tem coberto?',
    '[09:20] Beto: tem, mas é pequeno, melhor chegar cedo',
    '[09:31] Caio: levem casaco que de noite faz frio',
  ];
  for (let day = 1; lines.join('\n').length < limit; day++) {
    lines.push(`*Dia ${day}*`);
    for (let i = 0; i < 6; i++) {
      const [name, city] = LONG_PLACES[(day + i) % LONG_PLACES.length] ?? LONG_PLACES[0];
      const hour = 7 + i * 2;
      lines.push(
        `${hour}h ${name} (dia ${day}), ${city}. Ficar umas duas horas, tirar foto do grupo e conferir o tempo antes de subir. ${30 + i * 5} min até a próxima.`,
      );
    }
    lines.push(...chat, '');
  }
  return lines.join('\n').slice(0, limit);
}

// ------------------------------------------------------------------ custo
/** US$ por milhão de tokens (entrada, saída), da página de modelos da Anthropic em 11/2026. */
export const PRICES: Readonly<Record<string, { input: number; output: number }>> = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
};

export function costUsd(model: string, usage: ImportUsage): number | null {
  const price = Object.hasOwn(PRICES, model) ? PRICES[model] : undefined;
  if (!price) return null;
  return (usage.input_tokens * price.input + usage.output_tokens * price.output) / 1_000_000;
}

// ------------------------------------------------------------------ a chamada medida
/** Quantas paradas já chegaram inteiras no JSON acumulado (a seguinte começou, ou o dia fechou). */
export function closedStops(raw: string): number {
  let parsed: unknown;
  try {
    parsed = parsePartial(raw, Allow.ALL);
  } catch {
    return 0;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return 0;
  const obj = parsed as Record<string, unknown>;
  const days = Array.isArray(obj.days) ? obj.days : [];
  const after = Object.keys(obj).some((k) => k !== 'days');
  return days.reduce<number>((n, day, i) => {
    const stops =
      typeof day === 'object' && day !== null && Array.isArray((day as { stops?: unknown }).stops)
        ? (day as { stops: unknown[] }).stops.length
        : 0;
    return n + (after || i < days.length - 1 ? stops : Math.max(0, stops - 1));
  }, 0);
}

export type TimedImport = {
  http: number;
  /** ms desde o envio: o `start`, o primeiro caractere do JSON, a primeira parada inteira, o fim */
  start_ms: number | null;
  first_char_ms: number | null;
  first_stop_ms: number | null;
  end_ms: number;
  outcome: 'done' | 'error' | 'http' | 'cut';
  code: string | null;
  reason: string | null;
  model: string | null;
  usage: ImportUsage | null;
  id: string | null;
  data: unknown;
};

/** Chama a função publicada como a pessoa de laboratório e mede o stream, evento por evento. */
export async function timedImport(
  cfg: Pick<LabConfig, 'url' | 'publishableKey'>,
  session: Session,
  body: ImportRequest & { variant?: ImportVariant },
): Promise<TimedImport> {
  const token = (await session.client.auth.getSession()).data.session?.access_token ?? '';
  const t0 = Date.now();
  const out: TimedImport = {
    http: 0,
    start_ms: null,
    first_char_ms: null,
    first_stop_ms: null,
    end_ms: 0,
    outcome: 'cut',
    code: null,
    reason: null,
    model: null,
    usage: null,
    id: null,
    data: null,
  };
  const res = await fetch(`${cfg.url}/functions/v1/${IMPORT_FN}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: cfg.publishableKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  out.http = res.status;
  if (!res.ok || !res.body) {
    const json = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    out.outcome = 'http';
    out.code = json?.error?.code ?? null;
    out.end_ms = Date.now() - t0;
    return out;
  }
  const decoder = new SseDecoder();
  const text = new TextDecoder();
  let raw = '';
  const onEvent = (event: ImportEvent) => {
    const at = Date.now() - t0;
    switch (event.type) {
      case 'start':
        out.start_ms = at;
        out.id = event.id;
        out.model = event.model;
        break;
      case 'delta':
        out.first_char_ms ??= at;
        raw += event.text;
        if (out.first_stop_ms === null && closedStops(raw) > 0) out.first_stop_ms = at;
        break;
      case 'done':
        out.outcome = 'done';
        out.model = event.model;
        out.usage = event.usage;
        out.data = event.data;
        out.first_stop_ms ??= at;
        break;
      case 'error':
        out.outcome = 'error';
        out.code = event.code;
        out.reason = event.reason ?? event.category;
        break;
    }
  };
  // o corpo da resposta do `fetch` do Node é um stream de bytes
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const event of decoder.push(text.decode(value, { stream: true }))) onEvent(event);
  }
  for (const event of decoder.end()) onEvent(event);
  out.end_ms = Date.now() - t0;
  return out;
}

// ------------------------------------------------------------------ a nota da extração
const norm = (s: string) =>
  s
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ');
const sameName = (a: string, b: string) => {
  const x = norm(a);
  const y = norm(b);
  return x === y || x.includes(y) || y.includes(x);
};
const hhmm = (t: string | null) => (t === null ? null : t.slice(0, 5));

export type ImportScore = {
  stops: { expected: number; matched: number; extra: number };
  /** campos conferidos nas paradas, reservas e contatos encontrados */
  fields: { total: number; ok: number };
  /** campo preenchido que o texto não tem (o esperado é null): "Hotel Steffen.time" */
  invented: string[];
  /** campo com valor diferente do esperado */
  wrong: string[];
};

/** A extração contra o esperado (o seed sem coordenadas), campo a campo. */
export function scoreImport(expected: ImportData, got: ImportData): ImportScore {
  const score: ImportScore = {
    stops: { expected: 0, matched: 0, extra: 0 },
    fields: { total: 0, ok: 0 },
    invented: [],
    wrong: [],
  };
  const compare = (label: string, want: unknown, have: unknown) => {
    score.fields.total += 1;
    if (want === have) score.fields.ok += 1;
    else if (want === null) score.invented.push(label);
    else score.wrong.push(label);
  };
  for (const day of expected.days) {
    const gotDay = got.days.find((d) => d.date === day.date);
    const pool = [...(gotDay?.stops ?? [])];
    for (const stop of day.stops) {
      score.stops.expected += 1;
      const i = pool.findIndex((s) => sameName(s.name, stop.name));
      const found = i >= 0 ? pool.splice(i, 1)[0] : undefined;
      if (!found) continue;
      score.stops.matched += 1;
      compare(`${stop.name}.kind`, stop.kind, found.kind);
      compare(`${stop.name}.time`, hhmm(stop.time), hhmm(found.time));
      compare(`${stop.name}.closes_at`, hhmm(stop.closes_at), hhmm(found.closes_at));
      compare(
        `${stop.name}.travel_minutes_to_next`,
        stop.travel_minutes_to_next,
        found.travel_minutes_to_next,
      );
    }
    score.stops.extra += pool.length;
  }
  score.stops.extra += got.days
    .filter((d) => !expected.days.some((e) => e.date === d.date))
    .reduce((n, d) => n + d.stops.length, 0);
  for (const r of expected.reservations) {
    const found = got.reservations.find((g) => sameName(g.name, r.name));
    if (!found) {
      score.wrong.push(`${r.name}.reserva`);
      continue;
    }
    for (const key of [
      'confirmation_code',
      'amount',
      'start_at',
      'end_at',
      'cancel_until',
    ] as const) {
      compare(`${r.name}.${key}`, r[key], found[key]);
    }
  }
  for (const c of expected.contacts) {
    const found = got.contacts.find((g) => sameName(g.name, c.name));
    if (!found) {
      score.wrong.push(`${c.name}.contato`);
      continue;
    }
    compare(`${c.name}.phone`, c.phone, found.phone);
  }
  return score;
}
