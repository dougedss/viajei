import { useEffect, useRef, useState } from 'react';
import type { Trip } from '@/lib/db/schema.ts';
import { MediaError } from '@/lib/media/index.ts';
import { StageError, stageFile, type Staged } from '@/lib/media/stage.ts';
import { dexieCnpjCache } from '@/lib/nfce/cnpj-cache.ts';
import { lookupCnpj, type Merchant } from '@/lib/nfce/cnpj.ts';
import { parseNfceQr, type NfceQr } from '@/lib/nfce/key.ts';
import { decodeQr } from '@/lib/nfce/qr.ts';
import { readReceipt } from './read.ts';
import {
  needsAi,
  suggestExpense,
  type ReceiptFacts,
  type ReceiptSuggestion,
} from './to-expense.ts';

/**
 * "Fotografar a nota" (fase 18): a foto é comprimida como o print de reserva (D80) e sobe ao Storage
 * com o id definitivo (a fila a encontra ao salvar o gasto); no aparelho, o QR da NFC-e é lido sem IA
 * (o CNPJ, e na contingência offline o dia e o total), o estabelecimento vem da BrasilAPI com cache por
 * CNPJ, e a IA lê o resto só quando falta (o total, a data, a categoria). Sem rede, a foto fica para
 * subir depois e nada é lido: a pessoa preenche, como hoje. Nada da nota passa por aqui em texto.
 */
export type ReceiptStep = 'preparing' | 'qr' | 'merchant' | 'reading';
export type ReceiptPhase =
  | { kind: 'idle' }
  | { kind: 'working'; step: ReceiptStep; staged: Staged | null }
  | {
      kind: 'done';
      staged: Staged;
      suggestion: ReceiptSuggestion;
      facts: ReceiptFacts;
      offline: boolean;
    }
  | { kind: 'error'; message: string };

export function useReceipt(trip: Pick<Trip, 'id' | 'start_date' | 'end_date'> | null) {
  const [phase, setPhase] = useState<ReceiptPhase>({ kind: 'idle' });
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const start = async (file: File): Promise<void> => {
    if (!trip) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const alive = () => abort.current === controller;
    setPhase({ kind: 'working', step: 'preparing', staged: null });
    let staged: Staged;
    let offline = false;
    try {
      staged = await stageFile(file, trip.id);
    } catch (err) {
      if (err instanceof StageError && err.reason === 'offline') {
        // sem rede: a foto fica preparada e sobe pela fila ao salvar; nada é lido agora
        try {
          staged = await stageFile(file, trip.id, { upload: false });
          offline = true;
        } catch (inner) {
          if (alive()) setPhase({ kind: 'error', message: messageOf(inner) });
          return;
        }
      } else {
        if (alive()) setPhase({ kind: 'error', message: messageOf(err) });
        return;
      }
    }
    if (!alive()) return;

    setPhase({ kind: 'working', step: 'qr', staged });
    let qr: NfceQr | null = null;
    try {
      const text = await decodeQr(file);
      qr = text ? parseNfceQr(text) : null;
    } catch {
      // uma imagem que não abre: sem QR, e a IA (com rede) lê a foto mesmo assim
    }
    if (!alive()) return;

    let merchant: Merchant | null = null;
    if (qr && !offline) {
      setPhase({ kind: 'working', step: 'merchant', staged });
      merchant = await lookupCnpj(qr.key.cnpj, {
        fetch: (i, init) => fetch(i, init),
        cache: dexieCnpjCache,
      });
      if (!alive()) return;
    }

    let ai: ReceiptFacts['ai'] = null;
    if (!offline && needsAi(qr)) {
      setPhase({ kind: 'working', step: 'reading', staged });
      ai = await readReceipt(trip.id, staged.path, controller.signal);
      if (!alive()) return;
    }
    const facts: ReceiptFacts = { qr, merchant, ai };
    setPhase({ kind: 'done', staged, suggestion: suggestExpense(facts, trip), facts, offline });
  };

  return {
    phase,
    start,
    /** tira a foto antes de salvar (o objeto que já subiu sai pelo expurgo dos órfãos) */
    reset: () => {
      abort.current?.abort();
      abort.current = null;
      setPhase({ kind: 'idle' });
    },
  };
}

function messageOf(err: unknown): string {
  if (err instanceof MediaError || err instanceof StageError) return err.message;
  return 'Não deu para preparar a foto.';
}
