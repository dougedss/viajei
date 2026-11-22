import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { LngLat } from '@shared/geo.ts';
import type { ImportEvent } from '@shared/import-protocol.ts';
import { PLAN_FN, planWriteSchema } from '@shared/plan-protocol.ts';
import { MAX_QUESTIONS } from '@shared/plan-protocol.ts';
import { ImportFailure, streamEvents } from '@/features/import/client.ts';
import { NEW_TRIP_KEY, saveReview } from '@/features/import/draft.ts';
import { newTripReview } from '@/features/import/new-review.ts';
import {
  IDLE,
  reduceImport,
  type ImportPhase,
  type ImportSession,
} from '@/features/import/preview.ts';
import { requestRoute } from '@/features/itinerary/route.ts';
import { geocodePlace, searchNear } from '@/lib/geocode/nominatim.ts';
import { filled } from '@/lib/text/filled.ts';
import { isoToWall } from '@/lib/time/zone.ts';
import { assemble } from './assemble.ts';
import {
  clearConversation,
  loadConversation,
  originLabelOf,
  planRequestOf,
  saveConversation,
  type Conversation,
} from './conversation.ts';
import { findPlaces } from './find-places.ts';
import {
  addNamed,
  addWant,
  answersByTopic,
  nightsNear,
  pickNamed,
  prepare,
  questionsAfter,
  removeWant,
  showMore,
  stageFromOuting,
  toggleChoice,
  widen,
  type FlowDeps,
  type MapStage,
  type NamedEntry,
} from './flow.ts';
import { declineGeo, grantGeo, readGeoConsent } from '@/features/travel-mode/queries.ts';
import { gatherContext } from './gather.ts';
import { placeKey, resolvePlace, type PlaceHit, type PlaceQuestion } from './locate.ts';
import { planSearchRequestOf, streamPlanSearch } from './plan-search.ts';
import { unreadReach } from './reach.ts';
import { MAX_RADIUS_KM } from './search.ts';
import { todayQuestions } from './today.ts';

/**
 * A conversa da viagem nova (fase 17; refeita na fase 24; o planejador na fase 27), do pedido à
 * revisão. **A IA planeja a busca com ferramentas e o app julga** (`plan-search`): a função procura
 * o que a pessoa pediu onde ela pediu (o Google atrás da função), devolve os lugares que achou e o
 * passeio em passos, e o app monta os grupos só com as referências que existem; pergunta só na
 * dúvida (a cidade, o que fazer). Na saída de hoje, o app pergunta o alcance antes, sem IA. A pessoa
 * escolhe; com as escolhas, o caminho (a `route-day`) e as sugestões no corredor dele (a Geoapify);
 * uma leitura só escreve a viagem sobre o que foi escolhido (a `plan-trip`); e a revisão da fase 10
 * cria a viagem ao salvar. A conversa mora no aparelho: fechar o app nas opções ou na revisão não
 * pergunta nem busca de novo. Sair da tela corta a leitura.
 */
type ErrorPhase = Extract<ImportPhase, { kind: 'error' }>;
const errorPhase = (code: ErrorPhase['code'], retryAt: string | null = null): ErrorPhase => ({
  kind: 'error',
  code,
  reason: null,
  category: null,
  retryAt,
});

export type ConversationStage =
  | { kind: 'idle' }
  /** a pergunta de posição (fase 25, D271): uma vez por aparelho, antes de ler o aparelho */
  | { kind: 'consent' }
  /** lendo o aparelho (a posição, o tempo) */
  | { kind: 'gathering' }
  /** a IA lendo o pedido (a conversa de antes; o planejador procura em `searching`) */
  | { kind: 'asking' }
  | { kind: 'answering' }
  /** o planejador procurando no mapa (o andamento em `note`) */
  | { kind: 'searching'; done: number; total: number; note?: string | null }
  /** as opções na tela: a pessoa escolhe */
  | { kind: 'choosing' }
  /** o caminho entre as escolhas e o que há nele */
  | { kind: 'routing' }
  /** a IA escrevendo a viagem sobre as escolhas */
  | { kind: 'writing' }
  | { kind: 'error'; phase: ErrorPhase; step: 'ask' | 'search' | 'plan' };

