import { Allow, parse as parsePartial } from 'partial-json';
import { STOP_KIND_KEYS, type StopKind } from '@shared/constants.ts';
import { fromAi, validateImport, type ImportData } from '@shared/import-schema.ts';
import type { ImportErrorCode, ImportEvent } from '@shared/import-protocol.ts';

/**
 * O preview progressivo: o JSON que a IA escreve, lido pela metade com `partial-json`, vira dias e
 * paradas enquanto chega. Puro e tolerante: um pedaço que ainda não é JSON nenhum mantém o preview
 * anterior. Um item "fecha" quando o seguinte começa (ou quando a lista dele termina); só item
 * fechado entra na fila da geocodificação, e o que fechou nunca mais muda.
 */
export type PreviewStop = {
  name: string;
  kind: StopKind | null;
  time: string | null;
  closes_at: string | null;
  address: string | null;
  url: string | null;
  complete: boolean;
};
export type PreviewDay = {
  date: string | null;
  title: string | null;
  stops: PreviewStop[];
  complete: boolean;
};
export type PreviewCounts = {
  days: number;
  stops: number;
  reservations: number;
  contacts: number;
  items: number;
};
export type Preview = { days: PreviewDay[]; counts: PreviewCounts };

export const EMPTY_PREVIEW: Preview = {
  days: [],
  counts: { days: 0, stops: 0, reservations: 0, contacts: 0, items: 0 },
};

type Loose = Record<string, unknown>;
const isLoose = (v: unknown): v is Loose =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** texto vazio é ausente: a IA escreve "" no que o roteiro não diz (D129), e no meio do stream é
 * só o começo de um texto que ainda não chegou */
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const TIME = /^\d{2}:\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** campo de formato fixo só aparece inteiro: "13:" ainda não é horário */
const exact = (v: unknown, re: RegExp) => {
  const s = str(v);
  return s !== null && re.test(s) ? s : null;
};
const kindOf = (v: unknown): StopKind | null =>
  typeof v === 'string' && (STOP_KIND_KEYS as readonly string[]).includes(v)
    ? (v as StopKind)
    : null;

/** As chaves do schema na ordem em que a IA as escreve: a presença de uma fecha as anteriores. */
const TOP_ORDER = [
  'days',
  'reservations',
  'contacts',
  'checklist_before',
  'checklist_pack',
  'quests',
  'unclassified',
] as const;

function closedAfter(obj: Loose, key: (typeof TOP_ORDER)[number]): boolean {
  const i = TOP_ORDER.indexOf(key);
  return TOP_ORDER.slice(i + 1).some((k) => k in obj);
}

/** O preview do JSON acumulado até aqui. `whole`: o JSON terminou (o `done` chegou). */
export function previewOf(raw: string, whole = false): Preview | null {
  let parsed: unknown;
  try {
    parsed = parsePartial(raw, Allow.ALL);
  } catch {
    return null;
  }
  if (!isLoose(parsed)) return null;
  const daysClosed = whole || closedAfter(parsed, 'days');
  const rawDays = arr(parsed.days);
  const days = rawDays.filter(isLoose).map((day, di, all): PreviewDay => {
    const dayClosed = daysClosed || di < all.length - 1;
    const rawStops = arr(day.stops).filter(isLoose);
    return {
      date: exact(day.date, DATE),
      title: str(day.title),
      complete: dayClosed,
      stops: rawStops.map((s, si) => ({
        name: str(s.name) ?? '',
        kind: kindOf(s.kind),
        time: exact(s.time, TIME),
        closes_at: exact(s.closes_at, TIME),
        address: str(s.address),
        url: str(s.url),
        complete: dayClosed || si < rawStops.length - 1,
      })),
    };
  });
  const count = (key: (typeof TOP_ORDER)[number]) => arr(parsed[key]).length;
  return {
    days,
    counts: {
      days: days.filter((d) => d.date !== null).length,
      stops: days.reduce((n, d) => n + d.stops.filter((s) => s.name !== '').length, 0),
      reservations: count('reservations'),
      contacts: count('contacts'),
      items: count('checklist_before') + count('checklist_pack') + count('quests'),
    },
  };
}

