import { appendFile } from 'node:fs/promises';
import type { LngLat } from '../../supabase/functions/_shared/geo.ts';
import {
  placesErrorSchema,
  placesResponseSchema,
  PLACES_FN,
  type Place,
  type PlacesRequest,
} from '../../supabase/functions/_shared/places-schema.ts';
import {
  PLAN_FN,
  planQuestionsSchema,
  planWriteSchema,
  type PlanContext,
  type PlanRequest,
} from '../../supabase/functions/_shared/plan-protocol.ts';
import { routeResponseSchema } from '../../supabase/functions/_shared/route-schema.ts';
import {
  prepare,
  searchMap,
  toggleChoice,
  type FlowDeps,
  type MapStage,
  type SearchInput,
} from '../../src/features/intake/flow.ts';
import type { SearchResult } from '../../src/features/intake/named.ts';
import { plain } from '../../src/features/intake/places.ts';
import type { LabConfig } from './env.ts';
import { costUsd, timedImport, type TimedImport } from './import-lab.ts';
import { log, sleep, type Session } from './session.ts';

/**
 * A medição da conversa (fase 24; a da fase 17 refeita): poucas leituras reais, contadas, pelas
 * funções publicadas e como o lab-a, pelo mesmo caminho do app (`intake/flow.ts`): a IA lê a vontade
 * e pergunta, o mapa de verdade dá as opções (a `find-places`, pela Geoapify), a primeira opção de
 * cada vontade é a escolha, a rota e o corredor dão as sugestões, e uma leitura escreve a viagem
 * sobre isso. Três textos fixos, sem nada da pessoa: a conversa da serra (a de antes), **"um café
 * colonial em Pomerode, saindo de Papanduva"** (o defeito de 15/11: as opções têm de ter o Torten
 * Paradies e o Mahlzeit, e as sugestões o Bioparque Zoo Pomerode) e uma saída de hoje em Canela. Sai
 * uma tabela com números, custos e os nomes dos lugares públicos achados.
 */
const CANELA = { lat: -29.37, lng: -50.81 };
const UA = 'viajei-laboratorio/1.0 (medicao)';

