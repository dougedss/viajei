import {
  CONTACT_TYPES,
  CONTACT_TYPE_KEYS,
  RESERVATION_TYPES,
  RESERVATION_TYPE_KEYS,
  STOP_KINDS,
  STOP_KIND_KEYS,
  type ContactType,
  type ReservationType,
  type StopKind,
} from '@shared/constants.ts';
import {
  validateImport,
  type ImportContact,
  type ImportData,
  type ImportDay,
  type ImportQuest,
  type ImportReservation,
  type ImportStop,
} from '@shared/import-schema.ts';
import { parseMoney } from '@/features/trips/rules.ts';

/**
 * O formato do Viajei (`viajei/1`, fase 17): um texto legível com marcação leve, lido no aparelho, sem
 * IA e sem internet. É o que "Copiar roteiro como texto" escreve de qualquer viagem e o que o pedido
 * pronto para outras IAs pede de volta. Puro: o leitor devolve o cabeçalho da viagem e um `ImportData`
 * (a mesma revisão da importação lê os dois), ou os erros com a linha; o escritor é o inverso, e
 * `ler(escrever(x))` é `x`. O JSON do `importSchema` colado também é aceito.
 *
 *     viajei/1
 *     # RS — concurso em Montenegro
 *     datas: 11/12/2026 a 14/12/2026
 *     origem: Papanduva, SC
 *     orçamento: R$ 3.000,00
 *
 *     ## 11/12/2026 · Papanduva → Serra Gaúcha
 *     - 07:00 origem Saída de Papanduva · Papanduva, SC
 *       até a próxima: 390 min
 *     - 13:30 natureza Park Salto Ventoso · Nova Sardenha, Farroupilha, RS · https://…
 *       fecha: 17:00
 *
 *     ## Reservas
 *     - hotel Hotel Steffen
 *       parada: Hotel Steffen
 *       entrada: 11/12/2026 16:30
 *
 * Uma linha por parada: a hora (opcional), o tipo (a chave ou o rótulo de `STOP_KINDS`) e o nome; o
 * endereço e o link depois de " · ". O resto do que o `importSchema` guarda vai em linhas recuadas,
 * `chave: valor`. As seções: Reservas, Contatos, Antes de ir, Mala, Missões e Não classificados.
 */
export const FORMAT_MARK = 'viajei/1';

/** O cabeçalho da viagem: nome, datas, origem e orçamento, o que o texto disser (o resto, null). */
export type TripHeader = {
  name: string | null;
  start_date: string | null;
  end_date: string | null;
  origin: string | null;
  budget: number | null;
};
export const EMPTY_HEADER: TripHeader = {
  name: null,
  start_date: null,
  end_date: null,
  origin: null,
  budget: null,
};

export type ViajeiDoc = { trip: TripHeader; data: ImportData };
/** `line` é a linha do texto colado, contada de 1; null quando o erro é do todo (o JSON). */
export type FormatError = { line: number | null; message: string };
export type ReadResult = { ok: true; doc: ViajeiDoc } | { ok: false; errors: FormatError[] };

// ------------------------------------------------------------------------- os vocabulários
const plain = (s: string) =>
  s
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

/** Os tipos como palavras: a chave (`nature`) e o rótulo sem acento e sem caixa (`natureza`). */
function vocabulary<K extends string>(
  table: Readonly<Record<K, { label: string }>>,
  keys: readonly K[],
): Map<string, K> {
  const out = new Map<string, K>();
  for (const key of keys) {
    out.set(key, key);
    out.set(plain(table[key].label), key);
  }
  return out;
}
const STOP_WORDS = vocabulary(STOP_KINDS, STOP_KIND_KEYS);
const RESERVATION_WORDS = vocabulary(RESERVATION_TYPES, RESERVATION_TYPE_KEYS);
const CONTACT_WORDS = vocabulary(CONTACT_TYPES, CONTACT_TYPE_KEYS);

const wordOf = (label: string) => label.toLocaleLowerCase('pt-BR');
const listOf = (table: Readonly<Record<string, { label: string }>>) =>
  Object.values(table)
    .map((t) => wordOf(t.label))
    .join(', ');

