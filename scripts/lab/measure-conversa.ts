import { appendFile } from 'node:fs/promises';
import { haversineM, viewboxAround, type LngLat } from '../../supabase/functions/_shared/geo.ts';
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
  type PlanQuestion,
  type PlanRequest,
  type PlanWrite,
} from '../../supabase/functions/_shared/plan-protocol.ts';
import { routeResponseSchema } from '../../supabase/functions/_shared/route-schema.ts';
import {
  prepare,
  searchMap,
  toggleChoice,
  type FlowDeps,
  type MapStage,
  type Prepared,
  type SearchInput,
} from '../../src/features/intake/flow.ts';
import { placeKey } from '../../src/features/intake/locate.ts';
import type { SearchResult } from '../../src/features/intake/named.ts';
import { plain } from '../../src/features/intake/places.ts';
import { reachQuestion } from '../../src/features/intake/reach.ts';
import { radiusForHours } from '../../src/features/intake/search.ts';
import type { LabConfig } from './env.ts';
import { costUsd, timedImport, type TimedImport } from './import-lab.ts';
import { log, sleep, type Session } from './session.ts';

/**
 * A medição da conversa (fase 24; a da fase 17 refeita; os pedidos de leigo na fase 25): poucas
 * leituras reais, contadas, pelas funções publicadas e como o lab-a, pelo mesmo caminho do app
 * (`intake/flow.ts`): a IA lê a vontade e pergunta, o mapa de verdade dá as opções (a `find-places`,
 * pela Geoapify), a primeira opção de cada vontade é a escolha, a rota e o corredor dão as sugestões,
 * e uma leitura escreve a viagem sobre isso. Sete textos fixos, sem nada da pessoa: a conversa da
 * serra, **"um café colonial em Pomerode, saindo de Papanduva"** (o defeito de 15/11), uma saída de
 * hoje em Canela, e **os quatro pedidos de leigo da fase 25** (decisão 7 de 20/11: a prova é com
 * pedidos de leigo): "almoçar em mafra" (a Mafra de SC, nada fora do Brasil), "vou pra joinville"
 * (idem), o pedido de 20/11 respondendo "1:30 no maximo" (o raio de 1,5 h; sem "3 horas" nas
 * opções) e o de Canoinhas (a feirinha e o salão pendentes, e a escrita sem falar deles). Sai uma
 * tabela com números, custos e os nomes dos lugares públicos achados; sai 1 quando uma cobrança
 * falhou.
 */