// ---------------------------------------------------------------- a sessão de importação
export type ImportPhase =
  | { kind: 'idle' }
  /** o pedido saiu; até o primeiro pedaço, "Lendo o roteiro…" */
  | { kind: 'reading'; id: string | null }
  | { kind: 'arriving'; id: string }
  | { kind: 'review'; data: ImportData; id: string | null }
  | {
      kind: 'error';
      code: ImportErrorCode | 'offline';
      reason: string | null;
      category: string | null;
      retryAt: string | null;
    };

export type ImportSession = {
  phase: ImportPhase;
  /** o JSON acumulado: o preview sai dele, e um `truncated` revisa o que chegou */
  raw: string;
};

export const IDLE: ImportSession = { phase: { kind: 'idle' }, raw: '' };

/** Um evento da função na sessão. Puro: o mesmo stream dá sempre o mesmo estado. */
export function reduceImport(session: ImportSession, event: ImportEvent): ImportSession {
  switch (event.type) {
    case 'start':
      return { phase: { kind: 'reading', id: event.id }, raw: '' };
    case 'delta': {
      const id =
        session.phase.kind === 'reading' || session.phase.kind === 'arriving'
          ? session.phase.id
          : null;
      return { phase: { kind: 'arriving', id: id ?? '' }, raw: session.raw + event.text };
    }
    case 'done': {
      const id = session.phase.kind === 'arriving' ? session.phase.id : null;
      try {
        // o servidor já validou; o app confere de novo pelo mesmo schema
        return {
          phase: { kind: 'review', data: validateImport(event.data), id },
          raw: session.raw,
        };
      } catch {
        return failWith(session, 'invalid', 'schema');
      }
    }
    case 'error':
      return {
        phase: {
          kind: 'error',
          code: event.code,
          reason: event.reason,
          category: event.category,
          retryAt: null,
        },
        raw: session.raw,
      };
  }
}

export function failWith(
  session: ImportSession,
  code: ImportErrorCode | 'offline',
  reason: string | null = null,
  retryAt: string | null = null,
): ImportSession {
  return { phase: { kind: 'error', code, reason, category: null, retryAt }, raw: session.raw };
}

/**
 * O que chegou antes de um corte (`truncated`), como importação: só os itens fechados, para a
 * pessoa revisar e salvar. O último item de cada lista, que pode estar pela metade, fica de fora.
 * É o JSON como a IA escreve: passa pela mesma volta do servidor (`fromAi`), que tira o texto vazio.
 */
export function partialImport(raw: string): ImportData | null {
  let parsed: unknown;
  try {
    parsed = parsePartial(raw, Allow.ALL);
  } catch {
    return null;
  }
  if (!isLoose(parsed)) return null;
  const closed = <T>(key: (typeof TOP_ORDER)[number], list: T[]): T[] =>
    closedAfter(parsed, key) ? list : list.slice(0, -1);
  const days = arr(parsed.days)
    .filter(isLoose)
    .map((day, i, all) => {
      const stops = arr(day.stops).filter(isLoose);
      const dayClosed = closedAfter(parsed, 'days') || i < all.length - 1;
      return { ...day, stops: dayClosed ? stops : stops.slice(0, -1) };
    })
    // só o último dia pode sair (vazio, porque a parada dele não chegou inteira): tirar um do meio
    // mudaria o índice dos seguintes, que é a chave da revisão e da busca de lugar
    .filter((day, i, all) => day.stops.length > 0 || i < all.length - 1);
  const candidate = {
    days,
    reservations: closed('reservations', arr(parsed.reservations)),
    contacts: closed('contacts', arr(parsed.contacts)),
    checklist_before: closed('checklist_before', arr(parsed.checklist_before)),
    checklist_pack: closed('checklist_pack', arr(parsed.checklist_pack)),
    quests: closed('quests', arr(parsed.quests)),
    unclassified: closed('unclassified', arr(parsed.unclassified)),
  };
  try {
    return fromAi(candidate);
  } catch {
    return null;
  }
}
