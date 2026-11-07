/** Datas curtas do clima, sem passar por `Date` local (nada de fuso): "sex", "26/11". */
const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

export function weekdayShortOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return WEEKDAYS_SHORT[d.getUTCDay()] ?? '';
}

export function dayMonthOf(date: string): string {
  const [, m, d] = date.split('-');
  return m && d ? `${d}/${m}` : '';
}