const CANELA = { lat: -29.37, lng: -50.81 };
const PAPANDUVA = { lat: -26.37, lng: -50.144 };
const MAJOR_VIEIRA = { lat: -26.37, lng: -50.33 };
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
    geocode: (q, bias) => {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q', q);
      // o viés (fase 25, D276): a área preferida em volta de onde se sai, sem `bounded`
      if (bias) url.searchParams.set('viewbox', viewboxAround(bias.near, bias.radiusKm));
      return nominatim(url);
    },
    searchNear: (q, center, radiusKm) => {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q', q);
      url.searchParams.set('viewbox', viewboxAround(center, radiusKm));
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

/** A resposta a cada pergunta: a primeira opção, ou "tanto faz" (o de antes), salvo o que o pedido mandar. */
const firstOption = (q: PlanQuestion) => q.options[0] ?? 'tanto faz';

/** O Brasil, grosso modo, pela coordenada: o que a cobrança "nenhuma opção fora do Brasil" usa. */
const inBrazil = (p: { lat: number; lng: number }) =>
  p.lat >= -34 && p.lat <= 6 && p.lng >= -74.5 && p.lng <= -34;

/** O que a medição cobra de uma conversa: o mapa, o caminho e o que a IA escreveu. */
type Check = (got: {
  map: MapStage;
  prepared: Prepared;
  questions: readonly PlanQuestion[];
  write: PlanWrite | null;
}) => string[];

export async function measureConversa(cfg: LabConfig, a: Session): Promise<number> {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(),
  );
  const rows: Row[] = [];
  const calls: { places: number; noSource: boolean } = { places: 0, noSource: false };
  const noSource = () => calls.noSource;
  const deps = labDeps(cfg, a, calls);
  /** o que faltou nas conversas que cobram */
  const missing: string[] = [];

  /** Uma conversa inteira: as perguntas (se houver), as opções, o caminho e a escrita. */
  const conversa = async (
    label: string,
    input: Omit<SearchInput, 'intent' | 'questions' | 'answers'>,
    opts: { answer?: (q: PlanQuestion) => string; check?: Check } = {},
  ) => {
    let intent = null;
    let questions: PlanQuestion[];
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
      // a resposta por pergunta (fase 25): o que o pedido mandar, senão a primeira opção
      answers = questions.map((q) => (opts.answer ?? firstOption)(q));
      rows.push({
        label: `${label} · perguntas`,
        run: asked,
        detail: `${String(questions.length)} perguntas (${questions.map((q) => `${q.topic ?? '?'}: ${q.options.join(' / ')}`).join('; ')}); respostas: ${answers.join(' / ')}; vontades: ${intent && intent.wants.length > 0 ? intent.wants.map((w) => w.words).join(', ') : 'nenhuma'}; área: ${intent?.area ?? '—'}; origem: ${intent?.origin ?? '—'}`,
      });
    } else {
      questions = [reachQuestion('09:00')];
      answers = ['O dia'];
    }
    log(`medição: ${label}, as opções do mapa`);
    const t0 = Date.now();
    const search: SearchInput = { ...input, intent, questions, answers };
    let map = await searchMap(search, deps);
    // a pergunta da cidade (D276) sem tela: a medição escolhe o candidato mais perto, e diz
    let askedCity = '';
    if (map.ask) {
      const pick = map.ask.options[0];
      askedCity = `a cidade "${map.ask.said}" pediu escolha (${map.ask.far ? 'só longe' : 'mais de uma'}): ${pick ? `${pick.address} · ${s(Date.now() - t0)}` : 'sem candidato'}; `;
      if (pick)
        map = await searchMap({ ...search, places: { [placeKey(map.ask.said)]: pick } }, deps);
    }
    const opcoes = map.groups.flatMap((g) => g.options.map((o) => o.place.name));
    const status =
      map.groups.map((g) => g.status).join(',') || (map.nowhere ? 'sem onde procurar' : '—');
    const chosen = chooseFirst(map);
    const where = map.groups
      .map((g) => `${g.label}: ${g.centerLabel ?? '—'} a ${String(g.radiusKm)} km`)
      .join('; ');
    if (chosen.chosen.length === 0 && !map.named.some((n) => n.state.kind === 'found')) {
      rows.push({
        label: `${label} · opções`,
        run: null,
        detail: `${askedCity}busca ${status} em ${s(Date.now() - t0)} (${where}): nenhuma opção; a escrita não roda`,
      });
      return;
    }
    const prepared = await prepare(
      chosen,
      { interests: ['nature', 'wineries'], learned: [] },
      deps,
    );
    const sugestoes = prepared.suggestions.map((x) => x.place.name);
    const pendentes = prepared.missing.map((m) => m.name);
    rows.push({
      label: `${label} · opções`,
      run: null,
      detail: `${askedCity}saindo de ${map.origin?.label ?? '—'}; ${where}; ${String(opcoes.length)} opções (${opcoes.slice(0, 6).join('; ')}); ${String(sugestoes.length)} sugestões (${sugestoes.join('; ')}); pendentes: ${pendentes.length > 0 ? pendentes.join(', ') : 'nenhum'}; rota ${prepared.routed ? 'real' : 'reta'}; ${s(Date.now() - t0)}`,
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
    let written: PlanWrite | null = null;
    if (wrote.outcome === 'done') {
      const parsed = planWriteSchema.safeParse(wrote.data);
      written = parsed.success ? parsed.data : null;
      detail = parsed.success
        ? `"${parsed.data.trip.name ?? ''}"; ${String(parsed.data.days.length)} dias (${parsed.data.days.map((d) => d.title ?? '').join('; ')}); ${String(parsed.data.days.flatMap((d) => d.stops).length)} escolhas nos dias; ${String(parsed.data.suggestions.length)} frases de sugestão; antes de viajar: ${parsed.data.checklist_before.join(' / ')}`
        : 'fora do schema';
    }
    const problems = opts.check?.({ map, prepared, questions, write: written }) ?? [];
    missing.push(...problems.map((x) => `${label}: ${x}`));
    rows.push({
      label: `${label} · escrita`,
      run: wrote,
      detail: `${detail}${problems.length > 0 ? `; FALTOU: ${problems.join(', ')}` : ''}`,
    });
  };

  // ------------------------------------------------------------- as três conversas de antes
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
    {
      check: ({ map, prepared }) => {
        const opcoes = map.groups.flatMap((g) => g.options.map((o) => o.place.name));
        const sugestoes = prepared.suggestions.map((x) => x.place.name);
        return [
          has(opcoes, 'Torten Paradies') ? null : 'Torten Paradies nas opções',
          has(opcoes, 'Mahlzeit') ? null : 'Mahlzeit nas opções',
          has(sugestoes, 'Zoo Pomerode') ? null : 'Bioparque Zoo Pomerode nas sugestões',
        ].filter((x): x is string => x !== null);
      },
    },
  );
  await conversa('saída de hoje', {
    kind: 'today',
    text: 'quero sair hoje',
    context: { origin: null, position: CANELA, place: 'Canela, RS' },
    center: CANELA,
  });

  // ------------------------------------------------ os pedidos de leigo (fase 25, decisão 7 de 20/11)
  /** todos os centros de busca a até 400 km de onde se sai, e nenhuma opção fora do Brasil */
  const perto = ({ map }: { map: MapStage }): string[] => {
    const from = map.origin?.at;
    const out: string[] = [];
    if (!from) out.push('sem origem resolvida');
    for (const g of map.groups) {
      const km = from ? haversineM(from, g.center) / 1000 : 0;
      if (km > 400) out.push(`${g.label} buscado a ${String(Math.round(km))} km de onde se sai`);
      for (const o of g.options) {
        if (!inBrazil(o.place)) out.push(`${o.place.name} fora do Brasil`);
      }
    }
    return out;
  };
  await conversa(
    'mafra',
    {
      kind: 'plan',
      text: 'amanha quero almoçar em mafra e depois ir numa cachoeira',
      context: { origin: 'Papanduva/SC', position: null, place: null },
      center: PAPANDUVA,
    },
    {
      check: (got) =>
        [
          ...perto(got),
          ...got.map.groups.map((g) =>
            plain(g.centerLabel ?? '').includes('mafra')
              ? null
              : `${g.label} sem "Mafra" no centro`,
          ),
        ].filter((x): x is string => x !== null),
    },
  );
  await conversa(
    'joinville',
    {
      kind: 'plan',
      text: 'vou pra joinville sabado, queria parar pra tomar um cafe no caminho',
      context: { origin: 'Papanduva/SC', position: null, place: null },
      center: PAPANDUVA,
    },
    // o "no caminho" é da fase 26: aqui só se cobra que nada saiu do alcance nem do Brasil
    { check: perto },
  );
  await conversa(
    'cachoeira 1:30',
    {
      kind: 'plan',
      text: 'gostaria de amanha visitar uma cachoeira e passar em cafe e voltar para casa',
      context: { origin: 'Papanduva/SC', position: null, place: null },
      center: PAPANDUVA,
    },
    {
      // o pedido de 20/11 do Douglas, respondendo "1:30 no maximo" ao tempo
      answer: (q) => (q.topic === 'reach' ? '1:30 no maximo' : firstOption(q)),
      check: ({ map, questions }) => {
        const reach = questions.find((q) => q.topic === 'reach');
        const expected = radiusForHours(1.5);
        return [
          ...map.groups.map((g) =>
            g.radiusKm === expected
              ? null
              : `${g.label} buscado a ${String(g.radiusKm)} km, não a ${String(expected)} (1,5 h)`,
          ),
          reach ? null : 'a IA não perguntou o tempo (a vontade sem área pede)',
          reach?.options.some((o) => /3 ?h|tr[eê]s horas/i.test(o))
            ? 'a IA ofereceu "3 horas" a quem volta para casa no mesmo dia'
            : null,
        ].filter((x): x is string => x !== null);
      },
    },
  );
  await conversa(
    'canoinhas',
    {
      kind: 'plan',
      text: 'iria na feirinha, tomar um cafe e levar a minha mulher cortar o cabelo, tudo isso em canoinhas sc',
      // a pessoa estava em Major Vieira (21/11): a posição como ponto de referência
      context: { origin: 'Major Vieira, SC', position: MAJOR_VIEIRA, place: 'Major Vieira, SC' },
      center: MAJOR_VIEIRA,
    },
    {
      check: ({ prepared, write }) => {
        const pending = prepared.missing.map((m) => plain(m.name));
        const fala = /feirinha|cabelo|sal[aã]o/i;
        return [
          pending.some((n) => n.includes('feirinha')) ? null : 'a feirinha não ficou pendente',
          pending.some((n) => /cabelo|salao/.test(n)) ? null : 'o salão não ficou pendente',
          write === null ? 'a escrita não voltou no schema' : null,
          ...(write
            ? [
                fala.test(write.trip.name ?? '')
                  ? `o nome da viagem fala do que não entrou: "${write.trip.name ?? ''}"`
                  : null,
                ...write.days.map((d) =>
                  fala.test(d.title ?? '')
                    ? `o título do dia fala do que não entrou: "${d.title ?? ''}"`
                    : null,
                ),
                ...write.days.flatMap((d) =>
                  d.stops.map((st) =>
                    fala.test(st.note ?? '')
                      ? `a nota fala do que não entrou: "${st.note ?? ''}"`
                      : null,
                  ),
                ),
                ...write.quests.map((q) =>
                  fala.test(q.text) ? `a missão fala do que não entrou: "${q.text}"` : null,
                ),
                ...write.checklist_pack.map((t) =>
                  fala.test(t) ? `a mala fala do que não entrou: "${t}"` : null,
                ),
                // a lista "antes de viajar" pode ajudar a resolver o pendente ("Escolher onde fica a feirinha"), nada mais
                ...write.checklist_before.map((t) =>
                  fala.test(t) &&
                  !/escolher|marcar|onde fica|confirmar onde|achar onde|localizar/i.test(t)
                    ? `a lista trata o pendente como parte do roteiro: "${t}"`
                    : null,
                ),
              ]
            : []),
        ].filter((x): x is string => x !== null);
      },
    },
  );

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