/** A hora de sair numa saída de hoje: daqui a uns 15 min, no quarto de hora seguinte. */
function soon(now: Date): string {
  const { time } = isoToWall(now.toISOString());
  const [h = 0, m = 0] = time.split(':').map(Number);
  const min = Math.ceil((h * 60 + m + 15) / 15) * 15;
  const c = Math.min(min, 23 * 60 + 45);
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`;
}
const plusDay = (date: string) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export function useConversation(uid: string | null, onReview: () => Promise<void>) {
  const queryClient = useQueryClient();
  const [loaded, setLoaded] = useState(false);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [stage, setStage] = useState<ConversationStage>({ kind: 'idle' });
  const session = useRef<ImportSession>(IDLE);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  /** a conversa que espera a resposta à pergunta de posição (fase 25) */
  const pendingStart = useRef<{ kind: 'plan' | 'today'; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void loadConversation().then((c) => {
      if (!alive) return;
      setConv(c);
      // de volta à tela: as opções e as perguntas continuam; a leitura que estava no meio, não
      if (c?.map) setStage({ kind: 'choosing' });
      else if (c && c.questions.length > 0) setStage({ kind: 'answering' });
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  // sair da tela cancela a leitura (o StrictMode desmonta e remonta na hora: só se não voltou)
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (!mounted.current) abort.current?.abort();
      }, 0);
    };
  }, []);

  const keep = async (next: Conversation) => {
    setConv(next);
    await saveConversation(next);
  };

  /** A rede da conversa: a busca pela função, o Nominatim pela fila, a rota pela função. */
  const deps = (onProgress?: FlowDeps['onProgress']): FlowDeps => ({
    findPlaces,
    geocode: (q, bias) => geocodePlace(q, bias ?? null),
    searchNear: (q, center, radiusKm) => searchNear(q, center, radiusKm),
    route: (waypoints: LngLat[]) => requestRoute(waypoints).catch(() => null),
    ...(onProgress ? { onProgress } : {}),
  });

  /** Um pedido que pode ser cancelado: o anterior sai, e o novo fica como o corrente. */
  const controller = () => {
    abort.current?.abort();
    const next = new AbortController();
    abort.current = next;
    return next;
  };
  const release = (c: AbortController) => {
    if (abort.current === c) abort.current = null;
  };
  const fail = (err: unknown, step: 'ask' | 'search' | 'plan'): boolean => {
    if (err instanceof ImportFailure && err.code === 'canceled') return false;
    setStage({
      kind: 'error',
      phase:
        err instanceof ImportFailure ? errorPhase(err.code, err.retryAt) : errorPhase('failed'),
      step,
    });
    return true;
  };

  /** A leitura que escreve, em SSE: os eventos chegam na sessão, e o `done` volta (ou o erro vai à tela). */
  const stream = async (
    body: unknown,
    step: 'plan',
  ): Promise<Extract<ImportEvent, { type: 'done' }> | null> => {
    const c = controller();
    session.current = { phase: { kind: 'reading', id: null }, raw: '' };
    const box: { done: Extract<ImportEvent, { type: 'done' }> | null } = { done: null };
    try {
      await streamEvents(PLAN_FN, body, c.signal, (event) => {
        if (event.type === 'done') {
          box.done = event;
          return;
        }
        session.current = reduceImport(session.current, event);
      });
      if (box.done) return box.done;
      // o stream fechou sem dizer como terminou, ou terminou com um erro dito
      const phase = session.current.phase;
      setStage({
        kind: 'error',
        phase: phase.kind === 'error' ? phase : errorPhase('failed'),
        step,
      });
      return null;
    } catch (err) {
      fail(err, step);
      return null;
    } finally {
      release(c);
      void queryClient.invalidateQueries({ queryKey: ['plan-quota'] });
    }
  };

  /**
   * De onde saem, como lugar (fase 25, D271 e D276): o que a pessoa escreveu (no "mudar", na resposta
   * ou, pelo planejador, no pedido) geocodificado com o viés da posição e conferido pela plausibilidade;
   * senão a posição; senão a origem de antes já resolvida (o `center`). Na dúvida, a pergunta da cidade.
   */
  const originOf = async (
    c: Conversation,
    said: string | null,
  ): Promise<{ origin: MapStage['origin']; ask: PlaceQuestion | null }> => {
    const d = deps();
    const reference: LngLat | null = c.context.position
      ? [c.context.position.lng, c.context.position.lat]
      : c.center
        ? [c.center.lng, c.center.lat]
        : null;
    if (said) {
      const picked = c.places?.[placeKey(said)];
      const renamed = c.renamed?.[placeKey(said)];
      const query = picked ? null : (renamed ?? said);
      if (picked) return { origin: { label: said, at: [picked.lng, picked.lat] }, ask: null };
      const results = await d
        .geocode(
          query ?? said,
          reference
            ? { near: { lat: reference[1], lng: reference[0] }, radiusKm: MAX_RADIUS_KM }
            : undefined,
        )
        .catch(() => null);
      if (results) {
        const resolved = resolvePlace(results, reference);
        if (resolved.kind === 'found') {
          return {
            origin: { label: renamed ?? said, at: [resolved.hit.lng, resolved.hit.lat] },
            ask: null,
          };
        }
        return {
          origin: null,
          ask: {
            said,
            role: 'origin',
            options: resolved.kind === 'unknown' ? [] : resolved.options,
            kind: resolved.kind,
          },
        };
      }
    }
    const label = originLabelOf({ ...c, map: null });
    return { origin: label && reference ? { label, at: reference } : null, ask: null };
  };

  /**
   * O planejador (fase 27): uma rodada da `plan-search` com o pedido, as respostas e o contexto; o
   * app julga o que voltou e monta os grupos. Na primeira rodada, as perguntas da IA (a cidade, o que
   * fazer) vão para a tela e a busca espera; respondidas, a segunda rodada entrega.
   */
  const search = async (c: Conversation) => {
    // a resposta de alcance que não foi entendida volta como pergunta (fase 25, D274), nunca um raio
    // padrão em silêncio; a conversa guarda a tentativa (na segunda, só as opções)
    const unread = unreadReach(c.questions, c.answers);
    if (unread !== null) {
      const misread = { ...(c.misread ?? {}), [unread]: (c.misread?.[unread] ?? 0) + 1 };
      await keep({ ...c, misread });
      setStage({ kind: 'answering' });
      return;
    }
    setStage({ kind: 'searching', done: 0, total: 1, note: null });
    // de onde saem, antes de tudo: o "mudar", a resposta de origem; a dúvida pergunta antes da busca
    const said =
      filled(c.origin_override) ?? filled(answersByTopic(c.questions, c.answers).origin) ?? null;
    const first = await originOf(c, said);
    if (first.ask) {
      await keep({
        ...c,
        map: { origin: null, groups: [], named: [], chosen: [], nowhere: false, ask: first.ask },
        prepared: null,
      });
      setStage({ kind: 'choosing' });
      return;
    }
    const withOrigin: Conversation = first.origin
      ? { ...c, center: { lat: first.origin.at[1], lng: first.origin.at[0] } }
      : c;
    const ctrl = controller();
    let result;
    try {
      result = await streamPlanSearch(planSearchRequestOf(withOrigin), ctrl.signal, (note) =>
        setStage({ kind: 'searching', done: 0, total: 1, note }),
      );
    } catch (err) {
      fail(err, 'search');
      return;
    } finally {
      release(ctrl);
      void queryClient.invalidateQueries({ queryKey: ['plan-quota'] });
    }
    const planned: Conversation = {
      ...withOrigin,
      plan: result.passeio,
      found: result.lugares,
      intent: null,
    };
    // a primeira rodada pode perguntar (a cidade, o que fazer): a tela das perguntas, dentro do teto
    if (result.passeio.perguntas.length > 0 && !c.plan) {
      const questions = questionsAfter(c.questions, result.passeio, MAX_QUESTIONS);
      if (questions.length > c.questions.length) {
        await keep({
          ...planned,
          questions,
          answers: questions.map((_, i) => c.answers[i] ?? ''),
          map: null,
          prepared: null,
        });
        setStage({ kind: 'answering' });
        return;
      }
    }
    // a origem que o pedido disse diferente do contexto ("saindo de Papanduva"): o lugar dela
    const origin =
      result.passeio.origem && result.passeio.origem !== said
        ? await originOf(planned, result.passeio.origem)
        : first;
    if (origin.ask) {
      await keep({
        ...planned,
        map: { origin: null, groups: [], named: [], chosen: [], nowhere: false, ask: origin.ask },
        prepared: null,
      });
      setStage({ kind: 'choosing' });
      return;
    }
    const reference: LngLat | null = planned.center
      ? [planned.center.lng, planned.center.lat]
      : null;
    const { stage: map, dropped } = stageFromOuting(result, origin.origin, reference);
    if (dropped > 0) console.info(`[conversa] ${String(dropped)} referência(s) da IA sem lugar`);
    await keep({ ...planned, map, prepared: null });
    setStage({ kind: 'choosing' });
  };

  const setMap = (change: (m: MapStage) => MapStage) => {
    if (!conv?.map) return;
    void keep({ ...conv, map: change(conv.map), prepared: null });
  };

  /** A viagem escrita sobre as escolhas: a leitura só, com o caminho que já se traçou. */
  const write = async (c: Conversation) => {
    const prepared = c.prepared;
    const map = c.map;
    if (!prepared || !map) return;
    setStage({ kind: 'writing' });
    const done = await stream(planRequestOf(c, prepared.places), 'plan');
    if (!done) return;
    const parsed = planWriteSchema.safeParse(done.data);
    if (!parsed.success) {
      setStage({ kind: 'error', phase: errorPhase('invalid'), step: 'plan' });
      return;
    }
    const today = c.kind === 'today';
    // onde dormir: numa viagem de mais de um dia, as hospedagens perto do destino, como sugestão
    const nights =
      parsed.data.days.length > 1 ? await nightsNear(prepared.destination, deps()) : [];
    const built = assemble({
      origin: map.origin,
      chosen: prepared.picks,
      chosenFractions: prepared.chosenFractions,
      suggestions: prepared.suggestions,
      nights,
      legs: prepared.legs,
      missing: prepared.missing,
      write: parsed.data,
      firstDate: today ? c.context.today : plusDay(c.context.today),
      defaultStart: today ? soon(new Date()) : '08:00',
    });
    const stored = await newTripReview(
      built.data,
      { ...built.trip, budget: null },
      {
        uid,
        source: 'ai',
        importId: session.current.phase.kind === 'arriving' ? session.current.phase.id : null,
        partial: false,
        checked: { removed: [], unchecked: [], missing: prepared.missing.map((n) => n.name) },
        plan: {
          suggestions: built.suggestions,
          schedule: built.schedule,
          osm: built.osm,
          pending: built.pending,
          google: built.google,
          hours: built.hours,
        },
      },
    );
    await saveReview(NEW_TRIP_KEY, stored);
    await onReview();
    setStage({ kind: 'idle' });
  };

  /** Da escolha ao caminho (a rota e as sugestões), e então a leitura que escreve. */
  const build = async (c: Conversation) => {
    if (!c.map) return;
    setStage({ kind: 'routing' });
    const prepared = await prepare(
      c.map,
      { interests: c.context.interests, learned: c.context.learned },
      deps(),
    );
    const next = { ...c, prepared };
    await keep(next);
    await write(next);
  };

  /**
   * Lê o aparelho e segue: na saída de hoje, o app pergunta o alcance (sem IA); na conversa, o
   * planejador procura (e pergunta só na dúvida). `prompt`: a pessoa acabou de tocar em "Usar
   * posição", e o navegador pode perguntar agora (fase 25, D271).
   */
  const begin = async (kind: 'plan' | 'today', text: string, prompt: boolean) => {
    if (!uid) return;
    setStage({ kind: 'gathering' });
    const gathered = await gatherContext(kind, uid, { prompt });
    const base: Conversation = {
      kind,
      text,
      context: gathered.context,
      center: gathered.center,
      questions: [],
      answers: [],
      intent: null,
      map: null,
      prepared: null,
      plan: null,
      started_at: new Date().toISOString(),
    };
    if (kind === 'today') {
      const questions = todayQuestions(
        {
          position: gathered.context.position !== null,
          origin: gathered.context.origin !== null,
        },
        gathered.context.now,
      );
      await keep({ ...base, questions, answers: questions.map(() => '') });
      setStage({ kind: 'answering' });
      return;
    }
    await keep(base);
    await search(base);
  };

  /** A resposta à pergunta de posição: a mesma do mapa (D48), guardada por aparelho; depois, a conversa. */
  const resume = async (allow: boolean) => {
    const p = pendingStart.current;
    pendingStart.current = null;
    await (allow ? grantGeo() : declineGeo());
    if (p) await begin(p.kind, p.text, allow);
  };

  return {
    loaded,
    conv,
    stage,
    /**
     * Começa: com o consentimento de posição ainda não dado neste aparelho (nem recusado nas últimas
     * 24 h), a pergunta de posição vem antes (fase 25, D271); senão, lê o aparelho e segue.
     */
    start: async (kind: 'plan' | 'today', text: string) => {
      if (!uid) return;
      setStage({ kind: 'gathering' });
      if ((await readGeoConsent()) === 'unasked') {
        pendingStart.current = { kind, text };
        setStage({ kind: 'consent' });
        return;
      }
      await begin(kind, text, false);
    },
    allowPosition: () => resume(true),
    declinePosition: () => resume(false),
    /** "mudar" em "Saindo de X": a origem escrita vale acima de tudo; nas opções, busca de novo. */
    setOrigin: async (origin: string) => {
      if (!conv) return;
      const next: Conversation = {
        ...conv,
        origin_override: origin.trim() || null,
        map: null,
        prepared: null,
      };
      if (conv.map) await search(next);
      else await keep(next);
    },
    /** A cidade escolhida na pergunta da cidade (D276): guardada pela chave do dito; a busca roda então. */
    choosePlace: async (said: string, hit: PlaceHit) => {
      if (!conv) return;
      await search({ ...conv, places: { ...(conv.places ?? {}), [placeKey(said)]: hit } });
    },
    /**
     * A cidade escrita no lugar do que foi dito (D283: "Serra Gaúcha" não é cidade no mapa; "Outra
     * cidade" na escolha), ou '' para seguir sem ela; a busca roda então.
     */
    renamePlace: async (said: string, city: string) => {
      if (!conv) return;
      await search({
        ...conv,
        renamed: { ...(conv.renamed ?? {}), [placeKey(said)]: city.trim() },
      });
    },
    answer: (index: number, value: string) => {
      if (!conv) return;
      const answers = conv.questions.map((_, i) => (i === index ? value : (conv.answers[i] ?? '')));
      void keep({ ...conv, answers });
    },
    /** As respostas dadas: o planejador procura. */
    search: () => (conv ? search(conv) : Promise.resolve()),
    toggle: (id: string) => setMap((m) => toggleChoice(m, id)),
    pick: (index: number, pick: NamedEntry['pick']) => setMap((m) => pickNamed(m, index, pick)),
    /** "Tirar da viagem" uma vontade sem opção, e o desfazer (fase 25, D278). */
    remove: (group: number, removed: boolean) => setMap((m) => removeWant(m, group, removed)),
    more: (group: number) => setMap((m) => showMore(m, group)),
    /** "Procurar mais longe": a mesma busca com o dobro do raio. */
    wider: async (group: number) => {
      if (!conv?.map) return;
      setStage({ kind: 'searching', done: 0, total: 1 });
      const map = await widen(conv.map, group, deps());
      await keep({ ...conv, map, prepared: null });
      setStage({ kind: 'choosing' });
    },
    /** O nomeado que o mapa não achou vira a busca do tipo dele. */
    byType: async (namedIndex: number) => {
      if (!conv?.map) return;
      setStage({ kind: 'searching', done: 0, total: 1 });
      const map = await addWant(conv.map, namedIndex, deps());
      await keep({ ...conv, map, prepared: null });
      setStage({ kind: 'choosing' });
    },
    /** A busca pelo nome, quando a busca no mapa não achou (ou não está ligada). */
    byName: async (name: string, kind: Parameters<typeof addNamed>[2], group?: number) => {
      if (!conv?.map) return;
      setStage({ kind: 'searching', done: 0, total: 1 });
      const map = await addNamed(conv.map, name, kind, deps(), group);
      await keep({ ...conv, map, prepared: null });
      setStage({ kind: 'choosing' });
    },
    /** As escolhas feitas: o caminho, as sugestões e a viagem escrita. */
    build: () => (conv ? build(conv) : Promise.resolve()),
    /** A leitura falhou: escreve de novo sobre o mesmo caminho (sem buscar nem traçar de novo). */
    retry: () => {
      if (!conv) return Promise.resolve();
      if (conv.prepared) return write(conv);
      if (conv.map) return build(conv);
      return search(conv);
    },
    /** Da revisão de volta às opções (a viagem sem lugar, ou "buscar pelo tipo"). */
    toOptions: async () => {
      if (!conv?.map) return;
      await keep({ ...conv, prepared: null });
      setStage({ kind: 'choosing' });
    },
    cancel: () => abort.current?.abort(),
    /** Volta ao começo: a conversa sai do aparelho (o texto continua no rascunho do campo). */
    clear: async () => {
      abort.current?.abort();
      setConv(null);
      setStage({ kind: 'idle' });
      await clearConversation();
    },
  };
}

export type ConversationState = ReturnType<typeof useConversation>;
