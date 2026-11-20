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
  lookupOsm,
  NOMINATIM_GAP_MS,
  outlineToMeters,
  pacer,
  pickPhotos,
  searchOsm,
  SourceError,
  sourcesRecord,
  wikidataItem,
  wikidataSearch,
  type CommonsPhoto,
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
 *  1. **identificar**: o objeto do OSM da parada (ou a busca pelo nome perto da coordenada; a cidade
 *     pela UF) → o item do Wikidata (pelas `extratags`, senão pela busca com a coordenada conferida) →
 *     os objetos do OSM ao redor → a IA escolhe **o que modelar** entre eles (o parque é o lugar; a
 *     estufa é a peça), e a planta do objeto modelado; para a cidade de passagem a IA **propõe** o
 *     monumento e a função confere que ele existe no mapa dentro do município e no Wikidata;
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

const modeledOf = (p: OsmPlace) => ({ osm_type: p.osm_type, osm_id: p.osm_id, name: p.name });
const label = (p: OsmPlace) => `${p.name} (${p.category}=${p.type})`;

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
    deps.log(
      `build-landmark job=${job.id} status=failed code=${e.code} retry=${String(e.retry)} attempt=${String(job.attempt)} ms=${String(now() - started)}`,
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

const nominatim = <T>(ctx: StepCtx, run: () => Promise<T>) =>
  ctx.pace('nominatim', NOMINATIM_GAP_MS, run);
const wikimedia = <T>(ctx: StepCtx, run: () => Promise<T>) => ctx.pace('wikimedia', 250, run);

// ------------------------------------------------------------------ 1. identificar
async function identify(ctx: StepCtx): Promise<Identified> {
  const { job, deps } = ctx;
  const input = job.input;
  const inputName = input.name;
  if (!inputName) throw new JobError('no_place');
  if (job.place_kind === 'city') return identifyCity(ctx);

  // o objeto do OSM da parada, ou a busca pelo nome perto da coordenada
  let place: OsmPlace | null = null;
  if (input.osm_type && input.osm_id) {
    const { osm_type, osm_id } = input;
    place = await nominatim(ctx, () => lookupOsm(deps.fetch, osm_type, osm_id));
  }
  const near =
    typeof input.lat === 'number' && typeof input.lng === 'number'
      ? { lat: input.lat, lng: input.lng }
      : null;
  if (!place && near) {
    const found = await nominatim(ctx, () => searchOsm(deps.fetch, inputName, { ...near, km: 3 }));
    place =
      found
        .filter((p) => distanceM(p, near) < 2_000)
        .sort((a, b) => distanceM(a, near) - distanceM(b, near))[0] ?? null;
  }
  if (!place) throw new JobError('no_place');
  const center = { lat: place.lat, lng: place.lng };

  // o item do Wikidata: pelas extratags, senão pela busca com a coordenada conferida (3 km)
  let item: WikidataItem | null = null;
  const placeWikidata = place.wikidata;
  if (placeWikidata) item = await wikimedia(ctx, () => wikidataItem(deps.fetch, placeWikidata));
  if (!item) {
    const hits = await wikimedia(ctx, () => wikidataSearch(deps.fetch, place.name || inputName));
    for (const hit of hits.slice(0, 3)) {
      const cand = await wikimedia(ctx, () => wikidataItem(deps.fetch, hit.id));
      if (cand?.coord && distanceM(cand.coord, center) < 3_000) {
        item = cand;
        break;
      }
    }
  }
  if (!item) throw new JobError('no_wikidata');

  // os objetos do OSM ao redor (a busca pelo nome do item e pelo nome do lugar, na caixa de 2 km) e a
  // escolha do que modelar, pela IA, só entre eles
  const around = new Map<string, OsmPlace>();
  const add = (p: OsmPlace) => around.set(`${p.osm_type}/${String(p.osm_id)}`, p);
  for (const q of new Set(
    [item.label, input.name].filter((v): v is string => !!v && v.length > 2),
  )) {
    ensureTime(ctx, 20_000);
    const found = await nominatim(ctx, () => searchOsm(deps.fetch, q, { ...center, km: 2 }, 8));
    for (const p of found)
      if (
        distanceM(p, center) < 2_500 &&
        !(p.osm_type === place.osm_type && p.osm_id === place.osm_id)
      )
        add(p);
  }
  const candidates: SubjectCandidate[] = [
    {
      index: 0,
      name: place.name || inputName,
      category: place.category,
      type: place.type,
      distance_m: 0,
      wikidata: item.id,
    },
    ...[...around.values()].slice(0, 12).map((p, i) => ({
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
    const pick = candidates[chosen.subject_index];
    if (pick && pick.index > 0) modeled = [...around.values()][pick.index - 1] ?? null;
  }
  const outlineSrc = modeled?.outline ?? (modeled ? null : place.outline);
  return {
    key: `wikidata:${item.id}`,
    name: item.label || place.name || inputName,
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
  const name = job.input.name ?? '';
  const uf = job.input.uf ?? '';
  // o município no mapa (a caixa dele é onde o monumento precisa estar)
  const cities = await nominatim(ctx, () =>
    searchOsm(deps.fetch, `${name}, ${uf}, Brasil`, null, 3),
  );
  const city =
    cities.find(
      (c) =>
        c.category === 'boundary' ||
        c.type === 'city' ||
        c.type === 'town' ||
        c.type === 'municipality',
    ) ?? cities[0];
  if (!city?.bbox) throw new JobError('no_place');
  // a IA propõe; o mapa e o Wikidata conferem
  const proposal = await callAi(ctx, cityParams(ctx.variant, { name, uf }), aiCityLandmarkSchema);
  if (proposal.kind === 'none' || !proposal.name.trim()) throw new JobError('no_subject');
  const [s, n, w, e] = city.bbox;
  const inside = (p: OsmPlace) => p.lat >= s && p.lat <= n && p.lng >= w && p.lng <= e;
  let monument: OsmPlace | null = null;
  for (const q of [proposal.name, proposal.alternative].filter((v) => v.trim())) {
    ensureTime(ctx, 20_000);
    const found = await nominatim(ctx, () => searchOsm(deps.fetch, `${q}, ${name}`, null, 5));
    monument = found.find(inside) ?? null;
    if (monument) break;
  }
  if (!monument) throw new JobError('no_subject');
  const found = monument;
  const foundWikidata = found.wikidata;
  let item: WikidataItem | null = foundWikidata
    ? await wikimedia(ctx, () => wikidataItem(deps.fetch, foundWikidata))
    : null;
  if (!item) {
    const hits = await wikimedia(ctx, () => wikidataSearch(deps.fetch, proposal.name));
    for (const hit of hits.slice(0, 3)) {
      const cand = await wikimedia(ctx, () => wikidataItem(deps.fetch, hit.id));
      if (cand?.coord && distanceM(cand.coord, monument) < 1_500) {
        item = cand;
        break;
      }
    }
  }
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
  const modeled = lm.modeled as {
    osm_type?: 'node' | 'way' | 'relation';
    osm_id?: number;
    name?: string;
  };
  let modeledPlace: OsmPlace | null = null;
  const { osm_type: mType, osm_id: mId } = modeled;
  if (mType && mId) {
    modeledPlace = await nominatim(ctx, () => lookupOsm(deps.fetch, mType, mId)).catch(() => null);
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
