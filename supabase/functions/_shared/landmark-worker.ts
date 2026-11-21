import type { z } from 'zod';
import type { VariantConfig } from './import-ai.ts';
import {
  cityParams,
  LANDMARK_VARIANTS,
  recipeParams,
  subjectParams,
  textOf,
  usageOf,
  type AiCall,
  type PhotoInput,
  type SubjectCandidate,
} from './landmark-ai.ts';
import {
  aiCityLandmarkSchema,
  aiSubjectSchema,
  type LandmarkErrorCode,
} from './landmark-protocol.ts';
import { parseRecipe, type LandmarkRecipe } from './landmark-recipe.ts';
import {
  commonsCategoryFiles,
  commonsImageInfo,
  distanceM,
  downloadPhoto,
  GEOAPIFY_GAP_MS,
  geocodeSearch,
  outlineToMeters,
  pacer,
  pickPhotos,
  placeDetails,
  placesAround,
  SourceError,
  sourcesRecord,
  wikidataItem,
  wikidataSearch,
  type CommonsPhoto,
  type GeoHit,
  type OsmPlace,
  type Pacer,
  type PhotoBytes,
  type SourceFetch,
  type WikidataItem,
} from './landmark-sources.ts';

/**
 * O trabalhador da fila dos cartões-postais (fase 23), sem Deno e sem rede, como os outros handlers:
 * o `index.ts` liga as RPCs (com a chave do servidor, só as da 0017), o `fetch`, a IA e o relógio; o
 * Vitest liga tudo de mentira. **Um job por chamada**, dentro do relógio da função (150 s no plano
 * gratuito, conferido em 20/11/2026; o orçamento aqui é 130 s):
 *  1. **identificar**: o lugar pelo nome perto da coordenada e o detalhe dele na Geoapify (o objeto do
 *     OSM, a tag `wikidata`, a planta; o Nominatim público recusa o ambiente da função, D268) → o item
 *     do Wikidata (pela tag, senão pela busca com a coordenada conferida) → os objetos do OSM ao redor
 *     (os POIs da Places e a geocodificação pelos nomes) → a IA escolhe **o que modelar** entre eles (o
 *     parque é o lugar; a estufa é a peça), e o detalhe do escolhido traz a planta; para a cidade de
 *     passagem a IA **propõe** o monumento e a função confere que ele existe no mapa dentro do
 *     município e no Wikidata;
 *  2. **as fotos**: a P18 e as da categoria P373, só com licença livre, até três, baixadas com o
 *     User-Agent do app e mandadas à IA em base64;
 *  3. **a receita**: uma chamada de visão com o schema da receita como saída estruturada, conferida pelo
 *     Zod; a peça fica `generated` (o aparelho de quem pediu desenha e manda conferir).
 * Erros com código por etapa; nada da pessoa em log (o Q-id e os códigos, nunca o nome da viagem).
 */
export const JOB_BUDGET_MS = 130_000;

export type LandmarkJob = {
  id: string;
  kind: 'build' | 'remake';
  place_key: string;
  place_kind: 'stop' | 'city';
  trip_id: string | null;
  requested_by: string | null;
  variant: number | null;
  attempt: number;
  lab: boolean;
  input: {
    name?: string;
    lat?: number;
    lng?: number;
    stop_kind?: string;
    osm_type?: 'node' | 'way' | 'relation';
    osm_id?: number;
    uf?: string;
    measure?: boolean;
    variant?: number;
  };
  landmark?: {
    id: string;
    key: string;
    name: string;
    wikidata: string | null;
    modeled: Record<string, unknown>;
    recipe: unknown;
    sources: Record<string, unknown>;
  };
};

export type WorkerRpc = {
  claim(): Promise<LandmarkJob | null>;
  identified(
    job: string,
    key: string,
    name: string,
    wikidata: string | null,
    modeled: unknown,
  ): Promise<{ landmark_id: string; linked: boolean }>;
  store(job: string, recipe: LandmarkRecipe, modeled: unknown, sources: unknown): Promise<void>;
  fail(job: string, code: LandmarkErrorCode, retry: boolean): Promise<void>;
  /** o registro de cada chamada de IA (D128): só números e códigos */
  record(row: {
    user_id: string | null;
    trip_id: string | null;
    model: string;
    input_bytes: number;
    status: 'succeeded' | 'invalid' | 'failed' | 'refused';
    error: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
  }): Promise<void>;
};

