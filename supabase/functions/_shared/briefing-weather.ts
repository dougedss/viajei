import { z } from 'zod';
import {
  combineDays,
  dailyOn,
  dayEnds,
  forecastUrl,
  parseForecast,
  type DayEnds,
  type DayWeather,
  type Forecast,
  type WeatherPlace,
} from './weather.ts';

/**
 * O clima do briefing da manhã, do lado do servidor. A `send-notifications` junta os briefings do
 * lote, escolhe os lugares pela mesma regra do app (`dayEnds`), faz **uma** chamada ao Open-Meteo com
 * todos os lugares distintos e grava o resultado em `data.weather` antes de enviar: a nova tentativa
 * de um aviso reusa o que foi gravado e escreve o mesmo texto. O aviso nunca espera o clima: o prazo
 * é curto e, sem resposta, ele sai sem clima, com o motivo gravado (o laboratório confere por ele).
 */
export const BRIEFING_WEATHER_TIMEOUT_MS = 3_000;

const pointSchema = z.object({ lat: z.number(), lng: z.number() });

const placeFactSchema = z.object({
  role: z.enum(['start', 'end']),
  lat: z.number(),
  lng: z.number(),
  max: z.number(),
  min: z.number(),
  rain: z.number().nullable(),
  code: z.number().nullable(),
});
export type BriefingPlaceFact = z.infer<typeof placeFactSchema>;

/**
 * Os motivos de um briefing sem clima, como código curto: `no_point` (o dia não tem parada com
 * coordenada), `no_data` (a previsão veio sem os números do dia), `timeout`, `network`, `invalid`
 * (resposta fora do formato) e `http_<status>`.
 */
export const briefingWeatherSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), places: z.array(placeFactSchema).min(1).max(2) }),
  z.object({ status: z.literal('none'), reason: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/) }),
]);
export type BriefingWeather = z.infer<typeof briefingWeatherSchema>;

/** O que a função lê de cada briefing: o dia e os dois pontos que o `due_notifications` mandou. */
export type BriefingRow = {
  id: string;
  date: string | null | undefined;
  first_point: unknown;
  last_point: unknown;
};

function point(value: unknown): { lat: number; lng: number } | null {
  const parsed = pointSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Onde o dia do aviso começa e termina, pela regra do app (o fim só a 50 km ou mais). */
export function briefingEnds(row: Pick<BriefingRow, 'first_point' | 'last_point'>): DayEnds | null {
  return dayEnds(point(row.first_point), point(row.last_point));
}

/** O dia inteiro a partir dos fatos gravados: o que o texto do aviso diz. Sem clima, null. */
export function briefingDay(weather: BriefingWeather | null | undefined): DayWeather | null {
  if (weather?.status !== 'ok') return null;
  return combineDays(weather.places.map(({ max, min, rain, code }) => ({ max, min, rain, code })));
}

type Fetched = { ok: true; forecasts: Forecast[] } | { ok: false; reason: string };

async function fetchForecasts(
  url: string,
  count: number,
  fetchFn: typeof fetch,
  timeoutMs: number,
): Promise<Fetched> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // o prazo vale para o pedido e para o corpo; e vale mesmo se o fetch ignorar o sinal
  const deadline = new Promise<Fetched>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ ok: false, reason: 'timeout' });
    }, timeoutMs);
  });
  const work = (async (): Promise<Fetched> => {
    try {
      const res = await fetchFn(url, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (!res.ok) return { ok: false, reason: `http_${String(res.status)}` };
      const parsed = parseForecast(await res.json(), count);
      return parsed.ok ? parsed : { ok: false, reason: 'invalid' };
    } catch {
      return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'network' };
    }
  })();
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * O clima de cada briefing do lote, por id da linha de `notifications_sent`. Uma chamada só, com os
 * lugares distintos de todos os dias (e do primeiro ao último dia, que no lote de um minuto é hoje).
 */
export async function briefingWeather(
  rows: readonly BriefingRow[],
  deps: { fetch: typeof fetch; timeoutMs?: number },
): Promise<Map<string, BriefingWeather>> {
  const out = new Map<string, BriefingWeather>();
  const planned: { row: BriefingRow & { date: string }; ends: DayEnds }[] = [];
  for (const row of rows) {
    const ends = briefingEnds(row);
    if (!ends || !row.date) out.set(row.id, { status: 'none', reason: 'no_point' });
    else planned.push({ row: { ...row, date: row.date }, ends });
  }
  if (planned.length === 0) return out;

  const places = new Map<string, WeatherPlace>();
  for (const { ends } of planned) {
    for (const p of [ends.start, ends.end]) if (p) places.set(p.key, p);
  }
  const list = [...places.values()];
  const dates = planned.map((p) => p.row.date).sort();
  const fetched = await fetchForecasts(
    forecastUrl({
      places: list,
      start: dates[0] ?? '',
      end: dates.at(-1) ?? '',
      hourly: false,
    }),
    list.length,
    deps.fetch,
    deps.timeoutMs ?? BRIEFING_WEATHER_TIMEOUT_MS,
  );

  for (const { row, ends } of planned) {
    if (!fetched.ok) {
      out.set(row.id, { status: 'none', reason: fetched.reason });
      continue;
    }
    const facts: BriefingPlaceFact[] = [];
    for (const [role, place] of [
      ['start', ends.start],
      ['end', ends.end],
    ] as const) {
      if (!place) continue;
      const forecast = fetched.forecasts[list.findIndex((p) => p.key === place.key)];
      const day = forecast ? dailyOn(forecast, row.date) : null;
      if (day) facts.push({ role, lat: place.lat, lng: place.lng, ...day });
    }
    // sem os números de onde o dia começa, o aviso não fala do tempo
    out.set(
      row.id,
      facts[0]?.role === 'start'
        ? { status: 'ok', places: facts }
        : { status: 'none', reason: 'no_data' },
    );
  }
  return out;
}
