import { z } from 'zod';
import { driveMinutes } from './drive.ts';
import { haversineM } from './geo.ts';
import { googleRequest, ProviderError, searchGoogle, withinCity } from './google-places.ts';
import { isGoogleType } from './google-types.ts';
import { searchGeoapify } from './places-handler.ts';
import {
  googlePlacesRequestSchema,
  placesRequestSchema,
  type GooglePlacesInput,
  type Place,
  type PlacesProvider,
} from './places-schema.ts';
import {
  driveToolSchema,
  locateToolSchema,
  searchToolSchema,
  TOOL_NAMES,
  type SearchToolInput,
} from './plan-search-ai.ts';
import {
  MAX_STEPS,
  PLAN_SEARCH_MAX_SEARCHES,
  PLAN_SEARCH_MAX_TOOL_CALLS,
  type FoundPlace,
  type Outing,
  type PlanSearchEnding,
  type StepRelation,
} from './plan-search-protocol.ts';

/**
 * As ferramentas do planejador (fase 27), executadas pela função, sem Deno e sem rede própria (o
 * `fetch` e as chaves vêm por injeção; o Vitest liga um `fetch` de mentira): `procurar_lugares` (a
 * Text Search do Google, dentro de uma cidade, perto de um ponto ou em círculos ao longo de um caminho;
 * sem o Google, a Geoapify pelas palavras), `localizar_nome` (o lugar nomeado, ou uma cidade, para
 * ter as coordenadas) e `tempo_de_carro` (a estimativa da D228). A IA recebe **só o resumo** de cada
 * lugar (uma referência curta, o nome, a cidade, a nota, o aberto agora, a distância); os lugares
 * inteiros ficam guardados para o app, pela referência: **só vale candidato que voltou daqui nesta
 * rodada**. Os tetos (chamadas e buscas) viram respostas de erro para a IA, nunca um 504.
 */
export type ToolDeps = {
  fetch: typeof fetch;
  googleKey: string | undefined;
  geoapifyKey: string | undefined;
  /** de onde saem (a posição ou a origem resolvida), para a plausibilidade de uma cidade dita */
  reference: { lat: number; lng: number } | null;
};

export type ToolResult = { content: string; is_error: boolean };

/** Uma busca feita (para o passeio de reserva, quando a IA não entrega). */
export type SearchMade = {
  o_que: string;
  relacao: StepRelation;
  cidade: string;
  refs: string[];
  neighbors: boolean;
};

/** Até onde uma cidade dita ainda é plausível a partir de onde a pessoa está (D276). */
const PLAUSIBLE_KM = 400;
/** O círculo em volta do centro de uma cidade: o município costuma caber nisto. */
const CITY_RADIUS_M = 25_000;
/** "Perto" sem raio dito, e o teto do Google. */
const NEAR_DEFAULT_KM = 15;
const NEAR_MAX_KM = 50;
/** "No caminho": círculos ao longo da linha, no máximo quatro por chamada. */
const ROUTE_MAX_CIRCLES = 4;
const ROUTE_CIRCLE_KM = 40;
/** O lugar nomeado: até cinco candidatos, perto do ponto quando há. */
const LOCATE_RADIUS_M = 30_000;
const LOCATE_LIMIT = 5;

const GEOAPIFY_GEOCODE_URL = 'https://api.geoapify.com/v1/geocode/search';
/** As categorias largas da Geoapify para a busca pelas palavras, sem o Google (a fonte de reserva). */
const GEOAPIFY_BROAD = [
  'catering',
  'commercial',
  'tourism',
  'entertainment',
  'leisure',
  'natural',
  'service',
  'accommodation',
];
const STOPWORDS = new Set(
  (
    'a o as os um uma uns umas de da do das dos e em no na nos nas num numa para pra por com ir ' +
    'quero queria vamos ver conhecer visitar passar passear lugar lugares algum alguma bom boa ' +
    'cortar fazer tomar comer almoçar almocar jantar levar minha meu nossa'
  ).split(' '),
);
const plain = (s: string) =>
  s
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