export type WorkerDeps = {
  rpc: WorkerRpc;
  fetch: SourceFetch;
  /** a chave da Geoapify (a mesma da `find-places`, D226): o OSM no servidor passa por ela */
  geoapifyKey: string | undefined;
  ai: AiCall;
  log: (line: string) => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** o modelo: o da D133, ou o pedido pela medição (`input.variant` só quando `lab`) */
  variant?: VariantConfig;
};

export type WorkerResult =
  | { status: 'idle' }
  | { status: 'linked'; job: string }
  | {
      status: 'generated';
      job: string;
      landmark_id: string;
      photos: number;
      ms: number;
      usage: { input_tokens: number; output_tokens: number; model: string }[];
    }
  | { status: 'failed'; job: string; code: LandmarkErrorCode; retry: boolean };

class JobError extends Error {
  readonly code: LandmarkErrorCode;
  readonly retry: boolean;
  constructor(code: LandmarkErrorCode, retry = false, detail: string = code) {
    super(detail);
    this.code = code;
    this.retry = retry;
  }
}

const modeledOf = (p: OsmPlace) => ({
  osm_type: p.osm_type,
  osm_id: p.osm_id,
  name: p.name,
  place_id: p.place_id,
});
const label = (p: OsmPlace) => `${p.name} (${p.category}=${p.type})`;
/** o nome do objeto do OSM, quando há objeto e ele tem nome */
const nameOf = (p: OsmPlace | null) => (p && p.name.length > 0 ? p.name : null);

/** Roda o próximo job da fila, se houver; devolve o que aconteceu (para o log e a medição). */
export async function runLandmarkJob(deps: WorkerDeps): Promise<WorkerResult> {
  const now = deps.now ?? Date.now;
  const started = now();
  const pace = pacer(now, deps.sleep);
  const job = await deps.rpc.claim();
  if (!job) return { status: 'idle' };
  const variant: VariantConfig =
    deps.variant ??
    (job.lab && job.input.variant === 2 ? LANDMARK_VARIANTS.opus : LANDMARK_VARIANTS.sonnet);
  const deadline = started + JOB_BUDGET_MS;
  const usage: { input_tokens: number; output_tokens: number; model: string }[] = [];
  const ctx: StepCtx = { deps, job, pace, variant, deadline, now, usage };
  try {
    if (job.kind === 'remake') {
      const out = await remake(ctx);
      return {
        status: 'generated',
        job: job.id,
        landmark_id: out.landmark_id,
        photos: out.photos,
        ms: now() - started,
        usage,
      };
    }
    const place = await identify(ctx);
    const linked = await deps.rpc.identified(
      job.id,
      place.key,
      place.name,
      place.wikidata?.id ?? null,
      place.modeled ? modeledOf(place.modeled) : {},
    );
    if (linked.linked) {
      deps.log(`build-landmark job=${job.id} status=linked key=${place.key}`);
      return { status: 'linked', job: job.id };
    }
    const photos = await referencePhotos(ctx, place.wikidata);
    const recipe = await writeRecipe(ctx, place, photos, null);
    await deps.rpc.store(
      job.id,
      recipe,
      place.modeled ? modeledOf(place.modeled) : {},
      sourcesRecord({
        wikidata: place.wikidata?.id ?? null,
        photos: photos.map((p) => p.photo),
        outline: place.outline ? 'osm' : 'none',
        modeled: place.modeled ? modeledOf(place.modeled) : null,
      }),
    );
    deps.log(
      `build-landmark job=${job.id} status=generated key=${place.key} photos=${String(photos.length)} shapes=${String(recipe.shapes.length)} ms=${String(now() - started)}`,
    );
    return {
      status: 'generated',
      job: job.id,
      landmark_id: linked.landmark_id,
      photos: photos.length,
      ms: now() - started,
      usage,
    };
  } catch (err) {
    const e =
      err instanceof JobError
        ? err
        : err instanceof SourceError
          ? new JobError('source_failed', true, err.message)
          : new JobError('ai_failed', true, err instanceof Error ? err.message : String(err));
    await deps.rpc.fail(job.id, e.code, e.retry);
    // o detalhe de uma fonte que falhou (a fonte e o status, ou "fora do formato"): sem URL, sem a pessoa
    const detail =
      err instanceof SourceError
        ? `${err.source}:${String(err.status)}:${err.message.replace(/\s+/g, '_').slice(0, 60)}`
        : e.code === 'timeout' || e.code === 'ai_failed' || e.code === 'ai_invalid'
          ? e.message.replace(/\s+/g, '_').slice(0, 60)
          : '';
    deps.log(
      `build-landmark job=${job.id} status=failed code=${e.code} retry=${String(e.retry)} attempt=${String(job.attempt)} ms=${String(now() - started)}${detail ? ` detail=${detail}` : ''}`,
    );
    return { status: 'failed', job: job.id, code: e.code, retry: e.retry };
  }
}

