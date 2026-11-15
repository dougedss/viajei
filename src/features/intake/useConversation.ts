import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { ImportEvent } from '@shared/import-protocol.ts';
import { importTripHeaderSchema, validateImport } from '@shared/import-schema.ts';
import { PLAN_FN, planQuestionsSchema } from '@shared/plan-protocol.ts';
import { ImportFailure, streamEvents } from '@/features/import/client.ts';
import { NEW_TRIP_KEY, saveReview } from '@/features/import/draft.ts';
import { newTripReview } from '@/features/import/new-review.ts';
import {
  EMPTY_PREVIEW,
  IDLE,
  previewOf,
  reduceImport,
  type ImportPhase,
  type ImportSession,
  type Preview,
} from '@/features/import/preview.ts';
import { geocode, searchNear } from '@/lib/geocode/nominatim.ts';
import { overpass } from '@/lib/geocode/overpass.ts';
import {
  askRequestOf,
  clearConversation,
  loadConversation,
  planRequestOf,
  saveConversation,
  type Conversation,
} from './conversation.ts';
import { gatherContext } from './gather.ts';
import { radiusFor, reachOf, todayQuestions } from './today.ts';
import { checkPlaces, regionCity, type LatLng } from './verify.ts';

/**
 * A conversa da viagem nova (fase 17), da descrição à revisão. Na conversa, a IA faz as perguntas
 * (até 3, ditas antes); na saída de hoje, o app pergunta o alcance (e a origem, se não sabe). Depois,
 * o roteiro chegando, a conferência no mapa (Overpass uma vez, Nominatim pela fila) e a revisão da
 * fase 10, gravada no aparelho pela chave da viagem nova. A leitura é cancelada ao sair da tela.
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
  /** a IA pensando nas perguntas */
  | { kind: 'asking' }
  | { kind: 'answering' }
  /** o roteiro chegando (o preview da importação) */
  | { kind: 'planning' }
  | { kind: 'checking'; done: number; total: number }
  | { kind: 'error'; phase: ErrorPhase; step: 'ask' | 'plan' };

export function useConversation(uid: string | null, onReview: () => Promise<void>) {
  const queryClient = useQueryClient();
  const [loaded, setLoaded] = useState(false);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [stage, setStage] = useState<ConversationStage>({ kind: 'idle' });
  const [preview, setPreview] = useState<Preview>(EMPTY_PREVIEW);
  const session = useRef<ImportSession>(IDLE);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    let alive = true;
    void loadConversation().then((c) => {
      if (!alive) return;
      setConv(c);
      // de volta à tela: as perguntas continuam; a leitura que estava no meio, não (fica para tocar)
      if (c && c.questions.length > 0) setStage({ kind: 'answering' });
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

  /** Um passo da IA, em SSE: os eventos chegam na sessão, e o `done` volta (ou o erro vai à tela). */
  const stream = async (
    fn: string,
    body: unknown,
    step: 'ask' | 'plan',
  ): Promise<Extract<ImportEvent, { type: 'done' }> | null> => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    session.current = { phase: { kind: 'reading', id: null }, raw: '' };
    setPreview(EMPTY_PREVIEW);
    const box: { done: Extract<ImportEvent, { type: 'done' }> | null } = { done: null };
    const fail = (phase: ErrorPhase) => setStage({ kind: 'error', phase, step });
    try {
      await streamEvents(fn, body, controller.signal, (event) => {
        if (event.type === 'done') {
          box.done = event;
          return;
        }
        session.current = reduceImport(session.current, event);
        if (event.type === 'delta' && step === 'plan') {
          setPreview((prev) => previewOf(session.current.raw) ?? prev);
        }
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

  /** A região da conferência: a posição (ou a origem) na saída de hoje; a cidade das paradas na viagem. */
  const regionOf = async (c: Conversation, data: Parameters<typeof regionCity>[0]) => {
    let center: LatLng | null = c.center;
    if (!center) {
      const city = c.kind === 'plan' ? regionCity(data) : planRequestOf(c).context.origin;
      const hit = city ? (await geocode(city).catch(() => []))[0] : undefined;
      center = hit ? { lat: hit.lat, lng: hit.lng } : null;
    }
    const reach = c.kind === 'today' ? reachOf(c.answers[0] ?? '') : null;
    return { center, radiusKm: radiusFor(c.kind, reach) };
  };

  /** Confere a proposta no mapa e entrega a revisão da viagem nova. */
  const check = async (c: Conversation) => {
    if (!c.proposal) return;
    setStage({ kind: 'checking', done: 0, total: 0 });
    const { data, trip, importId } = c.proposal;
    const region = await regionOf(c, data);
    const result = await checkPlaces(data, region, {
      overpass: (q) => overpass(q),
      search: (q, r) => (r.center ? searchNear(q, r.center, r.radiusKm) : geocode(q)),
      onProgress: (done, total) => setStage({ kind: 'checking', done, total }),
    });
    const stored = await newTripReview(result.data, trip, {
      uid,
      source: 'ai',
      importId,
      partial: false,
      checked: { removed: result.removed, unchecked: result.unchecked },
    });
    await saveReview(NEW_TRIP_KEY, stored);
    await onReview();
    setStage({ kind: 'idle' });
  };

  const plan = async (c: Conversation) => {
    setStage({ kind: 'planning' });
    const done = await stream(PLAN_FN, planRequestOf(c), 'plan');
    if (!done) return;
    try {
      const data = validateImport(done.data);
      const header = importTripHeaderSchema.safeParse(done.trip);
      const next: Conversation = {
        ...c,
        proposal: {
          data,
          trip: header.success
            ? header.data
            : { name: null, start_date: null, end_date: null, origin: null, budget: null },
          importId: session.current.phase.kind === 'arriving' ? session.current.phase.id : null,
        },
      };
      await keep(next);
      await check(next);
    } catch {
      setStage({ kind: 'error', phase: errorPhase('invalid'), step: 'plan' });
    }
  };

  return {
    loaded,
    conv,
    stage,
    preview,
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
        proposal: null,
        started_at: new Date().toISOString(),
      };
      if (kind === 'today') {
        const questions = todayQuestions({
          position: gathered.context.position !== null,
          origin: gathered.context.origin !== null,
        });
        await keep({ ...base, questions, answers: questions.map(() => '') });
        setStage({ kind: 'answering' });
        return;
      }
      setStage({ kind: 'asking' });
      // as perguntas vão para a mesma função, com `step: 'ask'`
      const done = await stream(PLAN_FN, askRequestOf(base), 'ask');
      if (!done) return;
      const parsed = planQuestionsSchema.safeParse(done.data);
      const questions = parsed.success ? parsed.data.questions : [];
      const next = { ...base, questions, answers: questions.map(() => '') };
      await keep(next);
      // nada a perguntar: monta direto
      if (questions.length === 0) await plan(next);
      else setStage({ kind: 'answering' });
    },
    answer: (index: number, value: string) => {
      if (!conv) return;
      const answers = conv.questions.map((_, i) => (i === index ? value : (conv.answers[i] ?? '')));
      void keep({ ...conv, answers });
    },
    plan: () => (conv ? plan(conv) : Promise.resolve()),
    /** O mapa não respondeu: confere de novo a mesma proposta (sem outra leitura). */
    recheck: () => (conv?.proposal ? check(conv) : Promise.resolve()),
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
