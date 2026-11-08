import { z } from 'zod';
import { haversineM } from './geo.ts';

/**
 * O clima, puro, a mesma fonte para o app e para o aviso (o texto do briefing da manhã e o da tela
 * têm de dizer a mesma coisa). Os dados vêm do Open-Meteo (CC BY 4.0, uso não comercial, sem chave):
 *  - `codes`: o código WMO vira rótulo em pt-BR, ícone e gravidade;
 *  - `points`: quais lugares contam em cada dia (onde começa, onde termina, e as paradas com horário);
 *  - `horizon`: quais dias já têm previsão (hoje até hoje + 15, em São Paulo);
 *  - `request` e `parse`: uma chamada para todos os lugares, e a resposta (um lugar volta como objeto,
 *    vários como lista, na ordem do pedido);
 *  - `summary`: o resumo do dia, o da parada e os textos.
 * Sem previsão, nada aparece: as funções devolvem null, nunca zero.
 */

export const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
export const OPEN_METEO_ATTRIBUTION = {
  label: 'Dados do tempo: Open-Meteo.com',
  href: 'https://open-meteo.com/',
} as const;
export const WEATHER_TIMEZONE = 'America/Sao_Paulo';

// ------------------------------------------------------------------------------------- codes
/** A chave do ícone; o app troca pelo ícone do `lucide-react` (o Deno não carrega React). */
export type WeatherIcon =
  | 'sun'
  | 'moon'
  | 'cloud-sun'
  | 'cloud-moon'
  | 'cloud'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'storm'
  | 'hail';

type CodeEntry = { label: string; night?: string; icon: WeatherIcon; severity: number };

/**
 * A tabela do Open-Meteo (conferida na documentação em 07/11/2026, com o 97: os modelos sem previsão
 * de granizo dizem 95 e 97; o 96 e o 99 vêm só dos que têm). A gravidade ordena o que pesa para quem
 * viaja de carro: neblina pesa mais que nuvem, chuva mais que garoa, trovoada mais que tudo. O código
 * diário do Open-Meteo já é "a condição mais severa do dia"; juntar dois lugares usa a mesma ideia.
 */
export const WEATHER_CODES: Readonly<Record<number, CodeEntry>> = {
  0: { label: 'Céu limpo', icon: 'sun', severity: 0 },
  1: { label: 'Predomínio de sol', night: 'Poucas nuvens', icon: 'sun', severity: 1 },
  2: { label: 'Parcialmente nublado', icon: 'cloud-sun', severity: 2 },
  3: { label: 'Nublado', icon: 'cloud', severity: 3 },
  45: { label: 'Neblina', icon: 'fog', severity: 4 },
  48: { label: 'Neblina com geada', icon: 'fog', severity: 5 },
  51: { label: 'Garoa fraca', icon: 'drizzle', severity: 6 },
  53: { label: 'Garoa moderada', icon: 'drizzle', severity: 7 },
  55: { label: 'Garoa forte', icon: 'drizzle', severity: 8 },
  56: { label: 'Garoa congelante fraca', icon: 'drizzle', severity: 9 },
  57: { label: 'Garoa congelante forte', icon: 'drizzle', severity: 10 },
  61: { label: 'Chuva fraca', icon: 'rain', severity: 11 },
  80: { label: 'Pancadas de chuva fracas', icon: 'rain', severity: 12 },
  63: { label: 'Chuva moderada', icon: 'rain', severity: 13 },
  81: { label: 'Pancadas de chuva moderadas', icon: 'rain', severity: 14 },
  65: { label: 'Chuva forte', icon: 'rain', severity: 15 },
  82: { label: 'Pancadas de chuva muito fortes', icon: 'rain', severity: 16 },
  66: { label: 'Chuva congelante fraca', icon: 'rain', severity: 17 },
  67: { label: 'Chuva congelante forte', icon: 'rain', severity: 18 },
  71: { label: 'Neve fraca', icon: 'snow', severity: 19 },
  85: { label: 'Pancadas de neve fracas', icon: 'snow', severity: 20 },
  73: { label: 'Neve moderada', icon: 'snow', severity: 21 },
  77: { label: 'Grãos de neve', icon: 'snow', severity: 21 },
  75: { label: 'Neve forte', icon: 'snow', severity: 22 },
  86: { label: 'Pancadas de neve fortes', icon: 'snow', severity: 23 },
  95: { label: 'Trovoada', icon: 'storm', severity: 24 },
  96: { label: 'Trovoada com granizo fraco', icon: 'hail', severity: 25 },
  97: { label: 'Trovoada forte', icon: 'storm', severity: 26 },
  99: { label: 'Trovoada com granizo forte', icon: 'hail', severity: 27 },
};