type StepCtx = {
  deps: WorkerDeps;
  job: LandmarkJob;
  pace: Pacer;
  variant: VariantConfig;
  deadline: number;
  now: () => number;
  usage: { input_tokens: number; output_tokens: number; model: string }[];
};

type Identified = {
  key: string;
  name: string;
  description: string;
  wikidata: WikidataItem | null;
  /** o objeto do OSM do lugar */
  place: OsmPlace | null;
  /** o objeto que vai ser modelado, quando é outro */
  modeled: OsmPlace | null;
  outline: [number, number][] | null;
  center: { lat: number; lng: number };
};

function ensureTime(ctx: StepCtx, needMs: number): void {
  if (ctx.now() + needMs > ctx.deadline) throw new JobError('timeout', true);
}

const geoapify = <T>(ctx: StepCtx, run: () => Promise<T>) =>
  ctx.pace('geoapify', GEOAPIFY_GAP_MS, run);
/** Uma chamada ao Wikimedia; no `maxlag` da Action API, espera o `Retry-After` e tenta uma vez de novo. */
async function wikimedia<T>(ctx: StepCtx, run: () => Promise<T>): Promise<T> {
  try {
    return await ctx.pace('wikimedia', 250, run);
  } catch (err) {
    if (!(err instanceof SourceError) || err.code !== 'maxlag') throw err;
    const wait = Math.min(err.retryAfterMs ?? MAXLAG_WAIT_MS, MAXLAG_WAIT_MAX_MS);
    if (ctx.deadline - ctx.now() < wait + MAXLAG_MARGIN_MS) throw err;
    await (ctx.deps.sleep ?? defaultSleep)(wait);
    return ctx.pace('wikimedia', 250, run);
  }
}
const MAXLAG_WAIT_MS = 5_000;
const MAXLAG_WAIT_MAX_MS = 10_000;
/** o que ainda tem de caber no orçamento depois da espera (o resto da corrente e a IA) */
const MAXLAG_MARGIN_MS = 60_000;
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function keyOf(ctx: StepCtx): string {
  const key = ctx.deps.geoapifyKey;
  if (!key) throw new JobError('source_failed', true, 'geoapify:0:no_key');
  return key;
}

/** Um objeto ao redor, como a IA o vê e como a função o acha de novo (pelo `place_id`). */
type Around = {
  place_id: string;
  name: string;
  category: string;
  type: string;
  lat: number;
  lng: number;
  wikidata: string | null;
};
const aroundOf = (p: OsmPlace | GeoHit): Around | null =>
  p.place_id && p.name
    ? {
        place_id: p.place_id,
        name: p.name,
        category: p.category,
        type: p.type,
        lat: p.lat,
        lng: p.lng,
        wikidata: 'wikidata' in p ? p.wikidata : null,
      }
    : null;

/** O item do Wikidata pelo nome, aceito só com a coordenada (P625) a até `maxM` do centro. */
async function wikidataNear(
  ctx: StepCtx,
  name: string,
  center: { lat: number; lng: number },
  maxM: number,
): Promise<WikidataItem | null> {
  const { deps } = ctx;
  const found = await wikimedia(ctx, () => wikidataSearch(deps.fetch, name));
  for (const h of found.slice(0, 3)) {
    const cand = await wikimedia(ctx, () => wikidataItem(deps.fetch, h.id));
    if (cand?.coord && distanceM(cand.coord, center) < maxM) return cand;
  }
  return null;
}