const s = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`);

function context(today: string, over: Partial<PlanContext> = {}): PlanContext {
  return {
    today,
    now: '09:00',
    origin: 'Papanduva/SC',
    position: null,
    place: null,
    interests: ['nature', 'wineries'],
    learned: [{ kind: 'nature', count: 2 }],
    history: [{ name: 'Cascata do Caracol', kind: 'nature', rating: 5, days_ago: 40 }],
    weather: null,
    reach: null,
    ...over,
  };
}

/** A rede da medição: as funções publicadas como o lab-a, e o Nominatim identificado, um por vez. */
function labDeps(
  cfg: Pick<LabConfig, 'url' | 'publishableKey'>,
  a: Session,
  calls: { places: number; noSource: boolean },
): FlowDeps {
  const call = async (fn: string, body: unknown): Promise<Response> => {
    const token = (await a.client.auth.getSession()).data.session?.access_token ?? '';
    return fetch(`${cfg.url}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: cfg.publishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  };
  let last = 0;
  const nominatim = async (url: URL): Promise<SearchResult[]> => {
    const wait = last + 1_100 - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '5');
    url.searchParams.set('accept-language', 'pt-BR');
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Nominatim ${String(res.status)}`);
    const rows = (await res.json()) as {
      name?: string;
      display_name?: string;
      lat: string;
      lon: string;
      category?: string;
      type?: string;
    }[];
    return rows.map((r) => ({
      name: r.name && r.name !== '' ? r.name : ((r.display_name ?? '').split(',')[0] ?? ''),
      address: r.display_name ?? '',
      lat: Number(r.lat),
      lng: Number(r.lon),
      ...(r.category ? { category: r.category } : {}),
      ...(r.type ? { type: r.type } : {}),
    }));
  };
  return {
    findPlaces: async (request: PlacesRequest): Promise<Place[]> => {
      calls.places += 1;
      const res = await call(PLACES_FN, request);
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const err = placesErrorSchema.safeParse(json);
        const code = err.success ? err.data.error.code : 'internal';
        if (code === 'no_source') calls.noSource = true;
        throw Object.assign(new Error(code), { code });
      }
      return placesResponseSchema.parse(json).places;
    },
    geocode: (q) => {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q', q);
      return nominatim(url);
    },
    searchNear: (q, center, radiusKm) => {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      const dLat = radiusKm / 111;
      const dLng = radiusKm / (111 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)));
      url.searchParams.set('q', q);
      url.searchParams.set(
        'viewbox',
        [center.lng - dLng, center.lat + dLat, center.lng + dLng, center.lat - dLat]
          .map((n) => n.toFixed(4))
          .join(','),
      );
      url.searchParams.set('bounded', '1');
      return nominatim(url);
    },
    route: async (waypoints: LngLat[]) => {
      const res = await call('route-day', { waypoints });
      if (!res.ok) return null;
      const parsed = routeResponseSchema.safeParse(await res.json().catch(() => null));
      return parsed.success ? parsed.data : null;
    },
  };
}

type Row = { label: string; run: TimedImport | null; detail: string };

/** A primeira opção de cada vontade, como uma pessoa que toca na mais perto. */
function chooseFirst(map: MapStage): MapStage {
  return map.groups.reduce(
    (m, g) => (g.options[0] ? toggleChoice(m, g.options[0].place.id) : m),
    map,
  );
}

const has = (names: readonly string[], want: string) =>
  names.some((n) => plain(n).includes(plain(want)));

export async function measureConversa(cfg: LabConfig, a: Session): Promise<number> {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(),
  );
  const rows: Row[] = [];
  const calls: { places: number; noSource: boolean } = { places: 0, noSource: false };
  const noSource = () => calls.noSource;
  const deps = labDeps(cfg, a, calls);
  /** o que faltou nas conversas que cobram (o café colonial em Pomerode) */
  const missing: string[] = [];

  /** Uma conversa inteira: as perguntas (se houver), as opções, o caminho e a escrita. */
  const conversa = async (
    label: string,
    input: Omit<SearchInput, 'intent' | 'questions' | 'answers'>,
    check?: (opcoes: string[], sugestoes: string[]) => string[],
  ) => {
    let intent = null;
    let questions: PlanRequest['questions'];
    let answers: string[];
    if (input.kind === 'plan') {
      log(`medição: ${label}, as perguntas`);
      const ask: PlanRequest = {
        step: 'ask',
        kind: 'plan',
        text: input.text,
        context: { ...context(today), ...input.context },
      };
      const asked = await timedImport(cfg, a, ask, PLAN_FN);
      const parsed = planQuestionsSchema.safeParse(asked.data);
      questions = parsed.success ? parsed.data.questions : [];
      intent = parsed.success ? (parsed.data.intent ?? null) : null;
      // a primeira opção de cada pergunta, ou uma resposta livre curta
      answers = questions.map((q) => q.options[0] ?? 'tanto faz');
      rows.push({
        label: `${label} · perguntas`,
        run: asked,
        detail: `${String(questions.length)} perguntas; vontades: ${intent && intent.wants.length > 0 ? intent.wants.map((w) => w.words).join(', ') : 'nenhuma'}; área: ${intent?.area ?? '—'}`,
      });
    } else {
      questions = [
        { text: 'Quanto tempo vocês têm?', options: ['A manhã', 'O dia', 'Até amanhã'] },
      ];
      answers = ['O dia'];
    }
    log(`medição: ${label}, as opções do mapa`);
    const t0 = Date.now();
    const map = await searchMap({ ...input, intent, questions, answers }, deps);
    const opcoes = map.groups.flatMap((g) => g.options.map((o) => o.place.name));
    const status =
      map.groups.map((g) => g.status).join(',') || (map.nowhere ? 'sem onde procurar' : '—');
    const chosen = chooseFirst(map);
    if (chosen.chosen.length === 0 && !map.named.some((n) => n.state.kind === 'found')) {
      rows.push({
        label: `${label} · opções`,
        run: null,
        detail: `busca ${status} em ${s(Date.now() - t0)}: nenhuma opção; a escrita não roda`,
      });
      return;
    }
    const prepared = await prepare(
      chosen,
      { interests: ['nature', 'wineries'], learned: [] },
      deps,
    );
    const sugestoes = prepared.suggestions.map((x) => x.place.name);
    const problems = check?.(opcoes, sugestoes) ?? [];
    missing.push(...problems);
    rows.push({
      label: `${label} · opções`,
      run: null,
      detail: `${String(opcoes.length)} opções (${opcoes.slice(0, 6).join('; ')}); ${String(sugestoes.length)} sugestões (${sugestoes.join('; ')}); rota ${prepared.routed ? 'real' : 'reta'}; ${s(Date.now() - t0)}${problems.length > 0 ? `; FALTOU: ${problems.join(', ')}` : ''}`,
    });
    log(`medição: ${label}, a escrita`);
    const write: PlanRequest = {
      step: 'plan',
      kind: input.kind,
      text: input.text,
      questions,
      answers,
      context: {
        ...context(
          today,
          input.kind === 'today' ? { reach: 'day', position: CANELA, place: 'Canela, RS' } : {},
        ),
        ...input.context,
      },
      places: prepared.places,
    };
    const wrote = await timedImport(cfg, a, write, PLAN_FN);
    let detail: string = wrote.outcome;
    if (wrote.outcome === 'done') {
      const parsed = planWriteSchema.safeParse(wrote.data);
      detail = parsed.success
        ? `${String(parsed.data.days.length)} dias; ${String(parsed.data.days.flatMap((d) => d.stops).length)} escolhas nos dias; ${String(parsed.data.suggestions.length)} frases de sugestão`
        : 'fora do schema';
    }
    rows.push({ label: `${label} · escrita`, run: wrote, detail });
  };

  await conversa('serra', {
    kind: 'plan',
    text: 'Serra Gaúcha em dezembro, 4 dias, saindo de Papanduva',
    context: { origin: 'Papanduva/SC', position: null, place: null },
    center: null,
  });
  await conversa(
    'café colonial',
    {
      kind: 'plan',
      text: 'um café colonial em Pomerode, saindo de Papanduva',
      context: { origin: null, position: null, place: null },
      center: null,
    },
    (opcoes, sugestoes) =>
      [
        has(opcoes, 'Torten Paradies') ? null : 'Torten Paradies nas opções',
        has(opcoes, 'Mahlzeit') ? null : 'Mahlzeit nas opções',
        has(sugestoes, 'Zoo Pomerode') ? null : 'Bioparque Zoo Pomerode nas sugestões',
      ].filter((x): x is string => x !== null),
  );
  await conversa('saída de hoje', {
    kind: 'today',
    text: 'quero sair hoje',
    context: { origin: null, position: CANELA, place: 'Canela, RS' },
    center: CANELA,
  });

  const head =
    '| passo | resultado | 1º caractere | fim | entrada | saída | US$ | o que veio |\n|---|---|---|---|---|---|---|---|';
  const body = rows.map(({ label, run, detail: d }) => {
    const cost = run?.usage && run.model ? costUsd(run.model, run.usage) : null;
    return `| ${[
      label,
      run === null
        ? 'mapa'
        : run.outcome === 'done'
          ? `ok · ${run.model ?? ''}`
          : `${run.outcome} ${run.code ?? ''}`,
      run ? s(run.first_char_ms) : '—',
      run ? s(run.end_ms) : '—',
      run?.usage?.input_tokens ?? '—',
      run?.usage?.output_tokens ?? '—',
      cost === null ? '—' : cost.toFixed(4),
      d.replaceAll('|', '/'),
    ].join(' | ')} |`;
  });
  const total = rows.reduce((n, r) => {
    const c = r.run?.usage && r.run.model ? costUsd(r.run.model, r.run.usage) : null;
    return n + (c ?? 0);
  }, 0);
  const readings = rows.filter((r) => r.run !== null).length;
  const report = `## Medição da conversa\n\n${[head, ...body].join('\n')}\n\nTotal: US$ ${total.toFixed(4)} em ${String(readings)} leituras; ${String(calls.places)} buscas no mapa (find-places)${noSource() ? ', **sem fonte (no_source): a chave da Geoapify ainda não existe**' : ''}.\n`;
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
  const broken = rows.some((r) => r.run && (r.run.outcome === 'http' || r.run.outcome === 'cut'));
  return broken || (missing.length > 0 && !noSource()) ? 1 : 0;
}
