import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { IMPORT_DAILY_LIMIT, IMPORT_FN, IMPORT_MAX_CHARS } from '@shared/import-protocol.ts';
import type { ImportEvent } from '@shared/import-protocol.ts';
import type { ImportData, ImportTripHeader } from '@shared/import-schema.ts';
import { todayISO } from '@/features/trips/rules.ts';
import { useOnline } from '@/lib/db/connectivity.ts';
import type { Trip } from '@/lib/db/schema.ts';
import { supabase } from '@/lib/supabase/client.ts';
import { ImportFailure, streamImport } from './client.ts';
import {
  clearImport,
  clearReview,
  loadDraft,
  loadReview,
  NEW_TRIP_KEY,
  saveDraft,
  saveReview,
  type StoredReview,
} from './draft.ts';
import { looksLikeViajei, readViajei, type FormatError } from './format.ts';
import { applyGeo } from './geocode.ts';
import { newTripReview } from './new-review.ts';
import { reviewOf, type ImportPlan, type Review } from './plan.ts';
import {
  EMPTY_PREVIEW,
  failWith,
  IDLE,
  partialImportWithTrip,
  previewOf,
  reduceImport,
  type ImportSession,
  type Preview,
} from './preview.ts';
import { readExisting, saveImport, saveNewTrip } from './save.ts';

export type ImportTrip = Pick<Trip, 'id' | 'name' | 'start_date' | 'end_date' | 'origin'>;
/**
 * O que a importação alimenta: uma viagem que existe (`/viagens/:id/importar`), ou a viagem nova do
 * campo da lista (`/viagens/nova`, fase 17), que só nasce ao salvar a revisão.
 */
export type ImportTarget = { kind: 'trip'; trip: ImportTrip } | { kind: 'new' };

type View = { session: ImportSession; preview: Preview };
const IDLE_VIEW: View = { session: IDLE, preview: EMPTY_PREVIEW };

/** Leituras que ainda cabem nas 24 h (a `edge_call` conta; a pessoa lê só as próprias). */
function useImportQuota(enabled: boolean) {
  return useQuery({
    queryKey: ['import-quota'],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const { count, error } = await supabase
        .from('edge_calls')
        .select('id', { count: 'exact', head: true })
        .eq('fn', IMPORT_FN)
        .gt('created_at', since);
      if (error) throw error;
      return Math.max(0, IMPORT_DAILY_LIMIT - (count ?? 0));
    },
  });
}

/** O que o "Salvar" fez: a viagem (a nova, ou a mesma), o plano gravado e, na nova, as datas dela. */
export type SaveResult = {
  tripId: string;
  plan: ImportPlan;
  range: { start_date: string; end_date: string } | null;
};

/**
 * A importação, do texto colado à revisão salva. O rascunho e a revisão moram no aparelho
 * (`draft.ts`), pela viagem ou pela chave da viagem nova. O formato do Viajei é lido aqui, sem rede e
 * sem IA; o resto é um stream da função, e o preview é refeito do JSON acumulado no máximo uma vez por
 * quadro. Nada é salvo sem `save`, que passa pela outbox (e, na viagem nova, cria a viagem junto).
 */