// ------------------------------------------------------------------ 1. identificar
async function identify(ctx: StepCtx): Promise<Identified> {
  const { job, deps } = ctx;
  const input = job.input;
  const inputName = input.name;
  if (!inputName) throw new JobError('no_place');
  if (job.place_kind === 'city') return identifyCity(ctx);
  const key = keyOf(ctx);
  const near =
    typeof input.lat === 'number' && typeof input.lng === 'number'
      ? { lat: input.lat, lng: input.lng }
      : null;
  if (!near) throw new JobError('no_place');

  // o lugar pelo nome, perto da coordenada (a caixa de 3 km; o mais perto a até 2 km), e o detalhe
  const hits = await geoapify(ctx, () =>
    geocodeSearch(deps.fetch, key, inputName, { ...near, km: 3 }),
  );
  const hit = hits
    .filter((h) => distanceM(h, near) < 2_000)
    .sort((a, b) => distanceM(a, near) - distanceM(b, near))[0];
  const place = hit ? await geoapify(ctx, () => placeDetails(deps.fetch, key, hit.place_id)) : null;

  // o item do Wikidata: pela tag do OSM, senão pela busca com a coordenada conferida (3 km). Quando o
  // mapa não acha o lugar pelo nome (a geocodificação não indexa toda queda d'água nem todo parque,
  // D269), o item do Wikidata perto da coordenada dita basta: a peça sai das fotos, sem a planta
  let item: WikidataItem | null = null;
  const placeWikidata = place?.wikidata;
  if (placeWikidata) item = await wikimedia(ctx, () => wikidataItem(deps.fetch, placeWikidata));
  item ??= await wikidataNear(ctx, nameOf(place) ?? inputName, place ?? near, 3_000);
  if (!item) throw new JobError(place ? 'no_wikidata' : 'no_place');
  const center = place ? { lat: place.lat, lng: place.lng } : (item.coord ?? near);

  // os objetos do OSM ao redor (os POIs num raio de 500 m, e a busca pelo nome do item e pelo nome
  // dito, na caixa de 2 km) e a escolha do que modelar, pela IA, só entre eles
  const around = new Map<string, Around>();
  const add = (p: OsmPlace | GeoHit) => {
    const a = aroundOf(p);
    if (a && a.place_id !== place?.place_id && distanceM(a, center) < 2_500)
      around.set(a.place_id, a);
  };
  ensureTime(ctx, 25_000);
  for (const p of await geoapify(ctx, () => placesAround(deps.fetch, key, center, 500)).catch(
    () => [] as OsmPlace[],
  ))
    add(p);
  for (const q of new Set([item.label, inputName].filter((v) => v.length > 2))) {
    for (const h of await geoapify(ctx, () =>
      geocodeSearch(deps.fetch, key, q, { ...center, km: 2 }, 5),
    ).catch(() => [] as GeoHit[]))
      add(h);
  }
  const list = [...around.values()].slice(0, 12);
  const candidates: SubjectCandidate[] = [
    {
      index: 0,
      name: nameOf(place) ?? (item.label || inputName),
      category: place?.category ?? 'wikidata',
      type: place?.type ?? input.stop_kind ?? '',
      distance_m: 0,
      wikidata: item.id,
    },
    ...list.map((p, i) => ({
      index: i + 1,
      name: p.name,
      category: p.category,
      type: p.type,
      distance_m: distanceM(p, center),
      wikidata: p.wikidata,
    })),
  ];
  let modeled: OsmPlace | null = null;
  const photosForSubject = await referencePhotos(ctx, item, true).catch(() => [] as PhotoBytes[]);
  if (candidates.length > 1) {
    const chosen = await callAi(
      ctx,
      subjectParams(
        ctx.variant,
        { name: item.label || inputName, description: item.description },
        candidates,
        photosForSubject,
      ),
      aiSubjectSchema,
    );
    const pick = list[chosen.subject_index - 1];
    if (chosen.subject_index > 0 && pick) {
      // o detalhe do escolhido: o objeto do OSM e a planta dele
      modeled = await geoapify(ctx, () => placeDetails(deps.fetch, key, pick.place_id)).catch(
        () => null,
      );
    }
  }
  const outlineSrc = modeled?.outline ?? (modeled ? null : (place?.outline ?? null));
  return {
    key: `wikidata:${item.id}`,
    name: item.label || (nameOf(place) ?? inputName),
    description: item.description,
    wikidata: item,
    place,
    modeled,
    outline: outlineSrc ? outlineToMeters(outlineSrc, modeled ?? center) : null,
    center,
  };
}

