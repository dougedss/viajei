import {
  briefingWeatherText,
  dailyOn,
  forecastUrl,
  parseForecast,
  placeOf,
} from '@shared/weather.ts';
import type { PlanContext } from '@shared/plan-protocol.ts';
import { lastOrigin } from '@/features/import/new-trip.ts';
import { askKeys } from '@/features/notifications/ask.ts';
import { interestsOf, learnedLikes } from '@/features/profile/likes.ts';
import { db } from '@/lib/db/schema.ts';
import { geocode, reverseGeocode, type ReverseRow } from '@/lib/geocode/nominatim.ts';
import { isoToWall } from '@/lib/time/zone.ts';
import { contextFor, historyOf, placeOfReverse } from './today.ts';
import type { LatLng } from './named.ts';

/**
 * O que o aparelho sabe, para a conversa e a saída de hoje (fase 17): o perfil, as notas, as viagens,
 * a posição (fase 25, D271: nos dois caminhos, se a pessoa permitiu no app e no navegador; a conversa
 * passou a pedir o consentimento com uma frase, uma vez), a cidade dela pelo Nominatim reverso e, na
 * saída de hoje, o tempo pelo Open-Meteo, direto do navegador (D146). Cada leitura de fora tem prazo
 * e, se falha, a conta segue sem ela. A rede e o aparelho entram por `deps`, para o teste.
 */
export type Gathered = {
  context: Omit<PlanContext, 'reach'>;
  /** o ponto de referência: a posição, ou a origem de antes geocodificada; null sem os dois */
  center: LatLng | null;
};

export type GatherDeps = {
  now: () => Date;
  /** a posição de agora, se permitida; null senão (nunca lança) */
  position: (opts: { prompt: boolean }) => Promise<LatLng | null>;
  /** a cidade de um ponto (o `/reverse` no zoom 10) */
  reverse: (p: LatLng) => Promise<ReverseRow | null>;
  /** a origem de antes, pelo nome */
  geocode: (q: string) => Promise<LatLng | null>;
  weather: (p: LatLng, today: string) => Promise<string | null>;
};

const withTimeout = <T>(work: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([work.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);

/**
 * A posição de agora, se a pessoa já permitiu no app (a pergunta da D48, `askKeys.geoAsked`) e no
 * navegador; senão, null. Com `prompt`, o navegador pergunta quando ainda não decidiu (o toque em
 * "Usar posição" acabou de acontecer: é o momento da pergunta); sem ele, a conversa não insiste.
 */
export async function devicePosition(opts: { prompt: boolean }): Promise<LatLng | null> {
  const consent = await db.sync_state.get(askKeys.geoAsked);
  if (consent?.value !== 'granted') return null;
  const state = await navigator.permissions
    .query({ name: 'geolocation' })
    .then((s) => s.state)
    .catch(() => 'prompt');
  if (state === 'denied' || (state === 'prompt' && !opts.prompt)) return null;
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 10 * 60_000 },
    ),
  );
}

/** "Parcialmente nublado, 15° a 31°, chuva 60%" de hoje, num ponto; null se o Open-Meteo falhar. */
async function todayWeather(point: LatLng, today: string): Promise<string | null> {
  const url = forecastUrl({ places: [placeOf(point)], start: today, end: today, hourly: false });
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) return null;
  const parsed = parseForecast(await res.json(), 1);
  const day = parsed.ok && parsed.forecasts[0] ? dailyOn(parsed.forecasts[0], today) : null;
  return day ? briefingWeatherText(day) : null;
}

export const deviceDeps: GatherDeps = {
  now: () => new Date(),
  position: (opts) => withTimeout(devicePosition(opts), 9_000),
  reverse: (p) => withTimeout(reverseGeocode(p.lat, p.lng, undefined, 10), 6_000),
  geocode: async (q) => {
    const hit = (await withTimeout(geocode(q), 6_000))?.[0] ?? null;
    return hit ? { lat: hit.lat, lng: hit.lng } : null;
  },
  weather: (p, today) => withTimeout(todayWeather(p, today), 6_000),
};

export async function gatherContext(
  kind: 'plan' | 'today',
  uid: string,
  opts: { prompt: boolean } = { prompt: false },
  deps: GatherDeps = deviceDeps,
): Promise<Gathered> {
  const now = deps.now();
  const wall = isoToWall(now.toISOString());
  const [profile, trips, stops, memories] = await Promise.all([
    db.profiles.get(uid),
    db.trips.toArray(),
    db.stops.toArray(),
    db.stop_memories.filter((m) => m.user_id === uid).toArray(),
  ]);
  const before = lastOrigin(trips, uid);
  // a posição é o ponto de referência de tudo (D271): a origem, o viés da cidade dita, os tempos de
  // carro; a origem de antes só vale sem ela
  const position = await deps.position(opts);
  const place = position ? placeOfReverse(await deps.reverse(position)) : null;
  const center = position ?? (before ? await deps.geocode(before) : null);
  const weather = kind === 'today' && center ? await deps.weather(center, wall.date) : null;
  return {
    context: contextFor({
      now,
      today: wall.date,
      time: wall.time,
      // de onde saem: onde a pessoa está, quando a posição tem cidade; senão a origem de antes
      origin: position && place ? place : before,
      position,
      place,
      interests: interestsOf(profile?.interests),
      learned: learnedLikes(memories, stops, uid),
      history: historyOf(stops, memories, uid, now),
      weather,
    }),
    center,
  };
}
