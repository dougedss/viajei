/**
 * O horário de funcionamento como o OpenStreetMap escreve ("Tu-Su 13:00-19:00") em português ("ter a
 * dom, 13:00–19:00"), só para mostrar no cartão (fase 24). Só existe quando o mapa tem: nada se
 * inventa, e o que não se entende sai como veio.
 */
const DAYS: Readonly<Record<string, string>> = {
  Mo: 'seg',
  Tu: 'ter',
  We: 'qua',
  Th: 'qui',
  Fr: 'sex',
  Sa: 'sáb',
  Su: 'dom',
  PH: 'feriados',
};
const DAY = '(Mo|Tu|We|Th|Fr|Sa|Su|PH)';

export function openingText(raw: string): string {
  const s = raw.trim();
  if (s === '24/7') return 'todos os dias, 24 h';
  return s
    .split(/\s*;\s*/)
    .map((rule) =>
      rule
        .replace(
          new RegExp(`${DAY}-${DAY}`, 'g'),
          (_m, a: string, b: string) => `${DAYS[a] ?? a} a ${DAYS[b] ?? b}`,
        )
        .replace(new RegExp(`\\b${DAY}\\b`, 'g'), (d: string) => DAYS[d] ?? d)
        .replace(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/g, '$1–$2')
        .replace(/\boff\b/g, 'fechado')
        .replace(/^([a-zá ,]+) (\d)/, '$1, $2'),
    )
    .join(' · ');
}