export type WeatherCodeInfo = {
  /** o rótulo em pt-BR; para um código desconhecido, o de reserva */
  label: string;
  icon: WeatherIcon;
  /** -1 para o desconhecido: nunca vence um código conhecido ao juntar dois lugares */
  severity: number;
  known: boolean;
};

const UNKNOWN: WeatherCodeInfo = {
  label: 'Previsão do tempo',
  icon: 'cloud',
  severity: -1,
  known: false,
};

/** O código WMO lido para a tela. De noite (`isDay` falso), sol vira lua. */
export function weatherCode(code: number | null, isDay = true): WeatherCodeInfo {
  const entry =
    code !== null && Object.hasOwn(WEATHER_CODES, code) ? WEATHER_CODES[code] : undefined;
  if (!entry) return UNKNOWN;
  let icon = entry.icon;
  if (!isDay && icon === 'sun') icon = 'moon';
  if (!isDay && icon === 'cloud-sun') icon = 'cloud-moon';
  return {
    label: !isDay && entry.night ? entry.night : entry.label,
    icon,
    severity: entry.severity,
    known: true,
  };
}

/** O mais grave de dois códigos (o desconhecido perde para qualquer conhecido). */
export function severest(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return weatherCode(b).severity > weatherCode(a).severity ? b : a;
}

// ------------------------------------------------------------------------------------ points
/** A partir desta distância, onde o dia termina tem tempo próprio (planalto e vale num mesmo dezembro). */
export const FAR_END_M = 50_000;

export type LatLng = { lat: number; lng: number };
/** Um lugar do pedido: coordenadas com 2 casas (~1 km), para o mesmo lugar não sair duas vezes. */
export type WeatherPlace = { key: string; lat: number; lng: number };

/**
 * Duas casas e não uma: o Open-Meteo corrige a temperatura pela altitude do ponto pedido, e 10 km no
 * planalto podem ser 500 m de altitude (uns 3°). A 1 km o erro fica abaixo da resolução dos modelos.
 */
export function placeOf(point: LatLng): WeatherPlace {
  const lat = Math.round(point.lat * 100) / 100;
  const lng = Math.round(point.lng * 100) / 100;
  return { key: `${lat.toFixed(2)},${lng.toFixed(2)}`, lat, lng };
}

export type DayEnds = { start: WeatherPlace; end: WeatherPlace | null };

/**
 * Onde o dia começa e onde termina, pela primeira e pela última parada com coordenadas. O fim só conta
 * a 50 km ou mais do começo, medidos nas coordenadas de verdade. O servidor chama com os fatos
 * `first_point` e `last_point` do `due_notifications`; o app, com as paradas do dia (`dayPoints`).
 */
export function dayEnds(first: LatLng | null, last: LatLng | null): DayEnds | null {
  if (!first) return null;
  const start = placeOf(first);
  if (!last || haversineM([first.lng, first.lat], [last.lng, last.lat]) < FAR_END_M) {
    return { start, end: null };
  }
  const end = placeOf(last);
  return { start, end: end.key === start.key ? null : end };
}

/** A hora cheia mais perto de um horário escrito ("13:30" → "14:00"); 23:30 em diante fica nas 23:00. */
export function roundToHour(time: string): string | null {
  const m = /^(\d{2}):(\d{2})/.exec(time);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const hour = Math.min(23, min >= 30 ? h + 1 : h);
  return `${String(hour).padStart(2, '0')}:00`;
}

/** O que o dia precisa da parada: a ordem é a do dia; só as vivas e não puladas entram. */
export type PointStop = {
  id: string;
  lat: number | null;
  lng: number | null;
  time: string | null;
  skipped: boolean;
};

export type StopPoint = { stop_id: string; place: WeatherPlace; hour: string };
export type DayPoints = { ends: DayEnds | null; stops: StopPoint[] };

/**
 * Os lugares de um dia: onde começa e onde termina, e cada parada com horário escrito, pela previsão
 * daquela hora. **Parada sem horário não ganha previsão por hora**: nunca se inventa uma chegada.
 */
