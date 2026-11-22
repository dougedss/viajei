/**
 * O tempo que a pessoa tem, em minutos (fase 26, a 3.3): a parte do dia que ela disse ("a tarde",
 * "antes do almoço") vale um número de minutos para a conta do passeio todo (a estrada mais o tempo
 * nos lugares). A tabela é uma só, para a IA (que lê o pedido e entrega `tempo_min`) e para o app
 * (que lê a resposta à pergunta "Quanto tempo vocês têm?") contarem igual. A decisão da fase 26
 * (D302): a manhã 4 h, a tarde 5 h, até a noite 10 h, o dia 10 h, até amanhã sem teto; as horas
 * ditas valem como ditas.
 */
export type DaySpan = 'morning' | 'afternoon' | 'evening' | 'day' | 'overnight';

/** Os minutos de cada parte do dia; `null` é sem teto (uma noite fora). */
export const SPAN_MINUTES: Readonly<Record<DaySpan, number | null>> = {
  morning: 240,
  afternoon: 300,
  evening: 600,
  day: 600,
  overnight: null,
};

/** A hora do dia dita para um passo (D289) e a janela em que ele tem de cair (a 3.3), em minutos do dia. */
export const DAY_TIME_WINDOWS: Readonly<
  Record<'manha' | 'almoco' | 'tarde' | 'noite', { from: number; to: number; label: string }>
> = {
  manha: { from: 0, to: 12 * 60, label: 'de manhã' },
  almoco: { from: 11 * 60 + 30, to: 14 * 60, label: 'no almoço' },
  tarde: { from: 12 * 60, to: 18 * 60, label: 'à tarde' },
  noite: { from: 18 * 60, to: 24 * 60, label: 'à noite' },
};

/** "4 h 10", "50 min": minutos em palavras curtas, para a tela e para a IA. */
export function minutesText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${String(m)} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${String(h)} h` : `${String(h)} h ${String(rest).padStart(2, '0')}`;
}

/** A tabela em texto, para o prompt do planejador dizer à IA quanto vale cada parte do dia. */
export function spanMinutesTable(): string {
  return [
    `a manhã (ou "antes do almoço", "cedo") ${String(SPAN_MINUTES.morning)}`,
    `a tarde ${String(SPAN_MINUTES.afternoon)}`,
    `até a noite ou o dia ${String(SPAN_MINUTES.day)}`,
    'até amanhã (dormir fora) 0 (sem teto)',
  ].join('; ');
}
