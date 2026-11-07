import { beforeEach, describe, expect, it } from 'vitest';
import { IMPORT_MAX_CHARS } from '@shared/import-protocol.ts';
import { db } from '@/lib/db/schema.ts';
import { makeTrip, TRIP_ID } from '@/test/factories.ts';
import {
  clampDraft,
  clearImport,
  clearReview,
  draftKeys,
  loadDraft,
  loadReview,
  parseStoredReview,
  saveDraft,
  saveReview,
  type StoredReview,
} from './draft.ts';
import { reviewOf } from './plan.ts';

const OTHER_TRIP = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function stored(): StoredReview {
  const review = reviewOf(
    {
      days: [],
      reservations: [],
      contacts: [],
      checklist_before: ['Comprar o ingresso'],
      checklist_pack: [],
      quests: [],
      unclassified: [],
    },
    { trip: makeTrip(), days: [], stops: [], reservations: [], contacts: [], items: [] },
  );
  return { review, importId: null, partial: false, saved_at: '2026-11-20T12:00:00.000Z' };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('o rascunho da importação', () => {
  it('o texto fica no aparelho, por viagem', async () => {
    await saveDraft(TRIP_ID, 'Sexta 7h saída de Curitiba');
    await saveDraft(OTHER_TRIP, 'outro roteiro');
    expect(await loadDraft(TRIP_ID)).toBe('Sexta 7h saída de Curitiba');
    expect(await loadDraft(OTHER_TRIP)).toBe('outro roteiro');
    expect(await loadDraft('cccccccc-cccc-4ccc-8ccc-cccccccccccc')).toBe('');
    // no Dexie, que "Sair da conta" apaga inteiro; nunca no localStorage
    expect((await db.sync_state.get(draftKeys.text(TRIP_ID)))?.value).toBe(
      'Sexta 7h saída de Curitiba',
    );
    expect(window.localStorage.length).toBe(0);
  });

  it('apagar o texto apaga o rascunho; acima do limite guarda só o que a leitura aceita', async () => {
    await saveDraft(TRIP_ID, 'algo');
    await saveDraft(TRIP_ID, '');
    expect(await db.sync_state.get(draftKeys.text(TRIP_ID))).toBeUndefined();
    expect(clampDraft('x'.repeat(IMPORT_MAX_CHARS + 10))).toHaveLength(IMPORT_MAX_CHARS);
  });

  it('a revisão em andamento volta igual depois de fechar o app', async () => {
    await saveReview(TRIP_ID, stored());
    expect(await loadReview(TRIP_ID)).toEqual(stored());
    await clearReview(TRIP_ID);
    expect(await loadReview(TRIP_ID)).toBeNull();
  });

  it('salvar na viagem limpa o texto e a revisão daquela viagem só', async () => {
    await saveDraft(TRIP_ID, 'texto');
    await saveReview(TRIP_ID, stored());
    await saveDraft(OTHER_TRIP, 'fica');
    await clearImport(TRIP_ID);
    expect(await loadDraft(TRIP_ID)).toBe('');
    expect(await loadReview(TRIP_ID)).toBeNull();
    expect(await loadDraft(OTHER_TRIP)).toBe('fica');
  });

  it('um valor que não é revisão (formato antigo, JSON quebrado) vira "sem revisão"', () => {
    expect(parseStoredReview(undefined)).toBeNull();
    expect(parseStoredReview('{')).toBeNull();
    expect(parseStoredReview(JSON.stringify({ review: { days: 'x' } }))).toBeNull();
    expect(parseStoredReview(JSON.stringify(stored()))).toEqual(stored());
  });
});