async function identifyCity(ctx: StepCtx): Promise<Identified> {
  const { job, deps } = ctx;
  const key = keyOf(ctx);
  const name = job.input.name ?? '';
  const uf = job.input.uf ?? '';
  // o município no mapa (a caixa dele é onde o monumento precisa estar)
  const cities = await geoapify(ctx, () =>
    geocodeSearch(deps.fetch, key, `${name}, ${uf}, Brasil`, null, 3, 'city'),
  );
  const city = cities.find((c) => c.bbox !== null);
  const bbox = city?.bbox;
  if (!bbox) throw new JobError('no_place');
  // a IA propõe; o mapa e o Wikidata conferem
  const proposal = await callAi(ctx, cityParams(ctx.variant, { name, uf }), aiCityLandmarkSchema);
  if (proposal.kind === 'none' || !proposal.name.trim()) throw new JobError('no_subject');
  const [s, n, w, e] = bbox;
  const inside = (p: { lat: number; lng: number }) =>
    p.lat >= s && p.lat <= n && p.lng >= w && p.lng <= e;
  let hit: GeoHit | null = null;
  for (const q of [proposal.name, proposal.alternative].filter((v) => v.trim())) {
    ensureTime(ctx, 20_000);
    const found = await geoapify(ctx, () =>
      geocodeSearch(deps.fetch, key, `${q}, ${name}`, null, 5),
    );
    hit = found.find(inside) ?? null;
    if (hit) break;
  }
  if (!hit) throw new JobError('no_subject');
  const monument = await geoapify(ctx, () => placeDetails(deps.fetch, key, hit.place_id));
  if (!monument) throw new JobError('no_subject');
  const monumentWikidata = monument.wikidata;
  let item: WikidataItem | null = monumentWikidata
    ? await wikimedia(ctx, () => wikidataItem(deps.fetch, monumentWikidata))
    : null;
  item ??= await wikidataNear(ctx, proposal.name, monument, 1_500);
  if (!item) throw new JobError('no_wikidata');
  return {
    key: `wikidata:${item.id}`,
    name: item.label || monument.name,
    description: item.description || `${proposal.kind} em ${name}`,
    wikidata: item,
    place: monument,
    modeled: null,
    outline: monument.outline ? outlineToMeters(monument.outline, monument) : null,
    center: { lat: monument.lat, lng: monument.lng },
  };
}

// ------------------------------------------------------------------ 2. as fotos
async function referencePhotos(
  ctx: StepCtx,
  item: WikidataItem | null,
  onlyMain = false,
): Promise<PhotoBytes[]> {
  const { deps } = ctx;
  if (!item) throw new JobError('no_photos');
  const titles: string[] = [];
  if (item.image) titles.push(item.image);
  const category = item.category;
  if (!onlyMain && category) {
    const files = await wikimedia(ctx, () => commonsCategoryFiles(deps.fetch, category)).catch(
      () => [] as string[],
    );
    for (const f of files) if (!titles.includes(f.replace(/^File:/, ''))) titles.push(f);
  }
  if (titles.length === 0) throw new JobError('no_photos');
  const info: CommonsPhoto[] = await wikimedia(ctx, () =>
    commonsImageInfo(deps.fetch, titles.slice(0, 20)),
  );
  const picked = pickPhotos(item.image, info);
  if (picked.length === 0) throw new JobError(info.length > 0 ? 'no_free_license' : 'no_photos');
  const out: PhotoBytes[] = [];
  for (const photo of picked) {
    ensureTime(ctx, 15_000);
    const bytes = await wikimedia(ctx, () => downloadPhoto(deps.fetch, photo));
    if (bytes) out.push(bytes);
  }
  if (out.length === 0) throw new JobError('no_photos', true);
  return out;
}

// ------------------------------------------------------------------ 3. a receita
async function writeRecipe(
  ctx: StepCtx,
  place: Identified,
  photos: readonly PhotoBytes[],
  variant: number | null,
): Promise<LandmarkRecipe> {
  const box = boxFor(ctx.job);
  const params = recipeParams(
    ctx.variant,
    {
      name: place.name,
      description: place.description,
      modeled: place.modeled ? label(place.modeled) : null,
      outline: place.outline,
      measures: {
        height_m:
          place.modeled?.height_m ?? place.wikidata?.height_m ?? place.place?.height_m ?? null,
        width_m: place.modeled ? null : (place.wikidata?.width_m ?? null),
        length_m: place.modeled ? null : (place.wikidata?.length_m ?? null),
      },
      box,
      variant,
    },
    photos.map(toInput),
  );
  const raw = await callAiRaw(
    ctx,
    params,
    photos.reduce((acc, p) => acc + p.data.length, 0),
  );
  const recipe = parseRecipe(raw);
  if (!recipe) throw new JobError('ai_invalid', true);
  return recipe;
}