const geocodeSchema = z.object({
  results: z
    .array(
      z
        .object({
          lat: z.number(),
          lon: z.number(),
          city: z.string().optional(),
          name: z.string().optional(),
          formatted: z.string().optional(),
          country_code: z.string().optional(),
          state_code: z.string().optional(),
          result_type: z.string().optional(),
        })
        .loose(),
    )
    .default([]),
});

export type CityHit = { name: string; lat: number; lng: number; label: string };

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  haversineM([a.lng, a.lat], [b.lng, b.lat]) / 1000;
const fmtKm = (v: number) => (v < 10 ? v.toFixed(1).replace('.', ',') : String(Math.round(v)));
const fmtRating = (p: Place) =>
  p.rating === null || p.rating === undefined
    ? null
    : `nota ${p.rating.toFixed(1).replace('.', ',')} (${String(p.user_rating_count ?? 0)} avaliações)`;

/** A relação de um passo pelo "onde" da busca (é o que a fase 26 lê). */
export const relationOf = (tipo: SearchToolInput['onde']['tipo']): StepRelation =>
  tipo === 'cidade' ? 'na_cidade' : tipo === 'no_caminho' ? 'no_caminho' : 'perto_de_casa';

/**
 * O estado de uma rodada: os lugares achados (pela referência), as contagens, a fonte que respondeu,
 * e cada busca feita. Puro fora da rede, que entra pelo `fetch` dos `deps`.
 */
export class ToolState {
  readonly found: FoundPlace[] = [];
  readonly searches: SearchMade[] = [];
  calls = 0;
  requests = 0;
  provider: PlacesProvider | 'none' = 'none';
  /** o Google sem chave ou com a chave recusada: a fonte de reserva respondeu (ou nada) */
  noSource = false;
  readonly #byId = new Map<string, string>();
  readonly #neighbors = new Set<string>();
  readonly #cities = new Map<string, CityHit | null>();
  readonly #deps: ToolDeps;

  constructor(deps: ToolDeps) {
    this.#deps = deps;
  }

  /** O candidato veio dos vizinhos (nenhum dentro da cidade dita)? */
  isNeighbor(ref: string): boolean {
    return this.#neighbors.has(ref);
  }

  placeOf(ref: string): Place | undefined {
    return this.found.find((f) => f.ref === ref)?.place;
  }

  /** Executa uma chamada de ferramenta da IA; o que der errado volta como resposta de erro para ela. */
  async run(name: string, input: unknown): Promise<ToolResult> {
    this.calls += 1;
    if (this.calls > PLAN_SEARCH_MAX_TOOL_CALLS) {
      return {
        is_error: true,
        content: `Teto de ${String(PLAN_SEARCH_MAX_TOOL_CALLS)} chamadas desta rodada atingido: entregue o passeio com o que já tem (entregar_passeio).`,
      };
    }
    try {
      switch (name) {
        case TOOL_NAMES.search:
          return await this.#search(input);
        case TOOL_NAMES.locate:
          return await this.#locate(input);
        case TOOL_NAMES.drive:
          return this.#drive(input);
        default:
          return { is_error: true, content: `Ferramenta desconhecida: ${name.slice(0, 40)}.` };
      }
    } catch (err) {
      return { is_error: true, content: `A ferramenta falhou: ${failureOf(err)}.` };
    }
  }

