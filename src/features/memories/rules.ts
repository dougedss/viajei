import { isDepartureNode } from '@/features/travel-mode/rules.ts';
import { comparePosition } from '@/lib/ids/position.ts';
import type { Stop, StopMemory, TripDay } from '@/lib/db/schema.ts';
import type { MediaItem } from '@/lib/media/hooks.ts';

/**
 * As regras puras das memórias: quando a folha "Como foi?" abre sozinha e quando vira um card,
 * quais cards aparecem, e o diário montado a partir das paradas, das memórias e das fotos.
 */

/** De onde veio o Chegamos!. Só o toque na tela, fora do modo painel, abre a folha sozinha. */
export type ArrivalSource = 'tap' | 'panel' | 'catchup' | 'question' | 'notification' | 'remote';

/** A folha abre 1,2 s depois do confete: dá tempo de ver a festa. */
export const SHEET_DELAY_MS = 1200;

export type PromptDecision = 'sheet' | 'card' | 'none';

/**
 * Nunca por cima de quem dirige: com o modo painel ligado, ou quando o Chegamos! veio da
 * notificação, do catch-up automático, da pergunta "vocês passaram por…" ou de outro membro, a
 * folha não abre sozinha; vira um card discreto. Nó de saída não tem "como foi".
 */
export function memoryPrompt(input: {
  source: ArrivalSource;
  panelOn: boolean;
  stop: Pick<Stop, 'kind'>;
  answered: boolean;
}): PromptDecision {
  if (isDepartureNode(input.stop) || input.answered) return 'none';
  return input.source === 'tap' && !input.panelOn ? 'sheet' : 'card';
}

/**
 * As paradas que ainda pedem "Como foi?" neste aparelho: concluídas, que não são saída, sem memória
 * da pessoa e não dispensadas. A mais recente primeiro; a tela mostra uma por vez.
 */
export function pendingPrompts(
  stops: readonly Stop[],
  answered: ReadonlySet<string>,
  dismissed: ReadonlySet<string>,
  exclude: string | null = null,
): Stop[] {
  return stops
    .filter(
      (s) =>
        s.deleted_at === null &&
        s.done_at !== null &&
        !s.skipped &&
        !isDepartureNode(s) &&
        !answered.has(s.id) &&
        !dismissed.has(s.id) &&
        s.id !== exclude,
    )
    .sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''));
}

/** Quem já respondeu: a linha de memória viva (mesmo só com fotos, a linha é gravada). */
export function answeredStops(memories: readonly StopMemory[], uid: string): Set<string> {
  return new Set(
    memories.filter((m) => m.user_id === uid && m.deleted_at === null).map((m) => m.stop_id),
  );
}

/** Nada para salvar: sem nota, sem texto e sem foto. */
export function isEmptyMemory(input: { rating: number | null; memo: string; photos: number }) {
  return input.rating === null && input.memo.trim() === '' && input.photos === 0;
}

// ------------------------------------------------------------------ diário
export type DiaryMemory = {
  user_id: string;
  rating: number | null;
  memo: string | null;
  photos: MediaItem[];
};

export type DiaryEntry = {
  stop: Stop;
  /** nó de saída: aparece como linha discreta, sem memória */
  departure: boolean;
  /** a hora real (done_at) */
  at: string;
  by: string | null;
  memories: DiaryMemory[];
};

export type DiaryDay = {
  day: TripDay;
  /** 1, 2, 3… na ordem das datas */
  index: number;
  entries: DiaryEntry[];
  /** todas as fotos do dia, na ordem das entradas: o visualizador desliza entre elas */
  photos: MediaItem[];
};

/**
 * A linha do tempo do diário: por dia, as paradas concluídas na ordem da hora real, com as memórias
 * do time inteiro (nota, texto e fotos de cada pessoa). A própria pessoa vem primeiro em cada
 * parada; os outros, na ordem em que escreveram.
 */
export function buildDiary(
  days: readonly TripDay[],
  stops: readonly Stop[],
  memories: readonly StopMemory[],
  media: readonly MediaItem[],
  uid: string,
): DiaryDay[] {
  const ordered = [...days]
    .filter((d) => d.deleted_at === null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const out: DiaryDay[] = [];
  ordered.forEach((day, i) => {
    const done = stops
      .filter((s) => s.trip_day_id === day.id && s.deleted_at === null && s.done_at !== null)
      .sort(
        (a, b) =>
          (a.done_at ?? '').localeCompare(b.done_at ?? '') ||
          comparePosition(a.position, b.position),
      );
    if (done.length === 0) return;
    const entries = done.map((stop): DiaryEntry => {
      const people = new Map<string, DiaryMemory>();
      const person = (id: string) => {
        let m = people.get(id);
        if (!m) {
          m = { user_id: id, rating: null, memo: null, photos: [] };
          people.set(id, m);
        }
        return m;
      };
      for (const m of memories) {
        if (m.stop_id !== stop.id || m.deleted_at !== null) continue;
        const p = person(m.user_id);
        p.rating = m.rating;
        p.memo = m.memo;
      }
      for (const item of media) {
        if (item.row.stop_id !== stop.id || item.row.kind !== 'photo') continue;
        person(item.row.created_by).photos.push(item);
      }
      const list = [...people.values()]
        .filter((p) => p.rating !== null || (p.memo ?? '') !== '' || p.photos.length > 0)
        .sort((a, b) => Number(b.user_id === uid) - Number(a.user_id === uid));
      return {
        stop,
        departure: isDepartureNode(stop),
        at: stop.done_at ?? '',
        by: stop.done_by,
        memories: list,
      };
    });
    out.push({
      day,
      index: i + 1,
      entries,
      photos: entries.flatMap((e) => e.memories.flatMap((m) => m.photos)),
    });
  });
  return out;
}
