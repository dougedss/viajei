import { useEffect, useRef, useState } from 'react';
import type { ImportErrorCode, ImportEvent } from '@shared/import-protocol.ts';
import { READ_FN, readConfirmationSchema, type ReadConfirmation } from '@shared/read-protocol.ts';
import { ImportFailure, streamEvents } from '@/features/import/client.ts';
import { connectivity } from '@/lib/db/connectivity.ts';
import { partialName } from './to-form.ts';

/**
 * A leitura de uma confirmação pela `read-document` (fase 18): o texto colado e/ou o anexo que já
 * subiu ao Storage vão para a função, e o nome da reserva aparece enquanto o JSON chega. Termina em
 * `done` (a reserva lida, para o formulário) ou em erro (com a frase da tela). Cancelar aborta o
 * pedido; a função aborta a IA e registra `canceled`.
 */
export type ReadPhase =
  | { kind: 'idle' }
  | { kind: 'reading'; name: string | null }
  | { kind: 'done'; data: ReadConfirmation; importId: string | null }
  | { kind: 'error'; code: ImportErrorCode | 'offline'; retryAt: string | null };

export type ReadInput = { text: string | null; attachment: { path: string } | null };

export function useReadConfirmation(tripId: string | null) {
  const [phase, setPhase] = useState<ReadPhase>({ kind: 'idle' });
  const abort = useRef<AbortController | null>(null);
  const raw = useRef('');
  const importId = useRef<string | null>(null);

  // sair da tela cancela a leitura em andamento
  useEffect(() => () => abort.current?.abort(), []);

  const onEvent = (event: ImportEvent) => {
    switch (event.type) {
      case 'start':
        importId.current = event.id;
        break;
      case 'delta': {
        raw.current += event.text;
        const name = partialName(raw.current);
        setPhase((prev) =>
          prev.kind === 'reading' && prev.name === name ? prev : { kind: 'reading', name },
        );
        break;
      }
      case 'done': {
        const parsed = readConfirmationSchema.safeParse(event.data);
        setPhase(
          parsed.success
            ? { kind: 'done', data: parsed.data, importId: importId.current }
            : { kind: 'error', code: 'invalid', retryAt: null },
        );
        break;
      }
      case 'error':
        setPhase({ kind: 'error', code: event.code, retryAt: null });
        break;
    }
  };

  const read = async (input: ReadInput): Promise<void> => {
    if (!input.text?.trim() && !input.attachment) return;
    if (!connectivity.isOnline()) {
      setPhase({ kind: 'error', code: 'offline', retryAt: null });
      return;
    }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    raw.current = '';
    importId.current = null;
    setPhase({ kind: 'reading', name: null });
    try {
      await streamEvents(
        READ_FN,
        {
          kind: 'confirmation',
          trip_id: tripId,
          text: input.text?.trim() ? input.text : null,
          attachment: input.attachment,
        },
        controller.signal,
        onEvent,
      );
      // o stream fechou sem dizer como terminou: a conexão caiu no fim
      setPhase((prev) =>
        prev.kind === 'reading' ? { kind: 'error', code: 'failed', retryAt: null } : prev,
      );
    } catch (err) {
      if (err instanceof ImportFailure && err.code === 'canceled') {
        setPhase({ kind: 'idle' });
        return;
      }
      setPhase({
        kind: 'error',
        code: err instanceof ImportFailure ? err.code : 'failed',
        retryAt: err instanceof ImportFailure ? err.retryAt : null,
      });
    } finally {
      if (abort.current === controller) abort.current = null;
    }
  };

  return {
    phase,
    read,
    /** a pessoa desistiu: o pedido é abortado e a tela volta ao texto */
    cancel: () => abort.current?.abort(),
    /** volta ao texto (depois de um erro, ou para ler outra) */
    reset: () => {
      abort.current?.abort();
      setPhase({ kind: 'idle' });
    },
  };
}