type Section = 'reservations' | 'contacts' | 'before' | 'pack' | 'quests' | 'unclassified';
const SECTIONS: Record<Section, { title: string; words: string[] }> = {
  reservations: { title: 'Reservas', words: ['reservas', 'reserva'] },
  contacts: { title: 'Contatos', words: ['contatos', 'contato', 'telefones'] },
  before: { title: 'Antes de ir', words: ['antes de ir', 'antes de viajar', 'antes'] },
  pack: { title: 'Mala', words: ['mala', 'levar', 'o que levar'] },
  quests: { title: 'Missões', words: ['missoes', 'missao'] },
  unclassified: {
    title: 'Não classificados',
    words: ['nao classificados', 'outras notas', 'notas'],
  },
};
const sectionOf = (head: string): Section | null => {
  const key = plain(head);
  for (const [section, def] of Object.entries(SECTIONS) as [Section, { words: string[] }][]) {
    if (def.words.includes(key)) return section;
  }
  return null;
};

// ------------------------------------------------------------------ datas, horas e números
const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (y: number, m: number, d: number): string | null => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
    ? `${String(y)}-${pad(m)}-${pad(d)}`
    : null;
};

/**
 * Uma data do texto: `11/12/2026`, `11/12/26`, `2026-12-11` ou `11/12` (sem ano: a próxima a partir
 * de `today`, ou no ano dado por `year`).
 */
export function parseDate(text: string, today: string, year: number | null = null): string | null {
  const s = text.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(s);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  if (m[3]) {
    const y = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    return isoDate(y, mo, d);
  }
  if (year !== null) return isoDate(year, mo, d);
  const thisYear = Number(today.slice(0, 4));
  const candidate = isoDate(thisYear, mo, d);
  if (candidate && candidate >= today) return candidate;
  return isoDate(thisYear + 1, mo, d);
}

/** "07:00", "7:00", "7h", "13h30" → "HH:MM"; o resto, null. */
export function parseTime(text: string): string | null {
  const m = /^(\d{1,2})(?::(\d{2})|h(\d{2})?)$/i.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? m[3] ?? '0');
  return h <= 23 && min <= 59 ? `${pad(h)}:${pad(min)}` : null;
}

/** "390 min", "45", "6h30", "1h" → minutos; o resto, null. */
function parseMinutes(text: string): number | null {
  const s = plain(text).replace(/\s+/g, '');
  let m = /^(\d{1,4})(?:min(?:utos)?)?$/.exec(s);
  if (m) return Number(m[1]);
  m = /^(\d{1,2})h(?:oras?)?(\d{1,2})?(?:min)?$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2] ?? '0');
  return null;
}