export function dayPoints(stops: readonly PointStop[]): DayPoints {
  const located = stops.filter(
    (s): s is PointStop & LatLng => !s.skipped && s.lat !== null && s.lng !== null,
  );
  const first = located[0] ?? null;
  const last = located.at(-1) ?? null;
  return {
    ends: dayEnds(first, last),
    stops: located.flatMap((s) => {
      const hour = s.time ? roundToHour(s.time) : null;
      return hour ? [{ stop_id: s.id, place: placeOf(s), hour }] : [];
    }),
  };
}

// ----------------------------------------------------------------------------------- horizon
/** O Open-Meteo prevê até hoje + 15 (`forecast_days` 16); além disso, a API recusa o pedido. */
export const HORIZON_DAYS = 15;

/** 'YYYY-MM-DD' + n dias, sem fuso (meio-dia em UTC não vira o dia ao lado). */
export function addDaysISO(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A data de agora no fuso de São Paulo, igual no servidor e no celular de quem está em outro fuso. */
export function todayIn(now: Date, timeZone = WEATHER_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export type Horizon =
  /** já passou: nada aparece */
  | { status: 'past' }
  | { status: 'forecast' }
  /** longe demais: "previsão a partir de" `from` (a data do dia menos 15) */
  | { status: 'later'; from: string };

export function horizonOf(date: string, today: string): Horizon {
  if (date < today) return { status: 'past' };
  if (date <= addDaysISO(today, HORIZON_DAYS)) return { status: 'forecast' };
  return { status: 'later', from: addDaysISO(date, -HORIZON_DAYS) };
}

// ----------------------------------------------------------------------------------- request
export const DAILY_VARIABLES = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_probability_max',
] as const;
export const HOURLY_VARIABLES = [
  'temperature_2m',
  'precipitation_probability',
  'weather_code',
  'is_day',
] as const;

export type ForecastRequest = {
  places: readonly WeatherPlace[];
  /** o primeiro e o último dia pedidos, dentro do horizonte */
  start: string;
  end: string;
  /** a previsão por hora (as paradas com horário); o aviso só precisa do dia */
  hourly: boolean;
};

/** Uma chamada só para todos os lugares: cada lugar conta uma chamada no limite do Open-Meteo. */
export function forecastUrl(req: ForecastRequest): string {
  const params = new URLSearchParams({
    latitude: req.places.map((p) => p.lat.toFixed(2)).join(','),
    longitude: req.places.map((p) => p.lng.toFixed(2)).join(','),
    daily: DAILY_VARIABLES.join(','),
    timezone: WEATHER_TIMEZONE,
    start_date: req.start,
    end_date: req.end,
  });
  if (req.hourly) params.set('hourly', HOURLY_VARIABLES.join(','));
  return `${OPEN_METEO_URL}?${params.toString()}`;
}

// ------------------------------------------------------------------------------------- parse
const value = z.number().nullable();
const series = <T extends z.ZodType>(v: T) => z.array(v);

// o resumo do dia vai em todo pedido: sem ele (uma resposta de erro, `{ error: true, reason }`, por
// exemplo) a resposta não vale
const forecastSchema = z
  .object({
    error: z.never().optional(),
    daily: z.object({
      time: z.array(z.string()),
      weather_code: series(value),
      temperature_2m_max: series(value),
      temperature_2m_min: series(value),
      precipitation_probability_max: series(value),
    }),
    hourly: z
      .object({
        time: z.array(z.string()),
        temperature_2m: series(value),
        precipitation_probability: series(value),
        weather_code: series(value),
        is_day: series(value),
      })
      .optional(),
  })
  .refine(
    (f) =>
      [
        f.daily.weather_code,
        f.daily.temperature_2m_max,
        f.daily.temperature_2m_min,
        f.daily.precipitation_probability_max,
      ].every((s) => s.length === f.daily.time.length) &&
      (!f.hourly ||
        [
          f.hourly.temperature_2m,
          f.hourly.precipitation_probability,
          f.hourly.weather_code,
          f.hourly.is_day,
        ].every((s) => s.length === f.hourly?.time.length)),
    'séries de tamanhos diferentes',
  );
export type Forecast = z.infer<typeof forecastSchema>;

export type ParsedForecast = { ok: true; forecasts: Forecast[] } | { ok: false };

/**
 * A resposta do Open-Meteo: um lugar volta como objeto, vários como lista, **na ordem do pedido** (a
 * latitude que volta é a do centro da grade do modelo, não a pedida: casar pela posição, nunca pela
 * coordenada). Fora do formato, ou com outra quantidade de lugares, nada vale.
 */
export function parseForecast(json: unknown, count: number): ParsedForecast {
  const list: unknown[] = Array.isArray(json) ? json : [json];
  if (list.length !== count) return { ok: false };
  const forecasts: Forecast[] = [];
  for (const item of list) {
    const parsed = forecastSchema.safeParse(item);
    if (!parsed.success) return { ok: false };
    forecasts.push(parsed.data);
  }
  return { ok: true, forecasts };
}

// ----------------------------------------------------------------------------------- summary
export type DayWeather = { max: number; min: number; rain: number | null; code: number | null };
export type HourWeather = {
  temp: number;
  rain: number | null;
  code: number | null;
  is_day: boolean;
};

/** O dia de um lugar; sem máxima ou mínima não há resumo. */
export function dailyOn(forecast: Forecast, date: string): DayWeather | null {
  const d = forecast.daily;
  const i = d.time.indexOf(date);
  if (i < 0) return null;
  const max = d.temperature_2m_max[i] ?? null;
  const min = d.temperature_2m_min[i] ?? null;
  if (max === null || min === null) return null;
  return {
    max,
    min,
    rain: d.precipitation_probability_max[i] ?? null,
    code: d.weather_code[i] ?? null,
  };
}

/** A previsão de uma hora cheia ('HH:00') de um dia; sem temperatura não há previsão. */
export function hourlyAt(forecast: Forecast, date: string, hour: string): HourWeather | null {
  const h = forecast.hourly;
  if (!h) return null;
  const i = h.time.indexOf(`${date}T${hour}`);
  if (i < 0) return null;
  const temp = h.temperature_2m[i] ?? null;
  if (temp === null) return null;
  return {
    temp,
    rain: h.precipitation_probability[i] ?? null,
    code: h.weather_code[i] ?? null,
    is_day: (h.is_day[i] ?? 1) !== 0,
  };
}

/**
 * O dia inteiro a partir dos lugares (onde começa e onde termina): a menor mínima, a maior máxima, a
 * maior chance de chuva e o código mais grave. É o que o aviso diz e o que a faixa da visão geral mostra.
 */
export function combineDays(days: readonly DayWeather[]): DayWeather | null {
  const [first, ...rest] = days;
  if (!first) return null;
  return rest.reduce<DayWeather>(
    (acc, d) => ({
      max: Math.max(acc.max, d.max),
      min: Math.min(acc.min, d.min),
      rain: acc.rain === null ? d.rain : d.rain === null ? acc.rain : Math.max(acc.rain, d.rain),
      code: severest(acc.code, d.code),
    }),
    first,
  );
}

/** A chance de chuva só se diz a partir de 20%: abaixo disso é ruído, em todas as telas e no aviso. */
export const RAIN_SHOWN_FROM = 20;
/** Na pílula da maquete, o ícone de chuva só quando é mais provável chover do que não. */
export const RAIN_LIKELY = 50;

export function rainShown(rain: number | null): number | null {
  return rain !== null && rain >= RAIN_SHOWN_FROM ? Math.round(rain) : null;
}

/** "31°": arredondado, sem casa decimal (a previsão não tem essa precisão). */
export function degrees(t: number): string {
  return `${String(Math.round(t) || 0)}°`;
}

/** "26° / 15°": máxima e mínima, como na faixa e na página do dia. */
export function rangeText(day: DayWeather): string {
  return `${degrees(day.max)} / ${degrees(day.min)}`;
}

/**
 * O clima do aviso, curto, para caber na tela bloqueada: "Parcialmente nublado, 15° a 31°, chuva
 * 60%". Sem a chuva quando ela fica abaixo de 20%; sem o rótulo quando o código é desconhecido.
 */
export function briefingWeatherText(day: DayWeather): string {
  const info = weatherCode(day.code);
  const rain = rainShown(day.rain);
  return [
    info.known ? info.label : null,
    `${degrees(day.min)} a ${degrees(day.max)}`,
    rain === null ? null : `chuva ${String(rain)}%`,
  ]
    .filter((p): p is string => p !== null)
    .join(', ');
}

/** O detalhe de uma parada: "24° · chuva 30%". */
export function hourText(hour: HourWeather): string {
  const rain = rainShown(hour.rain);
  return rain === null ? degrees(hour.temp) : `${degrees(hour.temp)} · chuva ${String(rain)}%`;
}
