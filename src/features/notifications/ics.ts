import { activeStops } from '@/features/itinerary/rules.ts';
import type { Stop, Trip, TripDay } from '@/lib/db/schema.ts';
import { googleMapsUrl } from '@/lib/links/index.ts';
import { formatDayShort, hhmm } from '@/lib/time/index.ts';

/**
 * Exportar para o calendário: um `.ics` (RFC 5545) gerado à mão, sem dependência. Um VEVENT por
 * parada com horário, em America/Sao_Paulo (um só bloco STANDARD: o Brasil não tem horário de
 * verão desde 2019), com endereço, link do Maps e um alarme 15 min antes de cada "sair às", isto é,
 * `-(deslocamento da anterior + 15 min)` em relação ao horário da parada. Funciona sem push e sem
 * servidor: é a rede de segurança.
 */
export const ICS_TZID = 'America/Sao_Paulo';
export const ICS_ALARM_LEAD_MINUTES = 15;
const LINE_OCTETS = 75;

/** Escapes da RFC 5545 para valores de texto. */
export function escapeText(text: string): string {
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll(/\r?\n/g, '\\n');
}

/** Dobra em 75 octetos, sem partir um caractere multibyte; continuação começa com espaço. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = parts.length === 0 ? LINE_OCTETS : LINE_OCTETS - 1;
    if (octets + size > limit) {
      parts.push(current);
      current = ch;
      octets = size;
    } else {
      current += ch;
      octets += size;
    }
  }
  parts.push(current);
  return parts.map((p, i) => (i === 0 ? p : ` ${p}`)).join('\r\n');
}

/** 'YYYY-MM-DD' + 'HH:mm' → 'YYYYMMDDTHHmm00' (hora de parede, com TZID). */
function localStamp(date: string, time: string): string {
  return `${date.replaceAll('-', '')}T${hhmm(time).replace(':', '')}00`;
}

function utcStamp(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

/** `-PT6H45M`, `-PT15M`, `-PT1H`. */
export function negativeDuration(minutes: number): string {
  const abs = Math.max(0, Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `-PT${h > 0 ? `${h}H` : ''}${m > 0 || h === 0 ? `${m}M` : ''}`;
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h = 0, m = 0] = hhmm(time).split(':').map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${ICS_TZID}`,
  'BEGIN:STANDARD',
  'DTSTART:19700101T000000',
  'TZOFFSETFROM:-0300',
  'TZOFFSETTO:-0300',
  'TZNAME:-03',
  'END:STANDARD',
  'END:VTIMEZONE',
];

type EventInput = {
  stop: Stop;
  /** o horário da parada (só paradas com horário viram evento) */
  time: string;
  date: string;
  /** horário da parada seguinte com horário, para o DTEND */
  nextTime: string | null;
  /** deslocamento da parada anterior até esta, para o alarme */
  travelFromPrevious: number;
};

function vevent(
  { stop, time, date, nextTime, travelFromPrevious }: EventInput,
  stamp: string,
): string[] {
  const start = hhmm(time);
  const end = nextTime && hhmm(nextTime) > start ? hhmm(nextTime) : addMinutesToTime(start, 60);
  const description: string[] = [];
  if (stop.closes_at) description.push(`Fecha às ${hhmm(stop.closes_at)}`);
  if (stop.notes) description.push(stop.notes);
  const maps = googleMapsUrl(stop);
  if (maps) description.push(`Mapa: ${maps}`);
  const lines = [
    'BEGIN:VEVENT',
    `UID:${stop.id}@viajei`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${ICS_TZID}:${localStamp(date, start)}`,
    `DTEND;TZID=${ICS_TZID}:${localStamp(date, end)}`,
    `SUMMARY:${escapeText(stop.name)}`,
  ];
  if (stop.address) lines.push(`LOCATION:${escapeText(stop.address)}`);
  if (stop.lat !== null && stop.lng !== null) lines.push(`GEO:${stop.lat};${stop.lng}`);
  if (description.length > 0) lines.push(`DESCRIPTION:${escapeText(description.join('\n'))}`);
  if (stop.url) lines.push(`URL:${stop.url}`);
  lines.push(
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(`Sair em ${ICS_ALARM_LEAD_MINUTES} min para ${stop.name}`)}`,
    `TRIGGER:${negativeDuration(travelFromPrevious + ICS_ALARM_LEAD_MINUTES)}`,
    'END:VALARM',
    'END:VEVENT',
  );
  return lines;
}

function eventsOfDay(day: Pick<TripDay, 'date'>, stops: readonly Stop[], stamp: string): string[] {
  const ordered = activeStops(stops);
  const lines: string[] = [];
  ordered.forEach((stop, i) => {
    if (!stop.time) return;
    const previous = i > 0 ? ordered[i - 1] : undefined;
    const nextTime = ordered.slice(i + 1).find((s) => s.time)?.time ?? null;
    lines.push(
      ...vevent(
        {
          stop,
          time: stop.time,
          date: day.date,
          nextTime,
          travelFromPrevious: previous?.travel_minutes_to_next ?? 0,
        },
        stamp,
      ),
    );
  });
  return lines;
}

function calendar(name: string, body: string[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Viajei//Roteiro//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    `X-WR-TIMEZONE:${ICS_TZID}`,
    ...VTIMEZONE,
    ...body,
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/** O `.ics` de um dia. `now` entra no DTSTAMP, por isso é parâmetro: o snapshot do teste é fixo. */
export function dayToIcs(
  trip: Pick<Trip, 'name'>,
  day: Pick<TripDay, 'date' | 'title'>,
  stops: readonly Stop[],
  now: Date,
): string {
  const name = `${trip.name} · ${formatDayShort(day.date)}${day.title ? ` · ${day.title}` : ''}`;
  return calendar(name, eventsOfDay(day, stops, utcStamp(now)));
}

/** O `.ics` da viagem inteira: todos os dias, na ordem. */
export function tripToIcs(
  trip: Pick<Trip, 'name'>,
  days: readonly { day: Pick<TripDay, 'date'>; stops: readonly Stop[] }[],
  now: Date,
): string {
  const stamp = utcStamp(now);
  const body = [...days]
    .sort((a, b) => a.day.date.localeCompare(b.day.date))
    .flatMap(({ day, stops }) => eventsOfDay(day, stops, stamp));
  return calendar(trip.name, body);
}

function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

/** `viajei-<viagem>-<dia>.ics` ou `viajei-<viagem>.ics`. */
export function icsFilename(trip: Pick<Trip, 'name'>, day?: Pick<TripDay, 'date'>): string {
  return `viajei-${slug(trip.name) || 'viagem'}${day ? `-${day.date}` : ''}.ics`;
}

export const ICS_MIME = 'text/calendar';