/** "-29.28522, -51.41185" → as duas coordenadas, no intervalo de cada uma. */
function parseLatLng(text: string): { lat: number; lng: number } | null {
  const m = /^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(text.trim());
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/** A data traz o ano? ("2026-12-11", "11/12/2026", "11/12/26") */
const hasYear = (s: string) => /^\d{4}-|\/\d{1,2}\/\d{2,4}$/.test(s.trim());

/** O período do cabeçalho: "11/12/2026 a 14/12/2026", "11 a 14/12/2026", "de 11/12 a 14/12". */
function parsePeriod(text: string, today: string): { start: string; end: string } | null {
  const parts = plain(text)
    .replace(/^de\s+/, '')
    .split(/\s+(?:a|ate)\s+|\s*[–—]\s*/);
  if (parts.length > 2) return null;
  const [first = '', second] = parts;
  if (second === undefined) {
    const one = parseDate(first, today);
    return one ? { start: one, end: one } : null;
  }
  const end = parseDate(second, today);
  if (!end) return null;
  const [ey = 0, em = 0] = end.split('-').map(Number);
  // "11 a 14/12/2026": o mês e o ano do começo são os do fim
  const startText = /^\d{1,2}$/.test(first) ? `${first}/${String(em)}/${String(ey)}` : first;
  if (hasYear(startText)) {
    const start = parseDate(startText, today);
    return start && start <= end ? { start, end } : null;
  }
  // sem ano no começo: o do fim, ou o anterior quando a viagem vira o ano (28/12 a 03/01)
  for (const year of [ey, ey - 1]) {
    const start = parseDate(startText, today, year);
    if (start && start <= end) return { start, end };
  }
  return null;
}

/**
 * Uma data sem ano dentro da viagem: no ano do começo ou no seguinte (a viagem que vira o ano), a que
 * cair no período; sem período, a próxima a partir de hoje.
 */
function dateInTrip(text: string, trip: TripHeader, today: string): string | null {
  if (hasYear(text) || !trip.start_date || !trip.end_date) return parseDate(text, today);
  const sy = Number(trip.start_date.slice(0, 4));
  const candidates = [sy, sy + 1].map((y) => parseDate(text, today, y));
  const start = trip.start_date;
  const end = trip.end_date;
  return (
    candidates.find((d) => d !== null && d >= start && d <= end) ??
    candidates.find((d) => d !== null && d >= start) ??
    null
  );
}

/** Os dias da semana, que um cabeçalho de dia pode trazer junto da data ("sex 11/12"). */
const WEEKDAY =
  /^(?:seg(?:unda)?|ter(?:ca)?|qua(?:rta)?|qui(?:nta)?|sex(?:ta)?|sab(?:ado)?|dom(?:ingo)?)(?:-?feira)?[,.]?$/;
/** Antes da data, também "dia" ("## dia 11/12"). */
const BEFORE_DATE = (w: string) => w === 'dia' || WEEKDAY.test(w);

function brl(n: number): string {
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ------------------------------------------------------------------------------- o leitor
type Line = { n: number; raw: string; text: string; indented: boolean };

/**
 * As linhas do documento: do `viajei/1` em diante (o que vem antes, como "Aqui está o roteiro:" de
 * outra IA, fica de fora), até uma cerca de código que feche o bloco. Vazias saem.
 */
function linesOf(text: string): Line[] | null {
  const all = text.replace(/\r\n?/g, '\n').split('\n');
  const start = all.findIndex((l) => plain(l) === FORMAT_MARK);
  if (start === -1) return null;
  const fenced = all.slice(0, start).some((l) => /^\s*```/.test(l));
  const out: Line[] = [];
  for (let i = start + 1; i < all.length; i++) {
    const raw = all[i] ?? '';
    if (/^\s*```/.test(raw)) {
      if (fenced) break;
      continue;
    }
    if (raw.trim() === '') continue;
    out.push({ n: i + 1, raw, text: raw.trim(), indented: /^[ \t]+\S/.test(raw) });
  }
  return out;
}

type Field = { key: string; value: string };
/** "chave: valor", com a chave sem acento e sem caixa. */
function fieldOf(text: string): Field | null {
  const i = text.indexOf(':');
  if (i <= 0) return null;
  const key = plain(text.slice(0, i));
  if (!/^[a-z ]{2,24}$/.test(key)) return null;
  return { key, value: text.slice(i + 1).trim() };
}

/** Os pedaços de uma linha separados por " · " (ou " | "): o nome, o endereço, o link. */
const segments = (text: string) =>
  text
    .split(/\s+[·|]\s+/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s);

const emptyStop = (kind: StopKind, name: string, time: string | null): ImportStop => ({
  time,
  kind,
  name,
  address: null,
  closes_at: null,
  travel_minutes_to_next: null,
  notes: null,
  url: null,
  lat: null,
  lng: null,
});
const emptyReservation = (type: ReservationType, name: string): ImportReservation => ({
  type,
  name,
  stop_ref: null,
  day_ref: null,
  start_at: null,
  end_at: null,
  confirmation_code: null,
  amount: null,
  cancel_policy: null,
  cancel_until: null,
  phone: null,
  address: null,
  booked_via: null,
  notes: null,
});
const addNote = (current: string | null, text: string) =>
  current === null ? text : `${current}\n${text}`;

type Item =
  | { kind: 'stop'; stop: ImportStop }
  | { kind: 'reservation'; reservation: ImportReservation }
  | { kind: 'contact'; contact: ImportContact }
  | { kind: 'quest'; quest: ImportQuest }
  | { kind: 'text' };

/** Lê o texto do formato do Viajei (ou o JSON do schema). `today` resolve as datas sem ano. */
export function readViajei(text: string, today: string): ReadResult {
  const lines = linesOf(text);
  if (!lines) return readJson(text);
  const errors: FormatError[] = [];
  const fail = (line: number, message: string) => errors.push({ line, message });
  const trip: TripHeader = { ...EMPTY_HEADER };
  const data: ImportData = {
    days: [],
    reservations: [],
    contacts: [],
    checklist_before: [],
    checklist_pack: [],
    quests: [],
    unclassified: [],
  };
  // mudada pelas funções de baixo: o `as` mantém o tipo inteiro (sem estreitar no 'header')
  let section = 'header' as 'header' | 'day' | Section;
  let day: ImportDay | null = null;
  let item: Item | null = null;
  // as datas sem ano dos dias e das reservas caem dentro da viagem; sem ela, a próxima no futuro
  const dateIn = (s: string) => dateInTrip(s, trip, today);
  const stampIn = (s: string) => {
    const [date = '', time = ''] = s.trim().split(/\s+/);
    const d = dateIn(date);
    const t = parseTime(time);
    return d && t ? `${d}T${t}` : null;
  };

  for (const line of lines) {
    if (line.indented && item) {
      subLine(line, item);
      continue;
    }
    if (line.text.startsWith('## ')) {
      item = null;
      heading(line);
      continue;
    }
    if (line.text.startsWith('# ') && section === 'header') {
      trip.name = line.text.slice(2).trim() || null;
      continue;
    }
    if (section === 'header') {
      const field = fieldOf(line.text);
      if (!field) {
        fail(
          line.n,
          'Antes do primeiro dia, só o nome (# Nome) e os campos datas, origem e orçamento.',
        );
        continue;
      }
      headerField(line, field);
      continue;
    }
    const bullet = /^[-*•]\s+(.+)$/.exec(line.text);
    if (!bullet?.[1]) {
      fail(line.n, 'Cada item começa com "- ". Os detalhes vão na linha de baixo, com recuo.');
      item = null;
      continue;
    }
    item = itemLine(line, bullet[1]);
  }

  if (errors.length > 0) return { ok: false, errors };
  try {
    return { ok: true, doc: { trip, data: validateImport(data) } };
  } catch (err) {
    return {
      ok: false,
      errors: [{ line: null, message: err instanceof Error ? err.message : 'Formato inválido.' }],
    };
  }

  function headerField(line: Line, { key, value }: Field) {
    switch (key) {
      case 'nome':
        trip.name = value || null;
        return;
      case 'datas':
      case 'data':
      case 'quando': {
        const period = parsePeriod(value, today);
        if (!period) {
          fail(line.n, `Não entendi as datas "${value}". Escreva como 11/12/2026 a 14/12/2026.`);
          return;
        }
        trip.start_date = period.start;
        trip.end_date = period.end;
        return;
      }
      case 'origem':
      case 'saida':
        trip.origin = value || null;
        return;
      case 'orcamento': {
        const n = parseMoney(value);
        if (n === null || Number.isNaN(n) || n < 0) {
          fail(line.n, `Não entendi o orçamento "${value}". Escreva como R$ 3.000,00.`);
          return;
        }
        trip.budget = n;
        return;
      }
      default:
        fail(line.n, `"${key}" não é um campo do cabeçalho: use nome, datas, origem ou orçamento.`);
    }
  }

  function heading(line: Line) {
    const rest = line.text.slice(3).trim();
    const known = sectionOf(rest.split(/\s+[·|]\s+/)[0] ?? '');
    if (known) {
      section = known;
      day = null;
      return;
    }
    // o dia: a data (com o dia da semana antes, ou não) e o título depois dela, com " · " ou não
    const token = /(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/.exec(rest);
    const date = token?.[1] ? dateIn(token[1]) : null;
    const before = token ? rest.slice(0, token.index).trim().split(/\s+/).filter(Boolean) : [];
    if (!token || !date || before.some((w) => !BEFORE_DATE(plain(w)))) {
      fail(
        line.n,
        `Não entendi "## ${rest}". Um dia começa com a data (## 11/12/2026 · Título); as seções são ${Object.values(
          SECTIONS,
        )
          .map((x) => x.title)
          .join(', ')}.`,
      );
      section = 'day';
      day = null;
      return;
    }
    if (data.days.some((d) => d.date === date)) {
      fail(line.n, `O dia ${date.split('-').reverse().join('/')} aparece duas vezes.`);
    }
    const after = rest
      .slice(token.index + token[0].length)
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    // o dia da semana logo depois da data ("11/12 sexta · Título") também não é título
    while (after[0] && WEEKDAY.test(plain(after[0]))) after.shift();
    const title = after
      .join(' ')
      .replace(/^[·|:—–-]\s*/, '')
      .trim();
    section = 'day';
    day = { date, title: title || null, stops: [] };
    data.days.push(day);
  }

  function itemLine(line: Line, body: string): Item | null {
    switch (section) {
      case 'day':
        return stopLine(line, body);
      case 'reservations': {
        const [word = '', ...rest] = body.split(/\s+/);
        const type = RESERVATION_WORDS.get(plain(word));
        const name = rest.join(' ').trim();
        if (!type || name === '') {
          fail(
            line.n,
            `Uma reserva é "- tipo Nome", e o tipo é um destes: ${listOf(RESERVATION_TYPES)}.`,
          );
          return null;
        }
        const reservation = emptyReservation(type, name);
        data.reservations.push(reservation);
        return { kind: 'reservation', reservation };
      }
      case 'contacts': {
        const [first = '', ...more] = segments(body);
        const [word = '', ...rest] = first.split(/\s+/);
        const type: ContactType | undefined = CONTACT_WORDS.get(plain(word));
        const name = rest.join(' ').trim();
        if (!type || name === '') {
          fail(
            line.n,
            `Um contato é "- tipo Nome · telefone", e o tipo é um destes: ${listOf(CONTACT_TYPES)}.`,
          );
          return null;
        }
        const contact: ImportContact = { name, type, phone: more[0] ?? null, notes: null };
        data.contacts.push(contact);
        return { kind: 'contact', contact };
      }
      case 'quests': {
        const quest: ImportQuest = { text: body.trim(), stop_ref: null };
        data.quests.push(quest);
        return { kind: 'quest', quest };
      }
      case 'before':
        data.checklist_before.push(body.trim());
        return { kind: 'text' };
      case 'pack':
        data.checklist_pack.push(body.trim());
        return { kind: 'text' };
      case 'unclassified':
        data.unclassified.push(body.trim());
        return { kind: 'text' };
      case 'header':
        return null;
    }
  }

  function stopLine(line: Line, body: string): Item | null {
    if (!day) {
      fail(line.n, 'Esta parada não tem dia: ponha um "## 11/12/2026" antes dela.');
      return null;
    }
    const [first = '', ...more] = segments(body);
    const words = first.split(/\s+/);
    const time = words[0] ? parseTime(words[0]) : null;
    if (time) words.shift();
    else if (/^\d/.test(words[0] ?? '')) {
      fail(line.n, `Não entendi o horário "${words[0] ?? ''}". Escreva como 07:00.`);
      return null;
    }
    const word = words.shift() ?? '';
    const kind = STOP_WORDS.get(plain(word));
    const name = words.join(' ').trim();
    if (!kind) {
      fail(
        line.n,
        `"${word}" não é um tipo de parada. Os tipos: ${listOf(STOP_KINDS)}. A linha é "- 09:00 tipo Nome".`,
      );
      return null;
    }
    if (name === '') {
      fail(line.n, 'A parada precisa de um nome depois do tipo.');
      return null;
    }
    const stop = emptyStop(kind, name, time);
    for (const seg of more) {
      if (isUrl(seg)) stop.url ??= seg;
      else if (stop.address === null) stop.address = seg;
      else stop.notes = addNote(stop.notes, seg);
    }
    day.stops.push(stop);
    return { kind: 'stop', stop };
  }

  function subLine(line: Line, target: Item) {
    const field = fieldOf(line.text);
    if (target.kind === 'text') {
      fail(line.n, 'Os itens das listas não têm detalhes: cada um numa linha "- texto".');
      return;
    }
    if (!field) {
      fail(line.n, 'Um detalhe é "chave: valor", na linha de baixo do item, com recuo.');
      return;
    }
    const { key, value } = field;
    const bad = (what: string) => fail(line.n, `Não entendi ${what} "${value}".`);
    if (target.kind === 'stop') {
      const s = target.stop;
      switch (key) {
        case 'fecha':
        case 'ate': {
          const t = parseTime(value.replace(/^as?\s+/i, ''));
          if (t) s.closes_at = t;
          else bad('o horário');
          return;
        }
        case 'ate a proxima':
        case 'deslocamento': {
          const min = parseMinutes(value);
          if (min !== null) s.travel_minutes_to_next = min;
          else bad('o tempo até a próxima');
          return;
        }
        case 'obs':
          s.notes = addNote(s.notes, value);
          return;
        case 'endereco':
          s.address = value || null;
          return;
        case 'link':
          s.url = value || null;
          return;
        case 'local': {
          const ll = parseLatLng(value);
          if (ll) {
            s.lat = ll.lat;
            s.lng = ll.lng;
          } else bad('o local');
          return;
        }
      }
      fail(line.n, `"${key}" não é um detalhe de parada: use fecha, até a próxima, obs ou local.`);
      return;
    }
    if (target.kind === 'reservation') {
      const r = target.reservation;
      switch (key) {
        case 'parada':
          r.stop_ref = value || null;
          return;
        case 'dia': {
          const d = dateIn(value);
          if (d) r.day_ref = d;
          else bad('a data');
          return;
        }
        case 'entrada':
        case 'inicio': {
          const t = stampIn(value);
          if (t) r.start_at = t;
          else bad('a entrada (escreva 11/12/2026 16:30)');
          return;
        }
        case 'saida':
        case 'fim': {
          const t = stampIn(value);
          if (t) r.end_at = t;
          else bad('a saída (escreva 13/12/2026 07:00)');
          return;
        }
        case 'codigo':
          r.confirmation_code = value || null;
          return;
        case 'valor': {
          const n = parseMoney(value);
          if (n !== null && !Number.isNaN(n)) r.amount = n;
          else bad('o valor');
          return;
        }
        case 'cancelamento':
          r.cancel_policy = value || null;
          return;
        case 'cancelar ate': {
          const d = dateIn(value);
          if (d) r.cancel_until = d;
          else bad('a data');
          return;
        }
        case 'telefone':
          r.phone = value || null;
          return;
        case 'endereco':
          r.address = value || null;
          return;
        case 'por':
          r.booked_via = value || null;
          return;
        case 'obs':
          r.notes = addNote(r.notes, value);
          return;
      }
      fail(
        line.n,
        `"${key}" não é um detalhe de reserva: use parada, dia, entrada, saída, código, valor, cancelamento, cancelar até, telefone, endereço, por ou obs.`,
      );
      return;
    }
    if (target.kind === 'contact') {
      if (key === 'obs') target.contact.notes = addNote(target.contact.notes, value);
      else if (key === 'telefone') target.contact.phone = value || null;
      else fail(line.n, `"${key}" não é um detalhe de contato: use telefone ou obs.`);
      return;
    }
    if (key === 'parada') target.quest.stop_ref = value || null;
    else fail(line.n, `"${key}" não é um detalhe de missão: use parada.`);
  }
}

// ------------------------------------------------------------------------------ o JSON
/** O JSON colado, dentro de uma cerca de código ou não. */
function jsonOf(text: string): unknown {
  const fenced = /```(?:json)?\s*\n([\s\S]*?)\n\s*```/i.exec(text);
  const body = (fenced?.[1] ?? text).trim();
  if (!body.startsWith('{')) return undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

/** O texto é o formato do Viajei (a marca) ou um JSON com dias? Barato, sem validar. */
export function looksLikeViajei(text: string): boolean {
  if (linesOf(text)) return true;
  const json = jsonOf(text);
  return (
    typeof json === 'object' && json !== null && Array.isArray((json as { days?: unknown }).days)
  );
}

type Loose = Record<string, unknown>;
const isLoose = (v: unknown): v is Loose =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
/** O que outra IA esquece de escrever (uma chave opcional ausente) vira o null do schema. */
function filled(row: unknown, keys: readonly string[]): unknown {
  if (!isLoose(row)) return row;
  return Object.fromEntries([...keys.map((k) => [k, null]), ...Object.entries(row)]);
}
const STOP_KEYS = [
  'time',
  'address',
  'closes_at',
  'travel_minutes_to_next',
  'notes',
  'url',
  'lat',
  'lng',
];
const RESERVATION_KEYS = [
  'stop_ref',
  'day_ref',
  'start_at',
  'end_at',
  'confirmation_code',
  'amount',
  'cancel_policy',
  'cancel_until',
  'phone',
  'address',
  'booked_via',
  'notes',
];

function readJson(text: string): ReadResult {
  const json = jsonOf(text);
  if (json === undefined) {
    return {
      ok: false,
      errors: [{ line: 1, message: `O texto não começa com "${FORMAT_MARK}" nem é um JSON.` }],
    };
  }
  if (!isLoose(json)) {
    return { ok: false, errors: [{ line: null, message: 'O JSON não deu para ler.' }] };
  }
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? (v as unknown[]) : []);
  const candidate = {
    days: arr(json.days).map((d) =>
      isLoose(d) ? { title: null, ...d, stops: arr(d.stops).map((s) => filled(s, STOP_KEYS)) } : d,
    ),
    reservations: arr(json.reservations).map((r) => filled(r, RESERVATION_KEYS)),
    contacts: arr(json.contacts).map((c) => filled(c, ['phone', 'notes'])),
    checklist_before: arr(json.checklist_before),
    checklist_pack: arr(json.checklist_pack),
    quests: arr(json.quests).map((q) => filled(q, ['stop_ref'])),
    unclassified: arr(json.unclassified),
  };
  const t = isLoose(json.trip) ? json.trip : {};
  const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
  const date = (v: unknown) => {
    const s = str(v);
    return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  };
  try {
    return {
      ok: true,
      doc: {
        trip: {
          name: str(t.name),
          start_date: date(t.start_date),
          end_date: date(t.end_date),
          origin: str(t.origin),
          budget: typeof t.budget === 'number' && t.budget >= 0 ? t.budget : null,
        },
        data: validateImport(candidate),
      },
    };
  } catch (err) {
    const issue =
      err && typeof err === 'object' && 'issues' in err
        ? (err.issues as { path: (string | number)[]; message: string }[])[0]
        : undefined;
    const message = issue
      ? `O JSON não está no formato do Viajei: ${issue.path.join('.')} (${issue.message}).`
      : err instanceof Error
        ? err.message
        : 'O JSON não está no formato do Viajei.';
    return { ok: false, errors: [{ line: null, message }] };
  }
}

// ----------------------------------------------------------------------------- o escritor
const br = (iso: string) => iso.split('-').reverse().join('/');
/** Cada coisa numa linha: uma quebra dentro do texto vira espaço. */
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ');
/**
 * Onde o leitor divide a linha em pedaços (a parada e o contato), um " · " dentro do nome ou do
 * endereço viraria outro pedaço: ali ele vira " - " (raro; em nenhum outro lugar).
 */
const field = (s: string) => oneLine(s).replace(/\s+[·|]\s+/g, ' - ');
const multi = (key: string, text: string | null) =>
  text === null
    ? []
    : text
        .split('\n')
        .filter((t) => t.trim() !== '')
        .map((t) => `  ${key}: ${t.trim()}`);
const stampBr = (s: string) => {
  const [d = '', t = ''] = s.split('T');
  return `${br(d)} ${t.slice(0, 5)}`;
};

/** O inverso do leitor: o documento como texto `viajei/1`, na ordem do arquivo. */
export function writeViajei({ trip, data }: ViajeiDoc): string {
  const out: string[] = [FORMAT_MARK];
  if (trip.name) out.push(`# ${oneLine(trip.name)}`);
  if (trip.start_date && trip.end_date) {
    out.push(
      trip.start_date === trip.end_date
        ? `datas: ${br(trip.start_date)}`
        : `datas: ${br(trip.start_date)} a ${br(trip.end_date)}`,
    );
  }
  if (trip.origin) out.push(`origem: ${oneLine(trip.origin)}`);
  if (trip.budget !== null) out.push(`orçamento: ${brl(trip.budget)}`);

  for (const day of data.days) {
    out.push('', `## ${br(day.date)}${day.title ? ` · ${oneLine(day.title)}` : ''}`);
    for (const s of day.stops) {
      const head = [s.time, wordOf(STOP_KINDS[s.kind].label), field(s.name)]
        .filter(Boolean)
        .join(' ');
      const inline = [head, s.address ? field(s.address) : null, s.url ? field(s.url) : null];
      out.push(`- ${inline.filter(Boolean).join(' · ')}`);
      if (s.closes_at) out.push(`  fecha: ${s.closes_at}`);
      if (s.travel_minutes_to_next !== null) {
        out.push(`  até a próxima: ${String(s.travel_minutes_to_next)} min`);
      }
      out.push(...multi('obs', s.notes));
      if (s.lat !== null && s.lng !== null) out.push(`  local: ${String(s.lat)}, ${String(s.lng)}`);
    }
  }

  if (data.reservations.length > 0) {
    out.push('', `## ${SECTIONS.reservations.title}`);
    for (const r of data.reservations) {
      out.push(`- ${wordOf(RESERVATION_TYPES[r.type].label)} ${oneLine(r.name)}`);
      const sub = (key: string, value: string | null) => {
        if (value !== null) out.push(`  ${key}: ${oneLine(value)}`);
      };
      sub('parada', r.stop_ref);
      sub('dia', r.day_ref ? br(r.day_ref) : null);
      sub('entrada', r.start_at ? stampBr(r.start_at) : null);
      sub('saída', r.end_at ? stampBr(r.end_at) : null);
      sub('código', r.confirmation_code);
      sub('valor', r.amount === null ? null : brl(r.amount));
      sub('cancelamento', r.cancel_policy);
      sub('cancelar até', r.cancel_until ? br(r.cancel_until) : null);
      sub('telefone', r.phone);
      sub('endereço', r.address);
      sub('por', r.booked_via);
      out.push(...multi('obs', r.notes));
    }
  }
  if (data.contacts.length > 0) {
    out.push('', `## ${SECTIONS.contacts.title}`);
    for (const c of data.contacts) {
      const head = `${wordOf(CONTACT_TYPES[c.type].label)} ${field(c.name)}`;
      out.push(`- ${c.phone ? `${head} · ${field(c.phone)}` : head}`);
      out.push(...multi('obs', c.notes));
    }
  }
  const list = (section: Section, rows: readonly string[]) => {
    if (rows.length === 0) return;
    out.push('', `## ${SECTIONS[section].title}`, ...rows.map((t) => `- ${oneLine(t)}`));
  };
  list('before', data.checklist_before);
  list('pack', data.checklist_pack);
  if (data.quests.length > 0) {
    out.push('', `## ${SECTIONS.quests.title}`);
    for (const q of data.quests) {
      out.push(`- ${oneLine(q.text)}`);
      if (q.stop_ref) out.push(`  parada: ${oneLine(q.stop_ref)}`);
    }
  }
  list('unclassified', data.unclassified);
  return `${out.join('\n')}\n`;
}