  // ------------------------------------------------------------------- procurar_lugares
  async #search(raw: unknown): Promise<ToolResult> {
    const parsed = searchToolSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error);
    const input = parsed.data;
    const { onde } = input;
    const made: SearchMade = {
      o_que: input.o_que.trim().slice(0, 80),
      relacao: relationOf(onde.tipo),
      cidade: onde.tipo === 'cidade' ? onde.cidade.trim().slice(0, 120) : '',
      refs: [],
      neighbors: false,
    };
    this.searches.push(made);

    // onde se procura: a cidade resolvida (com a plausibilidade), o ponto, ou os círculos do caminho
    let circles: { lat: number; lng: number; radius_m: number }[];
    let query = input.o_que.trim();
    if (onde.tipo === 'cidade') {
      if (onde.cidade.trim() === '') {
        return { is_error: true, content: 'Para o tipo "cidade", diga a cidade em onde.cidade.' };
      }
      const city = await this.#city(onde.cidade);
      if (!city) {
        return {
          is_error: true,
          content: `Não achei a cidade "${onde.cidade.trim().slice(0, 60)}" perto de onde a pessoa sai (a até ${String(PLAUSIBLE_KM)} km). Não procure em outra cidade por conta própria: ponha uma pergunta ("Para qual cidade vocês vão?") e entregue.`,
        };
      }
      made.cidade = city.name;
      query = `${query} em ${city.name}`;
      circles = [{ lat: city.lat, lng: city.lng, radius_m: CITY_RADIUS_M }];
    } else if (onde.tipo === 'perto') {
      if (!isPoint(onde.lat, onde.lng)) {
        return {
          is_error: true,
          content:
            'Para o tipo "perto", dê lat e lng (o ponto de referência do contexto). Sem ponto de referência no contexto, não procure: ponha a pergunta "De onde vocês saem?" e entregue.',
        };
      }
      const radiusKm = onde.raio_km > 0 ? Math.min(NEAR_MAX_KM, onde.raio_km) : NEAR_DEFAULT_KM;
      circles = [{ lat: onde.lat, lng: onde.lng, radius_m: Math.round(radiusKm * 1000) }];
    } else {
      if (!isPoint(onde.lat, onde.lng) || !isPoint(onde.lat2, onde.lng2)) {
        return {
          is_error: true,
          content:
            'Para o tipo "no_caminho", dê lat/lng do começo e lat2/lng2 do fim (localize a cidade de destino antes com localizar_nome).',
        };
      }
      circles = routeCircles({ lat: onde.lat, lng: onde.lng }, { lat: onde.lat2, lng: onde.lng2 });
    }
    if (this.requests + circles.length > PLAN_SEARCH_MAX_SEARCHES) {
      return {
        is_error: true,
        content: `Teto de ${String(PLAN_SEARCH_MAX_SEARCHES)} buscas desta rodada atingido: entregue o passeio com o que já tem.`,
      };
    }

    const lists: Place[][] = [];
    for (const c of circles) {
      lists.push(
        await this.#places({
          provider: 'google',
          query,
          bias: c,
          type: isGoogleType(input.tipo_google) ? input.tipo_google : null,
          open_now: input.aberto_agora,
          min_rating: Math.min(5, Math.max(0, input.nota_minima)),
          rank: onde.tipo === 'perto' ? 'distance' : 'relevance',
          limit: 20,
        }),
      );
    }
    const merged = mergeById(lists);
    const scoped =
      onde.tipo === 'cidade'
        ? withinCity(merged, made.cidade)
        : { places: merged, neighbors: false };
    made.neighbors = scoped.neighbors && scoped.places.length > 0;
    const center = circles[0] ?? null;
    const refs = scoped.places.map((p) => this.#register(p, made.neighbors));
    made.refs = refs;
    if (refs.length === 0) {
      return {
        is_error: false,
        content: `Nenhum lugar para "${made.o_que}" ${whereText(onde.tipo, made.cidade)}${this.noSource ? ' (fonte de reserva: o OpenStreetMap pela Geoapify, sem o Google)' : ''}. Não repita a mesma busca; tente no máximo uma variação, ou deixe o passo com achou false ou pendente.`,
      };
    }
    const head = made.neighbors
      ? `Nenhum "${made.o_que}" dentro de ${made.cidade}; nos vizinhos há ${String(refs.length)} (a tela vai dizer que são dos vizinhos):`
      : `${String(refs.length)} lugares para "${made.o_que}" ${whereText(onde.tipo, made.cidade)}${this.provider === 'geoapify' ? ' (fonte de reserva: o OpenStreetMap pela Geoapify, sem nota nem aberto agora)' : ''}:`;
    return {
      is_error: false,
      content: [head, ...scoped.places.map((p, i) => this.#line(refs[i] ?? '', p, center))].join(
        '\n',
      ),
    };
  }

  // -------------------------------------------------------------------- localizar_nome
  async #locate(raw: unknown): Promise<ToolResult> {
    const parsed = locateToolSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error);
    const input = parsed.data;
    if (this.requests + 1 > PLAN_SEARCH_MAX_SEARCHES) {
      return {
        is_error: true,
        content: 'Teto de buscas desta rodada atingido: entregue com o que tem.',
      };
    }
    const name = input.nome.trim();
    const city = input.cidade.trim();
    const near = isPoint(input.lat, input.lng)
      ? { lat: input.lat, lng: input.lng, radius_m: LOCATE_RADIUS_M }
      : this.#deps.reference
        ? { ...this.#deps.reference, radius_m: NEAR_MAX_KM * 1000 }
        : null;
    const places = await this.#places({
      provider: 'google',
      query: city ? `${name}, ${city}` : name,
      bias: near,
      type: null,
      open_now: false,
      min_rating: 0,
      rank: 'relevance',
      limit: LOCATE_LIMIT,
    });
    if (places.length === 0) {
      return {
        is_error: false,
        content: `Não achei "${name.slice(0, 60)}" no mapa. Se é um lugar que só a pessoa conhece, deixe pendente com a pergunta de onde fica; se é uma cidade, tente só o nome dela.`,
      };
    }
    const refs = places.map((p) => this.#register(p, false));
    return {
      is_error: false,
      content: [
        `${String(places.length)} candidatos para "${name.slice(0, 60)}" (com as coordenadas, para "no_caminho" e "perto"):`,
        ...places.map(
          (p, i) =>
            `${this.#line(refs[i] ?? '', p, near)} · lat ${p.lat.toFixed(3)}, lng ${p.lng.toFixed(3)}`,
        ),
      ].join('\n'),
    };
  }

  // -------------------------------------------------------------------- tempo_de_carro
  #drive(raw: unknown): ToolResult {
    const parsed = driveToolSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error);
    const d = parsed.data;
    if (!isPoint(d.de_lat, d.de_lng) || !isPoint(d.para_lat, d.para_lng)) {
      return { is_error: true, content: 'Dê os dois pontos com lat e lng.' };
    }
    const dist = km({ lat: d.de_lat, lng: d.de_lng }, { lat: d.para_lat, lng: d.para_lng });
    const minutes = driveMinutes(dist);
    return {
      is_error: false,
      content: `cerca de ${String(minutes)} min de carro (estimativa: ${fmtKm(dist)} km em linha reta, pelas estradas do Sul)`,
    };
  }

  // ------------------------------------------------------------------------- a fonte
  /** A busca no Google e, sem ele (sem chave, chave recusada), a Geoapify pelas palavras. */
  async #places(request: GooglePlacesInput): Promise<Place[]> {
    const { googleKey, geoapifyKey, fetch } = this.#deps;
    this.requests += 1;
    if (googleKey && !this.noSource) {
      try {
        const places = await searchGoogle(
          { fetch },
          googleKey,
          googlePlacesRequestSchema.parse(request),
        );
        this.provider = 'google';
        return places;
      } catch (err) {
        if (!(err instanceof ProviderError) || err.code !== 'no_source') throw err;
        this.noSource = true;
      }
    } else if (!googleKey) {
      this.noSource = true;
    }
    if (!geoapifyKey) return [];
    const bias = request.bias;
    if (!bias) return [];
    const words = plain(request.query.replace(/\bem\b.*$/, ''))
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
      .slice(0, 1);
    const places = await searchGeoapify(
      { fetch },
      geoapifyKey,
      placesRequestSchema.parse({
        categories: GEOAPIFY_BROAD,
        names: words,
        area: {
          type: 'circle',
          lng: bias.lng,
          lat: bias.lat,
          radius_m: Math.min(400_000, Math.max(100, bias.radius_m)),
        },
        near: { lng: bias.lng, lat: bias.lat },
        limit: request.limit,
      }),
    );
    this.provider = 'geoapify';
    return places;
  }

  /**
   * A cidade dita, resolvida uma vez por rodada: a geocodificação da Geoapify (`type=city`, com o
   * viés de onde a pessoa sai) e a plausibilidade da D276 (a até 400 km da referência); sem a Geoapify,
   * a Text Search do Google pelo nome da cidade, só com os campos Essentials e Pro.
   */
  async #city(said: string): Promise<CityHit | null> {
    const key = plain(said);
    const cached = this.#cities.get(key);
    if (cached !== undefined) return cached;
    // a Geoapify responde (com uma cidade plausível ou nenhuma); só sem ela é que o Google entra
    const byGeoapify = await this.#cityByGeoapify(said);
    const hit = byGeoapify === 'unavailable' ? await this.#cityByGoogle(said) : byGeoapify;
    this.#cities.set(key, hit);
    return hit;
  }

  async #cityByGeoapify(said: string): Promise<CityHit | null | 'unavailable'> {
    const { geoapifyKey, fetch, reference } = this.#deps;
    if (!geoapifyKey) return 'unavailable';
    const url = new URL(GEOAPIFY_GEOCODE_URL);
    url.searchParams.set('text', said.trim());
    url.searchParams.set('type', 'city');
    url.searchParams.set('limit', '5');
    url.searchParams.set('lang', 'pt');
    url.searchParams.set('format', 'json');
    if (reference)
      url.searchParams.set('bias', `proximity:${String(reference.lng)},${String(reference.lat)}`);
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: { 'x-api-key': geoapifyKey, accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return 'unavailable';
    }
    if (!res.ok) return 'unavailable';
    const parsed = geocodeSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) return 'unavailable';
    const hits = parsed.data.results.map((r) => ({
      name: (r.city ?? r.name ?? r.formatted ?? said).trim().slice(0, 120),
      lat: r.lat,
      lng: r.lon,
      label: (r.formatted ?? '').slice(0, 200),
      br: (r.country_code ?? '').toLowerCase() === 'br',
    }));
    return pickCity(hits, reference);
  }

  async #cityByGoogle(said: string): Promise<CityHit | null> {
    const { googleKey, fetch, reference } = this.#deps;
    if (!googleKey || this.noSource) return null;
    if (this.requests + 1 > PLAN_SEARCH_MAX_SEARCHES) return null;
    this.requests += 1;
    const input = googlePlacesRequestSchema.parse({
      provider: 'google',
      query: said.trim(),
      bias: reference ? { ...reference, radius_m: NEAR_MAX_KM * 1000 } : null,
      type: 'locality',
      limit: 5,
    });
    // só os campos Essentials e Pro: uma cidade não precisa da nota nem do horário
    const { url, init } = googleRequest(input, googleKey);
    const headers = {
      ...(init.headers as Record<string, string>),
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.location,places.formattedAddress,places.addressComponents,places.types',
    };
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(10_000) });
    } catch {
      return null;
    }
    if (res.status === 401 || res.status === 403) {
      this.noSource = true;
      return null;
    }
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { places?: unknown[] } | null;
    const places = (json?.places ?? [])
      .map((p) => {
        const g = p as {
          displayName?: { text?: string };
          location?: { latitude?: number; longitude?: number };
          formattedAddress?: string;
        };
        return g.location &&
          typeof g.location.latitude === 'number' &&
          typeof g.location.longitude === 'number'
          ? {
              name: (g.displayName?.text ?? said).trim().slice(0, 120),
              lat: g.location.latitude,
              lng: g.location.longitude,
              label: (g.formattedAddress ?? '').slice(0, 200),
              br: /brasil|brazil/i.test(g.formattedAddress ?? ''),
            }
          : null;
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
    return pickCity(places, reference);
  }

  #register(place: Place, neighbor: boolean): string {
    const known = this.#byId.get(place.id);
    if (known) return known;
    const ref = `p${String(this.found.length + 1)}`;
    this.found.push({ ref, place });
    this.#byId.set(place.id, ref);
    if (neighbor) this.#neighbors.add(ref);
    return ref;
  }

  /** Um lugar numa linha para a IA: a referência, o nome, a cidade, a nota, o aberto agora, a distância. */
  #line(ref: string, p: Place, center: { lat: number; lng: number } | null): string {
    const parts = [
      ref,
      p.name,
      p.city,
      fmtRating(p),
      p.open_now === true ? 'aberto agora' : p.open_now === false ? 'fechado agora' : null,
      p.business_status === 'closed_permanently'
        ? 'fechado de vez'
        : p.business_status === 'closed_temporarily'
          ? 'fechado por um tempo'
          : null,
      center ? `${fmtKm(km(center, p))} km do centro da busca` : null,
    ];
    return parts.filter((x): x is string => typeof x === 'string' && x !== '').join(' · ');
  }
}

