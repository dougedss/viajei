import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { IMPORT_DAILY_LIMIT, IMPORT_FN, IMPORT_MAX_CHARS } from '@shared/import-protocol.ts';
import type { ImportEvent } from '@shared/import-protocol.ts';
import type { ImportData } from '@shared/import-schema.ts';
import { useOnline } from '@/lib/db/connectivity.ts';
import type { Trip } from '@/lib/db/schema.ts';
import { supabase } from '@/lib/supabase/client.ts';
import { ImportFailure, streamImport } from './client.ts';
import {
  clearImport,
  clearReview,
  loadDraft,
  loadReview,
  saveDraft,
  saveReview,
  type StoredReview,
} from './draft.ts';
import { applyGeo } from './geocode.ts';
import { reviewOf, type ImportPlan, type Review } from './plan.ts';
import {
  EMPTY_PREVIEW,
  failWith,
  IDLE,
  partialImport,
  previewOf,
  reduceImport,
  type ImportSession,
  type Preview,
} from './preview.ts';
import { readExisting, saveImport } from './save.ts';

export type ImportTrip = Pick<Trip, 'id' | 'name' | 'start_date' | 'end_date' | 'origin'>;

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

/**
 * A importação de uma viagem, do texto colado à revisão salva. O rascunho e a revisão moram no
 * aparelho (`draft.ts`); a leitura é um stream da função, e o preview é refeito do JSON acumulado no
 * máximo uma vez por quadro. Nada é salvo na viagem sem `save`, que passa pela outbox.
 */
export function useImport(trip: ImportTrip | null, uid: string | null) {
  const tripId = trip?.id ?? null;
  const online = useOnline();
  const queryClient = useQueryClient();
  const [loaded, setLoaded] = useState(false);
  const [text, setTextState] = useState('');
  const [view, setView] = useState<View>(IDLE_VIEW);
  const [stored, setStored] = useState<StoredReview | null>(null);
  const quota = useImportQuota(online && loaded && stored === null);

  // a sessão viva fica num ref: os eventos chegam fora do render, e o render lê o espelho em `view`
  const live = useRef<ImportSession>(IDLE);
  const pending = useRef('');
  const frame = useRef<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const latestText = useRef('');
  /** o registro da leitura em andamento (o `start`), que a revisão guarda */
  const importId = useRef<string | null>(null);

  // o rascunho e a revisão guardados, ao abrir a viagem
  useEffect(() => {
    if (!tripId) return;
    let alive = true;
    void Promise.all([loadDraft(tripId), loadReview(tripId)]).then(([draft, review]) => {
      if (!alive) return;
      latestText.current = draft;
      setTextState(draft);
      setStored(review);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [tripId]);

  // o texto vai para o aparelho numa pausa da digitação, e ao sair da tela
  useEffect(() => {
    if (!tripId || !loaded) return;
    const t = setTimeout(() => void saveDraft(tripId, text), 300);
    return () => clearTimeout(t);
  }, [tripId, loaded, text]);
  useEffect(() => {
    if (!tripId) return;
    return () => {
      void saveDraft(tripId, latestText.current);
      abort.current?.abort();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [tripId]);

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
    if (tripId) await saveReview(tripId, next);
  };

  const startReview = async (data: ImportData, id: string | null, partial: boolean) => {
    if (!trip) return;
    const review = reviewOf(data, await readExisting(trip));
    await keep({ review, importId: id, partial, saved_at: new Date().toISOString() });
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
    if (next.phase.kind === 'review') void startReview(next.phase.data, next.phase.id, false);
  };

  const read = async () => {
    if (!trip || text.trim() === '' || text.length > IMPORT_MAX_CHARS) return;
    if (!online) {
      publish(failWith(IDLE, 'offline'));
      return;
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
          trip_id: trip.id,
          text,
          trip: {
            name: trip.name,
            start_date: trip.start_date,
            end_date: trip.end_date,
            origin: trip.origin,
          },
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
  };

  return {
    loaded,
    online,
    text,
    setText: (value: string) => {
      latestText.current = value;
      setTextState(value);
    },
    session: view.session,
    preview: view.preview,
    remaining: quota.data ?? null,
    stored,
    read,
    /** a pessoa desistiu: o pedido é abortado, a função aborta a IA e registra `canceled` */
    cancel: () => abort.current?.abort(),
    /** volta ao texto, sem a mensagem de erro */
    dismiss: () => publish(IDLE),
    /** o que chegou antes de um corte, como revisão (só os itens que chegaram inteiros) */
    reviewPartial: async () => {
      const data = partialImport(live.current.raw);
      if (data) await startReview(data, importId.current, true);
    },
    edit: (change: (review: Review) => Review) => {
      if (!stored) return;
      void keep({ ...stored, review: change(stored.review) });
    },
    discard: async () => {
      setStored(null);
      publish(IDLE);
      if (tripId) await clearReview(tripId);
    },
    /** grava na viagem a revisão com os lugares já achados, numa transação, e limpa o rascunho */
    save: async (geo: Parameters<typeof applyGeo>[1]): Promise<ImportPlan | null> => {
      if (!trip || !uid || !stored) return null;
      const plan = await saveImport(applyGeo(stored.review, geo), trip, uid, 'ai');
      await clearImport(trip.id);
      latestText.current = '';
      setTextState('');
      setStored(null);
      publish(IDLE);
      return plan;
    },
  };
}
