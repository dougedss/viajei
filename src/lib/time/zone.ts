/**
 * Hora de parede num fuso nomeado, para as colunas `timestamptz` digitadas como data e hora
 * (reservas). Nunca `Date` em UTC nem o fuso do aparelho: o deslocamento sai da tabela de fusos do
 * navegador (`Intl`), então vale para datas antigas com horário de verão e para um aparelho
 * configurado em outro fuso. Hora que não existe (o pulo do horário de verão) anda para a frente.
 */
export const TRIP_TIME_ZONE = 'America/Sao_Paulo';

type Wall = { date: string; time: string };

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** As partes da hora de parede de um instante no fuso. */
function partsAt(ms: number, tz: string) {
  const parts = formatter(tz).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    y: get('year'),
    m: get('month'),
    d: get('day'),
    h: get('hour'),
    mi: get('minute'),
    s: get('second'),
  };
}

/** Deslocamento do fuso em minutos (−180 para São Paulo hoje) num instante. */
export function offsetMinutes(ms: number, tz = TRIP_TIME_ZONE): number {
  const p = partsAt(ms, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0');

/** O instante em ISO 8601 com o deslocamento do fuso: '2026-12-13T14:00:00-03:00'. */
export function instantToZonedISO(ms: number, tz = TRIP_TIME_ZONE): string {
  const p = partsAt(ms, tz);
  const off = offsetMinutes(ms, tz);
  const sign = off < 0 ? '-' : '+';
  return (
    `${pad(p.y, 4)}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}` +
    `${sign}${pad(Math.trunc(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
  );
}

/** Data 'yyyy-MM-dd' e hora 'HH:mm' de parede no fuso, como instante (ms). */
export function wallToInstant(date: string, time: string, tz = TRIP_TIME_ZONE): number {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const [h = 0, mi = 0] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const first = guess - offsetMinutes(guess, tz) * 60_000;
  const second = guess - offsetMinutes(first, tz) * 60_000;
  // as duas contas só divergem perto da troca do horário de verão; a hora que não existe anda
  return offsetMinutes(first, tz) === offsetMinutes(second, tz) ? second : Math.max(first, second);
}

/** O `timestamptz` de uma data e hora de parede: '2026-12-13T14:00:00-03:00'. */
export function wallToISO(date: string, time: string, tz = TRIP_TIME_ZONE): string {
  return instantToZonedISO(wallToInstant(date, time, tz), tz);
}

/** O contrário: a data e a hora de parede no fuso de um `timestamptz` qualquer. */
export function isoToWall(iso: string, tz = TRIP_TIME_ZONE): Wall {
  const p = partsAt(new Date(iso).getTime(), tz);
  return { date: `${pad(p.y, 4)}-${pad(p.m)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
}

/** "2026-12-11T16:30" (o formato do seed e da importação, sem fuso) como `timestamptz` no fuso. */
export function localStampToISO(stamp: string, tz = TRIP_TIME_ZONE): string {
  const [date = '', time = '00:00'] = stamp.split('T');
  return wallToISO(date, time.slice(0, 5), tz);
}
