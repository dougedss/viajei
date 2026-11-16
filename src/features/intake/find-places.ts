import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import {
  PLACES_FN,
  placesErrorSchema,
  placesResponseSchema,
  type Place,
  type PlacesErrorCode,
  type PlacesRequest,
} from '@shared/places-schema.ts';
import { connectivity } from '@/lib/db/connectivity.ts';
import { db } from '@/lib/db/schema.ts';
import { fnv64 } from '@/lib/ids/hash.ts';
import { supabase } from '@/lib/supabase/client.ts';
import { placesFresh, placesKey } from './search.ts';

/**
 * A busca de lugares por tipo, do app (fase 24): pela Edge Function `find-places` (a chave da
 * Geoapify mora no servidor; nenhuma chamada à Geoapify sai do navegador), com o resultado guardado
 * no Dexie pela busca arredondada, como o `geocode` faz com o Nominatim: a mesma conversa reaberta não
 * busca nem gasta crédito de novo. Sem chave no servidor, `no_source`: quem chama diz que não deu para
 * buscar no mapa e oferece a busca por nome.
 */
export class PlacesError extends Error {
  readonly code: PlacesErrorCode | 'offline';
  constructor(code: PlacesErrorCode | 'offline', message: string) {
    super(message);
    this.code = code;
  }
}

export async function findPlaces(request: PlacesRequest): Promise<Place[]> {
  const key = placesKey(request, fnv64);
  const cached = await db.places.get(key);
  if (cached && placesFresh(cached.fetched_at, Date.now())) return cached.places;
  const response = await supabase.functions.invoke<unknown>(PLACES_FN, { body: request });
  const error: unknown = response.error;
  if (error) {
    if (error instanceof FunctionsFetchError) {
      connectivity.markOffline();
      throw new PlacesError('offline', 'Sem conexão para buscar no mapa.');
    }
    let body: unknown = null;
    if (error instanceof FunctionsHttpError) {
      const ctx: unknown = error.context;
      if (ctx instanceof Response) body = await ctx.json().catch(() => null);
    }
    const parsed = placesErrorSchema.safeParse(body);
    throw new PlacesError(
      parsed.success ? parsed.data.error.code : 'internal',
      parsed.success ? parsed.data.error.message : 'Não deu para buscar no mapa.',
    );
  }
  connectivity.markOnline();
  const parsed = placesResponseSchema.safeParse(response.data);
  if (!parsed.success)
    throw new PlacesError('internal', 'O mapa respondeu num formato inesperado.');
  await db.places.put({ key, places: parsed.data.places, fetched_at: parsed.data.fetched_at });
  return parsed.data.places;
}
