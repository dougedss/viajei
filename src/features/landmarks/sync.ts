import { z } from 'zod';
import { cityPlaceKey, stopPlaceKey } from '@shared/landmark-keys.ts';
import type { LayoutPlace } from '@/features/world/layout.ts';
import { db, type LandmarkEntry, type Stop } from '@/lib/db/schema.ts';
import type { Json } from '@/lib/supabase/database.types.ts';
import { supabase } from '@/lib/supabase/client.ts';
import { storeCatalog } from './catalog.ts';

/**
 * O pedido do app ao catálogo (fase 23): quando o roteiro de um dia fica pronto (as paradas com
 * coordenada, a rota calculada e as cidades de passagem lidas) e há internet, a lista dos lugares do
 * dia vai à RPC `landmark_sync`, que devolve o que está publicado (as receitas, poucos KB), o que
 * espera a conferência deste aparelho, o que está na fila, o que não tem referência e o que passou do
 * teto de 12 lugares novos da viagem; o que falta ela enfileira. Nada de IA aqui. Uma vez por
 * (viagem, dia, lista de lugares) por sessão: o pedido repetido não custa, mas não precisa.
 */
export type PlaceInput = {
  key: string;
  kind: 'stop' | 'city';
  name: string;
  lat?: number;
  lng?: number;
  stop_kind?: string;
  osm_type?: string;
  osm_id?: number;
  uf?: string;
  /** só a medição do laboratório: enfileira mesmo para uma conta do laboratório */
  measure?: boolean;
};

/** Os lugares de um dia: as paradas com chave e as cidades de passagem que o layout escolheu. */
export function placesOfDay(stops: readonly Stop[], cities: readonly LayoutPlace[]): PlaceInput[] {
  const out: PlaceInput[] = [];
  const seen = new Set<string>();
  for (const s of stops) {
    if (s.deleted_at !== null) continue;
    const key = stopPlaceKey(s);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      kind: 'stop',
      name: s.name,
      ...(s.lat !== null && s.lng !== null ? { lat: s.lat, lng: s.lng } : {}),
      stop_kind: s.kind,
      ...(s.osm_type && s.osm_id ? { osm_type: s.osm_type, osm_id: s.osm_id } : {}),
    });
  }
  for (const c of cities) {
    const key = c.key ?? cityPlaceKey(c.uf, c.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, kind: 'city', name: c.name, uf: c.uf });
  }
  return out.slice(0, 60);
}

const itemSchema = z.object({
  key: z.string(),
  state: z.enum(['published', 'check', 'pending', 'none', 'capped']),
  landmark_id: z.string().optional(),
  name: z.string().optional(),
  version: z.number().optional(),
  recipe: z.unknown().optional(),
  can_remake: z.boolean().optional(),
  remake: z
    .object({ id: z.string(), status: z.string(), options: z.array(z.unknown()) })
    .optional(),
});
const responseSchema = z.object({
  items: z.array(itemSchema),
  new: z.number(),
  used: z.number(),
  cap: z.number(),
});
export type SyncResponse = z.infer<typeof responseSchema>;

/** A resposta do servidor como linhas do catálogo local. */
export function toEntries(
  places: readonly PlaceInput[],
  response: SyncResponse,
  now = new Date().toISOString(),
): LandmarkEntry[] {
  const kinds = new Map(places.map((p) => [p.key, p.kind]));
  return response.items.map((item) => ({
    place_key: item.key,
    kind: kinds.get(item.key) ?? 'stop',
    landmark_id: item.landmark_id ?? null,
    name: item.name ?? null,
    version: item.version ?? 0,
    status: item.state,
    recipe:
      item.state === 'published' || item.state === 'check' ? ((item.recipe ?? null) as Json) : null,
    can_remake: item.can_remake === true,
    remake: item.remake
      ? {
          id: item.remake.id,
          status: item.remake.status,
          options: item.remake.options as (Json | null)[],
        }
      : null,
    fetched_at: now,
  }));
}

const done = new Set<string>();

/** Pede ao servidor, grava no Dexie e devolve as linhas; `null` quando não houve pedido. */
export async function syncLandmarks(
  tripId: string,
  places: readonly PlaceInput[],
  options: { force?: boolean } = {},
): Promise<LandmarkEntry[] | null> {
  if (places.length === 0) return null;
  const key = `${tripId}:${places.map((p) => p.key).join('|')}`;
  if (!options.force && done.has(key)) return null;
  done.add(key);
  const { data, error } = await supabase.rpc('landmark_sync', {
    p_trip: tripId,
    p_places: places as unknown as Json,
  });
  if (error) {
    done.delete(key);
    return null;
  }
  const parsed = responseSchema.safeParse(data);
  if (!parsed.success) return null;
  const entries = toEntries(places, parsed.data);
  await storeCatalog(entries);
  // uma chave que saiu do catálogo do servidor (tirada do ar) some daqui pela próxima resposta: o
  // estado `none` a cobre; nada mais a apagar
  return entries;
}

/** O que este aparelho precisa conferir (a receita gerada a quem pediu): as linhas `check`. */
export async function pendingChecks(): Promise<LandmarkEntry[]> {
  return db.landmarks.filter((r) => r.status === 'check' && r.landmark_id !== null).toArray();
}
