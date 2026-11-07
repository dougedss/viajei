import type { StopKind } from '@shared/constants.ts';
import type { ChecklistItem, Stop } from '@/lib/db/schema.ts';
import type { SceneryKind } from '@/lib/geo/segments.ts';
import { uuidV5 } from '@/lib/ids/uuid.ts';
import { normalizeText } from './rules.ts';

/**
 * Sugestões por regra, calculadas e não gravadas. Só a ação da pessoa grava, com id determinístico:
 * missão `v5(stop_id, 'quest:' || regra)`, item de mala `v5(trip_id, 'pack:' || regra)`. "Adicionar"
 * grava ativo; "Dispensar" grava `status = 'dismissed'`, uma linha viva: a lápide (`deleted_at`)
 * some do aparelho no pull, e a sugestão voltaria. Desfazer o "Dispensar" devolve `suggested`: a
 * linha continua viva e volta a aparecer como sugestão (é também como a IA da fase 10 propõe). Gravar a sugestão antes da ação faria dois
 * aparelhos criarem a mesma linha, e um deles ressuscitaria a que o outro dispensou.
 *
 * Os textos de missão não levam o nome da parada: "na Cascata", "no Park", "nas Cascatas" pediriam
 * deduzir o artigo pelo nome (D43). A parada aparece embaixo da missão.
 */
export type QuestRule = { rule: string; text: string; points: number };
export type PackRule = {
  rule: string;
  text: string;
  /** palavras que, numa linha da mala, já cobrem a sugestão ("Blusa fina" cobre "Blusa") */
  covers: readonly string[];
};

/** Nenhuma missão premia velocidade nem exige quem dirige; vinícola registra rótulo e foto, nunca consumo. */
export const QUEST_RULES: Partial<Record<StopKind, QuestRule>> = {
  nature: { rule: 'nature', text: 'Foto do time com a paisagem', points: 20 },
  winery: { rule: 'winery', text: 'Registrar o rótulo preferido, com foto', points: 20 },
  food: { rule: 'food', text: 'Provar o prato da casa', points: 15 },
  city: { rule: 'city', text: 'Um cartão-postal na foto', points: 15 },
  event: { rule: 'event', text: 'A foto do momento', points: 10 },
};

export const PACK_RULES = {
  sunscreen: { rule: 'sunscreen', text: 'Protetor solar', covers: ['protetor', 'filtro solar'] },
  swimwear: {
    rule: 'swimwear',
    text: 'Roupa de banho',
    covers: ['roupa de banho', 'biquini', 'sunga', 'maio'],
  },
  warm: {
    rule: 'warm',
    text: 'Blusa',
    covers: ['blusa', 'casaco', 'agasalho', 'jaqueta', 'moletom', 'suéter', 'sueter'],
  },
  grip: {
    rule: 'grip',
    text: 'Calçado com aderência',
    covers: ['calcado', 'tenis', 'bota'],
  },
  repellent: { rule: 'repellent', text: 'Repelente', covers: ['repelente'] },
} as const satisfies Record<string, PackRule>;
export type PackRuleKey = keyof typeof PACK_RULES;

export type Suggestion = {
  id: string;
  kind: 'quest' | 'pack';
  rule: string;
  text: string;
  points: number;
  stop_id: string | null;
  /** por que a sugestão apareceu ("serra no dia 1"); a missão diz a parada */
  reason: string;
};

type StopLike = Pick<
  Stop,
  'id' | 'kind' | 'name' | 'deleted_at' | 'skipped' | 'done_at' | 'trip_day_id'
>;
type ItemLike = Pick<
  ChecklistItem,
  'id' | 'kind' | 'text' | 'status' | 'deleted_at' | 'stop_id' | 'trip_id' | 'points'
>;

/** A leitura do lugar de cada dia que tem rota guardada no aparelho: o índice do dia e os cenários. */
export type DayScenery = { dayIndex: number; kinds: readonly SceneryKind[] };

export function questId(stopId: string, rule: string): Promise<string> {
  return uuidV5(stopId, `quest:${rule}`);
}

export function packId(tripId: string, rule: string): Promise<string> {
  return uuidV5(tripId, `pack:${rule}`);
}

/**
 * As missões candidatas: uma por parada, pela regra do tipo dela. Parada concluída, pulada ou que já
 * tem missão viva (de qualquer origem) não ganha sugestão; origem, deslocamento, hotel e "outro" não
 * têm regra.
 */
export function questCandidates(
  stops: readonly StopLike[],
  items: readonly ItemLike[],
): { stop: StopLike; rule: QuestRule }[] {
  const withQuest = new Set(
    items
      .filter((i) => i.kind === 'quest' && i.deleted_at === null && i.status === 'active')
      .flatMap((i) => (i.stop_id ? [i.stop_id] : [])),
  );
  return stops.flatMap((stop) => {
    const rule = QUEST_RULES[stop.kind as StopKind];
    if (!rule || stop.deleted_at !== null || stop.skipped || stop.done_at !== null) return [];
    if (withQuest.has(stop.id)) return [];
    return [{ stop, rule }];
  });
}