// ------------------------------------------------------------------------ as contas
const isPoint = (lat: number, lng: number) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  !(lat === 0 && lng === 0) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180;

/** Os círculos ao longo da linha reta entre dois pontos: até quatro, de uns 40 km cada. */
export function routeCircles(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): { lat: number; lng: number; radius_m: number }[] {
  const dist = km(from, to);
  const n = Math.max(1, Math.min(ROUTE_MAX_CIRCLES, Math.ceil(dist / ROUTE_CIRCLE_KM)));
  const radiusKm = Math.min(NEAR_MAX_KM, dist / n / 2 + 10);
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 0.5) / n;
    return {
      lat: from.lat + (to.lat - from.lat) * t,
      lng: from.lng + (to.lng - from.lng) * t,
      radius_m: Math.round(radiusKm * 1000),
    };
  });
}

/**
 * A cidade que vale (D276, D282): com referência, a mais perto a até 400 km; sem referência, a primeira
 * do Brasil (senão a primeira). Nenhuma plausível: nulo, e a IA pergunta.
 */
export function pickCity(
  hits: readonly (CityHit & { br: boolean })[],
  reference: { lat: number; lng: number } | null,
): CityHit | null {
  const first = hits[0];
  if (!first) return null;
  const strip = ({ name, lat, lng, label }: CityHit) => ({ name, lat, lng, label });
  if (!reference) return strip(hits.find((h) => h.br) ?? first);
  const near = hits
    .map((h) => ({ h, d: km(reference, h) }))
    .filter((x) => x.d <= PLAUSIBLE_KM)
    .sort((a, b) => a.d - b.d);
  return near[0] ? strip(near[0].h) : null;
}