export function useImport(target: ImportTarget | null, uid: string | null) {
  const trip = target?.kind === 'trip' ? target.trip : null;
  const key = target === null ? null : (trip?.id ?? NEW_TRIP_KEY);
  const online = useOnline();
  const queryClient = useQueryClient();
  const [loaded, setLoaded] = useState(false);
  const [text, setTextState] = useState('');
  const [view, setView] = useState<View>(IDLE_VIEW);
  const [stored, setStored] = useState<StoredReview | null>(null);
  /** o texto parece o formato do Viajei, e uma linha não deu para ler: as linhas e o porquê */
  const [formatErrors, setFormatErrors] = useState<FormatError[] | null>(null);
  const quota = useImportQuota(online && loaded && stored === null);

  // a sessão viva fica num ref: os eventos chegam fora do render, e o render lê o espelho em `view`
  const live = useRef<ImportSession>(IDLE);
  const pending = useRef('');
  const frame = useRef<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const latestText = useRef('');
  /** o registro da leitura em andamento (o `start`), que a revisão guarda */
  const importId = useRef<string | null>(null);

  // o rascunho e a revisão guardados, ao abrir
  useEffect(() => {
    if (!key) return;
    let alive = true;
    void Promise.all([loadDraft(key), loadReview(key)]).then(([draft, review]) => {
      if (!alive) return;
      latestText.current = draft;
      setTextState(draft);
      setStored(review);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  // o texto vai para o aparelho numa pausa da digitação, e ao sair da tela
  useEffect(() => {
    if (!key || !loaded) return;
    const t = setTimeout(() => void saveDraft(key, text), 300);
    return () => clearTimeout(t);
  }, [key, loaded, text]);
  // sair da tela cancela a leitura. O StrictMode do desenvolvimento desmonta e remonta na hora (a
  // leitura que a tela da viagem nova começa sozinha seria cortada): só cancela se não voltou
  const mounted = useRef(false);
  useEffect(() => {
    if (!key) return;
    mounted.current = true;
    return () => {
      mounted.current = false;
      void saveDraft(key, latestText.current);
      setTimeout(() => {
        if (mounted.current) return;
        abort.current?.abort();
        if (frame.current !== null) cancelAnimationFrame(frame.current);
      }, 0);
    };
  }, [key]);

  const publish = (next: ImportSession) => {
    live.current = next;
    setView((prev) => ({ session: next, preview: previewOf(next.raw) ?? prev.preview }));
  };

  const flush = () => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    if (pending.current === '') return;
    const textChunk = pending.current;
    pending.current = '';
    publish(reduceImport(live.current, { type: 'delta', text: textChunk }));
  };

  const keep = async (next: StoredReview) => {
    setStored(next);
    if (key) await saveReview(key, next);
  };

  /**
   * A revisão nasce do que foi lido. Na viagem que existe, marcada contra o que ela já tem; na nova,
   * com o cabeçalho do texto e as propostas para o que faltar (a última origem da pessoa, as datas
   * pelos dias), contra uma viagem vazia com essas datas.
   */
  const startReview = async (
    data: ImportData,
    id: string | null,
    partial: boolean,
    source: 'ai' | 'user',
    header: ImportTripHeader | null,
  ) => {
    const saved_at = new Date().toISOString();
    if (trip) {
      const review = reviewOf(data, await readExisting(trip));
      await keep({ review, importId: id, partial, saved_at, newTrip: null, source });
      return;
    }
    if (!key) return;
    await keep(await newTripReview(data, header, { uid, source, importId: id, partial }));
  };

  const onEvent = (event: ImportEvent) => {
    if (event.type === 'delta') {
      pending.current += event.text;
      frame.current ??= requestAnimationFrame(() => {
        frame.current = null;
        flush();
      });
      return;
    }
    flush();
    if (event.type === 'start') importId.current = event.id;
    const next = reduceImport(live.current, event);
    publish(next);
    if (next.phase.kind === 'review') {
      void startReview(next.phase.data, next.phase.id, false, 'ai', next.phase.trip);
    }
  };

  /**
   * Lê o texto. O formato do Viajei (ou o JSON do schema) é lido aqui mesmo, na hora e sem rede; com
   * `{ ai: true }`, ou com outro texto, vai para a IA. Devolve se a revisão ficou pronta (o formato
   * lido sem erro): a leitura da IA termina depois, pelos eventos.
   */
  const read = async (options: { ai?: boolean } = {}): Promise<boolean> => {
    if (!key || text.trim() === '') return false;
    setFormatErrors(null);
    if (!options.ai && looksLikeViajei(text)) {
      const result = readViajei(text, todayISO());
      if (!result.ok) {
        setFormatErrors(result.errors);
        return false;
      }
      await startReview(result.doc.data, null, false, 'user', result.doc.trip);
      return true;
    }
    if (text.length > IMPORT_MAX_CHARS) return false;
    if (!online) {
      publish(failWith(IDLE, 'offline'));
      return false;
    }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    pending.current = '';
    importId.current = null;
    publish({ phase: { kind: 'reading', id: null }, raw: '' });
    try {
      await streamImport(
        {
          trip_id: trip?.id ?? null,
          text,
          trip: trip
            ? {
                name: trip.name,
                start_date: trip.start_date,
                end_date: trip.end_date,
                origin: trip.origin,
              }
            : null,
        },
        controller.signal,
        onEvent,
      );
      flush();
      // o stream fechou sem dizer como terminou: a conexão caiu no fim
      const kind = live.current.phase.kind;
      if (kind === 'reading' || kind === 'arriving') publish(failWith(live.current, 'failed'));
    } catch (err) {
      flush();
      if (err instanceof ImportFailure && err.code === 'canceled') publish(IDLE);
      else
        publish(
          failWith(
            live.current,
            err instanceof ImportFailure ? err.code : 'failed',
            null,
            err instanceof ImportFailure ? err.retryAt : null,
          ),
        );
    } finally {
      if (abort.current === controller) abort.current = null;
      void queryClient.invalidateQueries({ queryKey: ['import-quota'] });
    }
    return false;
  };

  const reset = () => {
    latestText.current = '';
    setTextState('');
    setStored(null);
    publish(IDLE);
  };

  return {
    loaded,
    online,
    text,
    setText: (value: string) => {
      latestText.current = value;
      setTextState(value);
      setFormatErrors(null);
    },
    /** o texto já no aparelho, antes de sair da tela (o campo da lista, antes de abrir `/viagens/nova`) */
    flushDraft: async () => {
      if (key) await saveDraft(key, latestText.current);
    },
    session: view.session,
    preview: view.preview,
    remaining: quota.data ?? null,
    stored,
    formatErrors,
    read,
    /** a pessoa desistiu: o pedido é abortado, a função aborta a IA e registra `canceled` */
    cancel: () => abort.current?.abort(),
    /** volta ao texto, sem a mensagem de erro */
    dismiss: () => {
      setFormatErrors(null);
      publish(IDLE);
    },
    /** o que chegou antes de um corte, como revisão (só os itens que chegaram inteiros) */
    reviewPartial: async () => {
      const partial = partialImportWithTrip(live.current.raw);
      if (partial) await startReview(partial.data, importId.current, true, 'ai', partial.trip);
    },
    edit: (change: (review: Review) => Review) => {
      if (!stored) return;
      void keep({ ...stored, review: change(stored.review) });
    },
    /** uma mudança na revisão inteira (o cabeçalho da viagem nova muda as datas dos dias junto) */
    update: (change: (stored: StoredReview) => StoredReview) => {
      if (!stored) return;
      void keep(change(stored));
    },
    discard: async () => {
      setStored(null);
      publish(IDLE);
      if (key) await clearReview(key);
    },
    /**
     * Grava a revisão com os lugares já achados, numa transação, e limpa o rascunho. Na viagem nova,
     * é aqui que ela nasce: a viagem, o dono, os avisos e o roteiro, de uma vez.
     */
    save: async (geo: Parameters<typeof applyGeo>[1]): Promise<SaveResult | null> => {
      if (!uid || !stored || !key) return null;
      const review = applyGeo(stored.review, geo);
      if (trip) {
        const plan = await saveImport(review, trip, uid, stored.source);
        await clearImport(trip.id);
        reset();
        return { tripId: trip.id, plan, range: null };
      }
      if (!stored.newTrip) return null;
      const out = await saveNewTrip(review, stored.newTrip.header, uid, stored.source);
      await clearImport(key);
      reset();
      return out;
    },
  };
}

/** O que a tela recebe do `useImport`. */
export type ImportState = ReturnType<typeof useImport>;
