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
import { geocode, reverseGeocode } from '@/lib/geocode/nominatim.ts';
import { isoToWall } from '@/lib/time/zone.ts';
import { contextFor, historyOf, placeOfReverse } from './today.ts';
import type { LatLng } from './named.ts';

/**
 * O que o aparelho sabe, para a conversa e a saída de hoje (fase 17): o perfil, as notas, as viagens,
 * e, na saída de hoje, a posição (só se o mapa já tinha a permissão: nada de pedir aqui, D176), a
 * cidade dela pelo Nominatim reverso e o tempo de hoje pelo Open-Meteo, direto do navegador (D146).
 * Cada leitura de fora tem prazo e, se falha, a conta segue sem ela.
 */
export type Gathered = {
  context: Omit<PlanContext, 'reach'>;
  /** onde a conferência dos lugares procura: a posição, ou a origem de antes */
  center: LatLng | null;
};

const withTimeout = <T>(work: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([work.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);

/** A posição de agora, se a pessoa já permitiu no mapa e o navegador também; senão, null. */
async function allowedPosition(): Promise<LatLng | null> {
  const consent = await db.sync_state.get(askKeys.geoAsked);
  if (consent?.value !== 'granted') return null;
  const state = await navigator.permissions
    .query({ name: 'geolocation' })
    .then((s) => s.state)
    .catch(() => 'prompt');
  if (state !== 'granted') return null;
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

export async function gatherContext(kind: 'plan' | 'today', uid: string): Promise<Gathered> {
  const now = new Date();
  const wall = isoToWall(now.toISOString());
  const [profile, trips, stops, memories] = await Promise.all([
    db.profiles.get(uid),
    db.trips.toArray(),
    db.stops.toArray(),
    db.stop_memories.filter((m) => m.user_id === uid).toArray(),
  ]);
  const origin = lastOrigin(trips, uid);
  let position: LatLng | null = null;
  let place: string | null = null;
  let weather: string | null = null;
  let center: LatLng | null = null;
  if (kind === 'today') {
    position = await withTimeout(allowedPosition(), 9_000);
    if (position) {
      const p = position;
      place = placeOfReverse(await withTimeout(reverseGeocode(p.lat, p.lng, undefined, 10), 6_000));
    }
    const fromOrigin =
      !position && origin ? ((await withTimeout(geocode(origin), 6_000))?.[0] ?? null) : null;
    center = position ?? (fromOrigin ? { lat: fromOrigin.lat, lng: fromOrigin.lng } : null);
    if (center) weather = await withTimeout(todayWeather(center, wall.date), 6_000);
  }
  return {
    context: contextFor({
      now,
      today: wall.date,
      time: wall.time,
      origin,
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
