import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { LngLat } from '@shared/geo.ts';
import type { ImportEvent } from '@shared/import-protocol.ts';
import { PLAN_FN, planQuestionsSchema, planWriteSchema } from '@shared/plan-protocol.ts';
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
import { geocode, searchNear } from '@/lib/geocode/nominatim.ts';
import { isoToWall } from '@/lib/time/zone.ts';
import { assemble } from './assemble.ts';
import {
  askRequestOf,
  clearConversation,
  loadConversation,
  planRequestOf,
  saveConversation,
  type Conversation,
} from './conversation.ts';
import { findPlaces } from './find-places.ts';
import {
  addNamed,
  addWant,
  nightsNear,
  pickNamed,
  prepare,
  searchMap,
  showMore,
  toggleChoice,
  widen,
  type FlowDeps,
  type MapStage,
} from './flow.ts';
import { gatherContext } from './gather.ts';
import { todayQuestions } from './today.ts';

/**
 * A conversa da viagem nova (fase 17; refeita na fase 24), da vontade à revisão. A IA lê o pedido e
 * pergunta só o que falta para buscar (na saída de hoje, o app pergunta o alcance); o app busca as
 * opções que existem no mapa (a `find-places`, pela Geoapify) e a pessoa escolhe; com as escolhas, o
 * caminho (a `route-day`) e as sugestões no corredor dele; uma leitura só escreve a viagem sobre o
 * que foi escolhido; e a revisão da fase 10 cria a viagem ao salvar. A conversa mora no aparelho:
 * fechar o app nas opções ou na revisão não pergunta nem busca de novo. Sair da tela corta a leitura.
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
  /** lendo o aparelho (a posição, o tempo) */
  | { kind: 'gathering' }
  /** a IA lendo o pedido e pensando no que perguntar */
  | { kind: 'asking' }
  | { kind: 'answering' }
  /** buscando as opções no mapa */
  | { kind: 'searching'; done: number; total: number }
  /** as opções na tela: a pessoa escolhe */
  | { kind: 'choosing' }
  /** o caminho entre as escolhas e o que há nele */
  | { kind: 'routing' }
  /** a IA escrevendo a viagem sobre as escolhas */
  | { kind: 'writing' }
  | { kind: 'error'; phase: ErrorPhase; step: 'ask' | 'plan' };

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

  /** A rede da conversa: a busca por tipo pela função, o Nominatim pela fila, a rota pela função. */
  const deps = (onProgress?: FlowDeps['onProgress']): FlowDeps => ({
    findPlaces,
    geocode: (q) => geocode(q),
    searchNear: (q, center, radiusKm) => searchNear(q, center, radiusKm),
    route: (waypoints: LngLat[]) => requestRoute(waypoints).catch(() => null),
    ...(onProgress ? { onProgress } : {}),
  });

  /** Um passo da IA, em SSE: os eventos chegam na sessão, e o `done` volta (ou o erro vai à tela). */
  const stream = async (
    body: unknown,
    step: 'ask' | 'plan',
  ): Promise<Extract<ImportEvent, { type: 'done' }> | null> => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    session.current = { phase: { kind: 'reading', id: null }, raw: '' };
    const box: { done: Extract<ImportEvent, { type: 'done' }> | null } = { done: null };
    const fail = (phase: ErrorPhase) => setStage({ kind: 'error', phase, step });
    try {
      await streamEvents(PLAN_FN, body, controller.signal, (event) => {
        if (event.type === 'done') {
          box.done = event;
          return;
        }
        session.current = reduceImport(session.current, event);
      });
      if (box.done) return box.done;
      // o stream fechou sem dizer como terminou, ou terminou com um erro dito
      const phase = session.current.phase;
      fail(phase.kind === 'error' ? phase : errorPhase('failed'));
      return null;
    } catch (err) {
      if (err instanceof ImportFailure && err.code === 'canceled') return null;
      fail(err instanceof ImportFailure ? errorPhase(err.code, err.retryAt) : errorPhase('failed'));
      return null;
    } finally {
      if (abort.current === controller) abort.current = null;
      void queryClient.invalidateQueries({ queryKey: ['plan-quota'] });
    }
  };

  /** As opções no mapa, a partir da vontade e das respostas. */
  const search = async (c: Conversation) => {
    setStage({ kind: 'searching', done: 0, total: 1 });
    const map = await searchMap(
      {
        kind: c.kind,
        text: c.text,
        intent: c.intent,
        questions: c.questions,
        answers: c.answers,
        context: c.context,
        center: c.center,
      },
      deps((done, total) => setStage({ kind: 'searching', done, total })),
    );
    await keep({ ...c, map, prepared: null });
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
        plan: { suggestions: built.suggestions, schedule: built.schedule, osm: built.osm },
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

  return {
    loaded,
    conv,
    stage,
    /** Começa: lê o aparelho, e pergunta (a IA, na conversa; o app, na saída de hoje). */
    start: async (kind: 'plan' | 'today', text: string) => {
      if (!uid) return;
      setStage({ kind: 'gathering' });
      const gathered = await gatherContext(kind, uid);
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
      setStage({ kind: 'asking' });
      // as perguntas vão para a mesma função, com `step: 'ask'`; voltam com a vontade
      const done = await stream(askRequestOf(base), 'ask');
      if (!done) return;
      const parsed = planQuestionsSchema.safeParse(done.data);
      const questions = parsed.success ? parsed.data.questions : [];
      const intent = parsed.success ? (parsed.data.intent ?? null) : null;
      const next = { ...base, questions, intent, answers: questions.map(() => '') };
      await keep(next);
      // nada a perguntar: busca direto
      if (questions.length === 0) await search(next);
      else setStage({ kind: 'answering' });
    },
    answer: (index: number, value: string) => {
      if (!conv) return;
      const answers = conv.questions.map((_, i) => (i === index ? value : (conv.answers[i] ?? '')));
      void keep({ ...conv, answers });
    },
    /** As respostas dadas: as opções do mapa. */
    search: () => (conv ? search(conv) : Promise.resolve()),
    toggle: (id: string) => setMap((m) => toggleChoice(m, id)),
    pick: (index: number, pick: number | 'skip') => setMap((m) => pickNamed(m, index, pick)),
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
    /** A busca pelo nome, quando a busca no mapa por tipo não está ligada. */
    byName: async (name: string, kind: Parameters<typeof addNamed>[2]) => {
      if (!conv?.map) return;
      setStage({ kind: 'searching', done: 0, total: 1 });
      const map = await addNamed(conv.map, name, kind, deps());
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
