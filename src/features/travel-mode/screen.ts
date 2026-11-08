import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { currentDay, WEEKDAYS_SHORT } from '@/lib/time/index.ts';

/**
 * As regras puras da tela da viagem (fase 14): que dia a barra do topo mostra e quando "Hoje"
 * aparece, e qual cartão ocupa o único lugar sobre a maquete quando há mais de um candidato. A tela
 * só desenha o que sai daqui; os testes conferem aqui.
 */
export type DayLike = { id: string; date: string };

export type DayBarState<T extends DayLike> = {
  /** o dia mostrado: o escolhido pelas setas, senão o de hoje (ou o próximo, ou o último) */
  day: T | null;
  /** 0, 1, 2…; -1 sem dia */
  index: number;
  total: number;
  /** "sáb, 12 dez · Dia 2" */
  label: string;
  /** o dia mostrado é o de hoje */
  isToday: boolean;
  /** "Hoje" só quando há um dia de hoje na viagem e não é ele que está na tela */
  showToday: boolean;
  canPrev: boolean;
  canNext: boolean;
};

/** "sáb, 12 dez": o dia da semana é o do app (o do date-fns em pt-BR varia e perde o acento). */
export function formatDayBar(date: string): string {
  const d = parseISO(date);
  const month = format(d, 'd MMM', { locale: ptBR }).replace(/\./g, '').toLowerCase();
  return `${WEEKDAYS_SHORT[d.getDay()] ?? ''}, ${month}`;
}

export function dayLabel(date: string, index: number): string {
  return `${formatDayBar(date)} · Dia ${String(index + 1)}`;
}

export function dayBar<T extends DayLike>(input: {
  days: readonly T[];
  today: string;
  /** o id do dia escolhido pelas setas, se a pessoa mexeu */
  overrideId: string | null;
}): DayBarState<T> {
  const sorted = [...input.days].sort((a, b) => a.date.localeCompare(b.date));
  const auto = currentDay(sorted, input.today);
  const chosen = input.overrideId ? sorted.find((d) => d.id === input.overrideId) : undefined;
  const day = chosen ?? auto;
  const index = day ? sorted.findIndex((d) => d.id === day.id) : -1;
  const todayDay = sorted.find((d) => d.date === input.today) ?? null;
  const isToday = day !== null && day.date === input.today;
  return {
    day,
    index,
    total: sorted.length,
    label: day ? dayLabel(day.date, index) : '',
    isToday,
    showToday: todayDay !== null && !isToday,
    canPrev: index > 0,
    canNext: index >= 0 && index < sorted.length - 1,
  };
}

/**
 * O que aparece sobre a maquete, um de cada vez (D83): o que acabou de acontecer vem antes da
 * pergunta que espera resposta; o pedido de posição antes do "Como foi?", porque sem posição o
 * resto do dia não anda sozinho; o convite à retrospectiva por último, porque não tem pressa.
 */
export type OverlayCard = 'since' | 'passed' | 'position' | 'memory' | 'retro';

export const OVERLAY_ORDER: readonly OverlayCard[] = [
  'since',
  'passed',
  'position',
  'memory',
  'retro',
];

export function overlayCard(available: Readonly<Record<OverlayCard, boolean>>): OverlayCard | null {
  return OVERLAY_ORDER.find((k) => available[k]) ?? null;
}