/** A caixa da peça: a do tipo da parada (as medidas da D219), ou a da cidade. */
function boxFor(job: LandmarkJob): { w: number; h: number; d: number } {
  const boxes: Record<string, { w: number; h: number; d: number }> = {
    origin: { w: 12, h: 8, d: 10 },
    transit: { w: 6, h: 5, d: 4 },
    nature: { w: 18, h: 11, d: 14 },
    winery: { w: 18, h: 7, d: 14 },
    hotel: { w: 16, h: 11, d: 12 },
    food: { w: 15, h: 8, d: 12 },
    event: { w: 18, h: 9, d: 14 },
    city: { w: 18, h: 18, d: 16 },
    fuel: { w: 16, h: 8, d: 12 },
    other: { w: 6, h: 8, d: 3 },
  };
  const nature = { w: 18, h: 11, d: 14 };
  if (job.place_kind === 'city') return boxes.city ?? nature;
  return boxes[job.input.stop_kind ?? ''] ?? nature;
}

async function remake(ctx: StepCtx): Promise<{ landmark_id: string; photos: number }> {
  const { job, deps } = ctx;
  const lm = job.landmark;
  const lmWikidata = lm?.wikidata;
  if (!lm || !lmWikidata) throw new JobError('no_wikidata');
  const item = await wikimedia(ctx, () => wikidataItem(deps.fetch, lmWikidata));
  if (!item) throw new JobError('no_wikidata');
  const modeled = lm.modeled as { place_id?: string | null };
  let modeledPlace: OsmPlace | null = null;
  const modeledId = modeled.place_id;
  if (modeledId && deps.geoapifyKey) {
    const key = deps.geoapifyKey;
    modeledPlace = await geoapify(ctx, () => placeDetails(deps.fetch, key, modeledId)).catch(
      () => null,
    );
  }
  const photos = await referencePhotos(ctx, item);
  const place: Identified = {
    key: lm.key,
    name: lm.name,
    description: item.description,
    wikidata: item,
    place: null,
    modeled: modeledPlace,
    outline: modeledPlace?.outline ? outlineToMeters(modeledPlace.outline, modeledPlace) : null,
    center: item.coord ?? { lat: 0, lng: 0 },
  };
  const recipe = await writeRecipe(ctx, place, photos, job.variant ?? 1);
  await deps.rpc.store(job.id, recipe, null, null);
  deps.log(
    `build-landmark job=${job.id} status=generated kind=remake variant=${String(job.variant)} shapes=${String(recipe.shapes.length)}`,
  );
  return { landmark_id: lm.id, photos: photos.length };
}

// ------------------------------------------------------------------ a IA, com o registro
const toInput = (p: PhotoBytes): PhotoInput => ({ media_type: p.media_type, data: p.data });

async function callAiRaw(
  ctx: StepCtx,
  params: Parameters<AiCall>[0],
  inputBytes: number,
): Promise<unknown> {
  ensureTime(ctx, 25_000);
  const { deps, job } = ctx;
  const remaining = Math.max(10_000, ctx.deadline - ctx.now());
  const base = {
    user_id: job.requested_by,
    trip_id: job.trip_id,
    model: params.model,
    input_bytes: inputBytes,
  };
  let message;
  try {
    message = await deps.ai(params, { signal: AbortSignal.timeout(remaining) });
  } catch (err) {
    await deps.rpc
      .record({
        ...base,
        status: 'failed',
        error: 'ai_failed',
        input_tokens: null,
        output_tokens: null,
      })
      .catch(() => undefined);
    throw new JobError('ai_failed', true, err instanceof Error ? err.message : String(err));
  }
  const usage = usageOf(message);
  ctx.usage.push({ ...usage, model: message.model });
  if (message.stop_reason === 'refusal') {
    await deps.rpc
      .record({ ...base, status: 'refused', error: 'refusal', ...usage })
      .catch(() => undefined);
    throw new JobError('ai_failed', false, 'refusal');
  }
  const text = textOf(message);
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  const ok = json !== null && message.stop_reason !== 'max_tokens';
  await deps.rpc
    .record({
      ...base,
      status: ok ? 'succeeded' : 'invalid',
      error: ok ? null : message.stop_reason === 'max_tokens' ? 'max_tokens' : 'invalid_json',
      ...usage,
    })
    .catch(() => undefined);
  if (!ok) throw new JobError('ai_invalid', true);
  return json;
}

async function callAi<T>(
  ctx: StepCtx,
  params: Parameters<AiCall>[0],
  schema: z.ZodType<T>,
): Promise<T> {
  const json = await callAiRaw(ctx, params, 0);
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new JobError('ai_invalid', true);
  return parsed.data;
}