/**
 * Os itens de mala candidatos: praia (protetor e roupa de banho) e serra (blusa e calçado com
 * aderência) pela leitura do lugar das rotas guardadas; repelente por parada de natureza. Uma linha
 * da mala que já cobre a sugestão (a mesma palavra-chave, sem acento) segura a sugestão.
 */
export function packCandidates(
  scenery: readonly DayScenery[],
  stops: readonly StopLike[],
  items: readonly ItemLike[],
): { rule: PackRule; reason: string }[] {
  const firstDayWith = (kind: SceneryKind) =>
    scenery
      .filter((d) => d.kinds.includes(kind))
      .map((d) => d.dayIndex)
      .sort((a, b) => a - b)[0];
  const out: { rule: PackRule; reason: string }[] = [];
  const beach = firstDayWith('beach');
  if (beach !== undefined) {
    const reason = `praia no dia ${beach}`;
    out.push({ rule: PACK_RULES.sunscreen, reason }, { rule: PACK_RULES.swimwear, reason });
  }
  const serra = firstDayWith('serra');
  if (serra !== undefined) {
    const reason = `serra no dia ${serra}`;
    out.push({ rule: PACK_RULES.warm, reason }, { rule: PACK_RULES.grip, reason });
  }
  if (stops.some((s) => s.deleted_at === null && s.kind === 'nature')) {
    out.push({ rule: PACK_RULES.repellent, reason: 'tem parada de natureza' });
  }
  const pack = items
    .filter((i) => i.kind === 'pack' && i.deleted_at === null && i.status === 'active')
    .map((i) => normalizeText(i.text));
  return out.filter(({ rule }) => !pack.some((text) => coveredBy(text, rule)));
}

function coveredBy(text: string, rule: PackRule): boolean {
  return rule.covers.some((word) => {
    const w = normalizeText(word);
    return new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'u').test(text);
  });
}

/**
 * As sugestões que aparecem: as candidatas cujo id determinístico não está numa linha respondida
 * (ativa ou dispensada), mais as linhas que estão como `suggested` (o desfazer do "Dispensar" e, na
 * fase 10, as da IA). Assíncrono só pelo SHA-1 do v5.
 */
export async function pendingSuggestions(input: {
  tripId: string;
  stops: readonly StopLike[];
  items: readonly ItemLike[];
  scenery: readonly DayScenery[];
  dayIndex: ReadonlyMap<string, number>;
}): Promise<Suggestion[]> {
  const live = input.items.filter((i) => i.deleted_at === null);
  const answered = new Set(live.filter((i) => i.status !== 'suggested').map((i) => i.id));
  const stopOf = new Map(input.stops.map((s) => [s.id, s]));
  const quests = await Promise.all(
    questCandidates(input.stops, input.items).map(async ({ stop, rule }) => ({
      id: await questId(stop.id, rule.rule),
      kind: 'quest' as const,
      rule: rule.rule,
      text: rule.text,
      points: rule.points,
      stop_id: stop.id,
      reason: dayLabel(input.dayIndex.get(stop.trip_day_id), stop.name),
    })),
  );
  const packs = await Promise.all(
    packCandidates(input.scenery, input.stops, input.items).map(async ({ rule, reason }) => ({
      id: await packId(input.tripId, rule.rule),
      kind: 'pack' as const,
      rule: rule.rule,
      text: rule.text,
      points: 0,
      stop_id: null,
      reason,
    })),
  );
  const computed: Suggestion[] = [...quests, ...packs].filter((s) => !answered.has(s.id));
  const shown = new Set(computed.map((s) => s.id));
  const fromRows: Suggestion[] = live
    .filter((i) => i.status === 'suggested' && !shown.has(i.id))
    .flatMap((i): Suggestion[] => {
      if (i.kind !== 'quest' && i.kind !== 'pack') return [];
      const stop = i.stop_id ? stopOf.get(i.stop_id) : undefined;
      if (i.stop_id && stop?.deleted_at !== null) return [];
      return [
        {
          id: i.id,
          kind: i.kind,
          rule: '',
          text: i.text,
          points: i.points,
          stop_id: i.stop_id,
          reason: stop ? dayLabel(input.dayIndex.get(stop.trip_day_id), stop.name) : 'sugestão',
        },
      ];
    });
  return [...computed, ...fromRows];
}

function dayLabel(index: number | undefined, name: string): string {
  return index === undefined ? name : `dia ${index} · ${name}`;
}
