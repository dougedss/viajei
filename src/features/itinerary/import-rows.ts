import { QUEST_POINTS_DEFAULT, type ChecklistKind, type StopKind } from '@shared/constants.ts';
import type { ImportData } from '@shared/import-schema.ts';
import { toE164 } from '@shared/phone.ts';
import { QUEST_RULES } from '@/features/checklists/suggestions.ts';
import type { ChecklistItem, Contact, Stop } from '@/lib/db/schema.ts';
import { positionsBetween } from '@/lib/ids/position.ts';

/**
 * Contatos, listas e missões do arquivo de importação como colunas. Puro, sem efeito colateral: a
 * importação com IA e o carregador do exemplo passam por aqui (`features/import/plan.ts`). Id,
 * viagem, autoria e carimbos são de quem grava (como em `reservationFromImport`).
 */
export type ImportedContactRow = Pick<Contact, 'name' | 'phone' | 'type' | 'notes'>;
export type ImportedItemRow = Pick<
  ChecklistItem,
  'kind' | 'text' | 'position' | 'points' | 'stop_id' | 'source' | 'status'
>;

/** Contato sem telefone que vire E.164 fica de fora: a tabela exige o número. */
export function contactsFromImport(contacts: ImportData['contacts']): ImportedContactRow[] {
  return contacts.flatMap((c) => {
    const phone = c.phone ? toE164(c.phone) : null;
    if (!phone?.ok || c.name.trim() === '') return [];
    return [
      {
        name: c.name.trim().slice(0, 120),
        phone: phone.e164,
        type: c.type,
        notes: c.notes?.slice(0, 500) ?? null,
      },
    ];
  });
}

/**
 * Antes, mala e missões, cada lista depois das posições que já existem nela. A missão se liga à
 * parada pelo nome (`stop_ref`) e vale os pontos da regra do tipo da parada; sem parada, 10.
 * `source`: 'ai' quando a lista veio de uma importação com IA, já revisada pela pessoa no preview
 * (por isso `active`, e não `suggested`); 'user' no carregador do exemplo.
 */
export function listItemsFromImport(
  data: Pick<ImportData, 'checklist_before' | 'checklist_pack' | 'quests'>,
  stops: readonly Pick<Stop, 'id' | 'name' | 'kind' | 'deleted_at'>[],
  lastPosition: Partial<Record<ChecklistKind, string | null>> = {},
  source: 'user' | 'ai' = 'user',
): ImportedItemRow[] {
  const norm = (s: string) => s.trim().toLocaleLowerCase('pt-BR');
  const plain = (kind: 'before' | 'pack', texts: readonly string[]): ImportedItemRow[] => {
    const clean = texts.map((t) => t.trim().slice(0, 200)).filter((t) => t !== '');
    const positions = positionsBetween(lastPosition[kind] ?? null, null, clean.length);
    return clean.map((text, i) => ({
      kind,
      text,
      position: positions[i] ?? '',
      points: 0,
      stop_id: null,
      source,
      status: 'active',
    }));
  };
  const quests = data.quests.filter((q) => q.text.trim() !== '');
  const questPositions = positionsBetween(lastPosition.quest ?? null, null, quests.length);
  return [
    ...plain('before', data.checklist_before),
    ...plain('pack', data.checklist_pack),
    ...quests.map((q, i): ImportedItemRow => {
      const stop = q.stop_ref
        ? stops.find((s) => s.deleted_at === null && norm(s.name) === norm(q.stop_ref ?? ''))
        : undefined;
      return {
        kind: 'quest',
        text: q.text.trim().slice(0, 200),
        position: questPositions[i] ?? '',
        points: (stop && QUEST_RULES[stop.kind as StopKind]?.points) ?? QUEST_POINTS_DEFAULT,
        stop_id: stop?.id ?? null,
        source,
        status: 'active',
      };
    }),
  ];
}