function mergeById(lists: readonly (readonly Place[])[]): Place[] {
  const byId = new Map<string, Place>();
  for (const list of lists) for (const p of list) if (!byId.has(p.id)) byId.set(p.id, p);
  return [...byId.values()];
}

const whereText = (tipo: SearchToolInput['onde']['tipo'], cidade: string) =>
  tipo === 'cidade' ? `em ${cidade}` : tipo === 'perto' ? 'perto do ponto' : 'no caminho';

function invalid(error: z.ZodError): ToolResult {
  const path = error.issues[0]?.path.join('.') ?? '';
  return {
    is_error: true,
    content: `Entrada fora do formato${path ? ` em ${path}` : ''}: confira os campos (todos são obrigatórios; use 0 ou "" no que não se aplica).`,
  };
}

/** Só a classe do erro, nunca a mensagem inteira (pode levar a chave ou um trecho do pedido). */
function failureOf(err: unknown): string {
  if (err instanceof ProviderError) return err.code;
  return err instanceof Error ? err.name : 'erro';
}

/**
 * O passeio de reserva, quando a IA não entregou (o teto, o prazo, só texto): cada busca feita vira um
 * passo com os candidatos que ela achou; sem busca nenhuma, uma pergunta. Nada some, nunca um erro.
 */
export function outingFromSearches(state: ToolState, ending: PlanSearchEnding): Outing {
  const passos = state.searches.slice(0, MAX_STEPS).map((s, i) => ({
    ordem: i + 1,
    o_que: s.o_que,
    relacao: s.relacao,
    cidade: s.cidade,
    hora_do_dia: '' as const,
    candidatos: s.refs.slice(0, 12),
    achou: s.refs.length > 0,
    fora_da_cidade: s.neighbors,
  }));
  return {
    passos,
    pendentes: [],
    perguntas:
      passos.length === 0
        ? [
            {
              text:
                ending === 'no_plan'
                  ? 'Não consegui montar o passeio. O que vocês querem fazer primeiro?'
                  : 'Não deu para terminar a busca. O que vocês querem fazer primeiro?',
              options: [],
              topic: 'other' as const,
            },
          ]
        : [],
    destino: '',
    origem: '',
  };
}
